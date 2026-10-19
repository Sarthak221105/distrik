-- Rules that must never depend on an AI prompt or an app bug (PRD 6, 8, 9).
-- All run as security definer with a fixed search_path.

-- ---------------------------------------------------------------------------
-- Audit and notification primitives
-- ---------------------------------------------------------------------------
create or replace function public.write_audit(
  p_manufacturer uuid, p_action text, p_entity text, p_entity_id uuid, p_details jsonb default '{}'::jsonb
)
returns void
language sql security definer
set search_path = public
as $$
  insert into public.audit_log (manufacturer_id, actor_id, actor_role, action, entity, entity_id, details)
  values (p_manufacturer, auth.uid(), nullif(public.auth_role(), ''), p_action, p_entity, p_entity_id,
          coalesce(p_details, '{}'::jsonb));
$$;

-- Writes notification rows (deduped per user and key) and queues delivery for
-- web push and email. Realtime pushes the rows to open sessions.
create or replace function public.notify_users(
  p_manufacturer uuid,
  p_user_ids uuid[],
  p_kind text,
  p_title text,
  p_body text,
  p_link text,
  p_dedupe_key text default null,
  p_channels text[] default '{in_app}',
  p_data jsonb default '{}'::jsonb
)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
  v_user uuid;
begin
  if p_user_ids is null then
    return 0;
  end if;
  foreach v_user in array p_user_ids loop
    insert into public.notifications (manufacturer_id, user_id, kind, title, body, link, dedupe_key, channels, data)
    values (p_manufacturer, v_user, p_kind, p_title, p_body, p_link, p_dedupe_key, p_channels, coalesce(p_data, '{}'::jsonb))
    on conflict (user_id, dedupe_key) do nothing
    returning id into v_id;
    if v_id is not null then
      v_count := v_count + 1;
      if p_channels && array['push', 'email'] then
        perform pgmq.send('notifications', jsonb_build_object('notification_id', v_id));
      end if;
    end if;
    v_id := null;
  end loop;
  return v_count;
end
$$;

create or replace function public.tenant_users(p_manufacturer uuid, p_roles public.app_role[])
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(user_id), '{}')
  from public.profiles
  where manufacturer_id = p_manufacturer and active and role = any (p_roles)
$$;

create or replace function public.ops_users()
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(user_id), '{}') from public.profiles where role = 'ops_admin' and active
$$;

-- ---------------------------------------------------------------------------
-- evaluate_offer: the only code path that produces a price for a buyer.
-- accept          when requested >= floor
-- needs_approval  when below floor but >= hard minimum
-- reject          when below hard minimum
-- Always returns the floor as the counter price.
-- ---------------------------------------------------------------------------
create or replace function public.evaluate_offer(p_product uuid, p_qty integer, p_requested_paise bigint)
returns table (
  decision text,
  floor_paise bigint,
  reason text,
  hard_minimum_paise bigint,
  tier_qty_from integer,
  rule_snapshot jsonb
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_rule public.discount_rules%rowtype;
  v_floor bigint;
  v_hard bigint;
  v_cap_floor bigint;
  v_snapshot jsonb;
  v_min_tier integer;
begin
  select * into v_product from public.products where id = p_product;
  if not found then
    return query select 'reject'::text, null::bigint, 'product_not_found'::text, null::bigint, null::integer, '{}'::jsonb;
    return;
  end if;

  if not public.is_trusted() and v_product.manufacturer_id is distinct from public.auth_mid() then
    perform public.app_error('forbidden', 'Product belongs to another manufacturer', 'product_id');
  end if;

  if v_product.status <> 'active' then
    return query select 'reject'::text, null::bigint, 'product_inactive'::text, null::bigint, null::integer, '{}'::jsonb;
    return;
  end if;

  -- Tier for the quantity: highest qty_from that the quantity reaches.
  select * into v_rule from public.discount_rules
  where product_id = p_product and qty_from <= greatest(coalesce(p_qty, 0), 0)
  order by qty_from desc
  limit 1;

  if found then
    v_floor := v_rule.floor_price_paise;
    v_hard := v_rule.hard_minimum_paise;
    -- The discount cap from the distributor price can raise the floor.
    if v_rule.max_discount_pct is not null and v_product.distributor_price_paise is not null then
      v_cap_floor := ceil(v_product.distributor_price_paise * (100 - v_rule.max_discount_pct) / 100.0)::bigint;
      v_floor := greatest(v_floor, v_cap_floor);
    end if;
    v_hard := least(v_hard, v_floor);
  else
    -- No tier reached. Without a discount rule nothing goes below list price.
    v_floor := v_product.distributor_price_paise;
    v_hard := v_product.distributor_price_paise;
  end if;

  v_snapshot := jsonb_build_object(
    'product_id', v_product.id,
    'sku', v_product.sku,
    'qty', p_qty,
    'moq', v_product.moq,
    'tier_qty_from', v_rule.qty_from,
    'floor_price_paise', v_rule.floor_price_paise,
    'hard_minimum_paise', v_rule.hard_minimum_paise,
    'max_discount_pct', v_rule.max_discount_pct,
    'distributor_price_paise', v_product.distributor_price_paise,
    'effective_floor_paise', v_floor,
    'effective_hard_minimum_paise', v_hard,
    'payment_terms', v_rule.payment_terms,
    'requested_paise', p_requested_paise,
    'evaluated_at', now()
  );

  if p_qty is null or p_qty < v_product.moq then
    select min(qty_from) into v_min_tier from public.discount_rules where product_id = p_product;
    return query select 'reject'::text, v_floor, 'below_moq'::text, v_hard, v_rule.qty_from, v_snapshot;
    return;
  end if;

  if v_floor is null then
    return query select 'reject'::text, null::bigint, 'no_pricing_rule'::text, null::bigint, null::integer, v_snapshot;
    return;
  end if;

  if p_requested_paise is null or p_requested_paise <= 0 then
    return query select 'reject'::text, v_floor, 'invalid_price'::text, v_hard, v_rule.qty_from, v_snapshot;
  elsif p_requested_paise >= v_floor then
    return query select 'accept'::text, v_floor, 'at_or_above_floor'::text, v_hard, v_rule.qty_from, v_snapshot;
  elsif p_requested_paise >= v_hard then
    return query select 'needs_approval'::text, v_floor, 'below_floor_above_hard_minimum'::text, v_hard, v_rule.qty_from, v_snapshot;
  else
    return query select 'reject'::text, v_floor, 'below_hard_minimum'::text, v_hard, v_rule.qty_from, v_snapshot;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Negotiations
-- ---------------------------------------------------------------------------
create or replace function public.open_negotiation(
  p_conversation uuid, p_product uuid, p_qty integer
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
  v_id uuid;
begin
  select * into v_conv from public.conversations where id = p_conversation;
  if not found then
    perform public.app_error('not_found', 'Conversation not found', 'conversation_id');
  end if;
  if not public.is_trusted() and v_conv.manufacturer_id is distinct from public.auth_mid() then
    perform public.app_error('forbidden', 'Conversation belongs to another manufacturer', 'conversation_id');
  end if;
  if not exists (select 1 from public.products where id = p_product and manufacturer_id = v_conv.manufacturer_id) then
    perform public.app_error('invalid_product', 'Product does not belong to this manufacturer', 'product_id');
  end if;

  select id into v_id from public.negotiations
  where conversation_id = p_conversation and product_id = p_product
    and status in ('open', 'awaiting_approval', 'agreed')
  order by created_at desc limit 1;

  if v_id is null then
    insert into public.negotiations (manufacturer_id, prospect_id, conversation_id, product_id, qty)
    values (v_conv.manufacturer_id, v_conv.prospect_id, p_conversation, p_product, greatest(p_qty, 1))
    returning id into v_id;
    perform public.set_stage_internal(v_conv.prospect_id, 'negotiating', 'Price discussion started', null);
  elsif p_qty is not null then
    update public.negotiations set qty = greatest(p_qty, 1) where id = v_id;
  end if;
  return v_id;
end
$$;

-- Records a buyer ask, evaluates it, honours an approved exception for this
-- negotiation, and opens an approval request when the ask needs one.
create or replace function public.negotiate_offer(
  p_negotiation uuid,
  p_requested_paise bigint,
  p_qty integer default null,
  p_by_party text default 'buyer',
  p_turn uuid default null
)
returns table (
  decision text,
  allowed_price_paise bigint,
  floor_paise bigint,
  hard_minimum_paise bigint,
  reason text,
  offer_id uuid,
  approval_id uuid
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_neg public.negotiations%rowtype;
  v_eval record;
  v_qty integer;
  v_exception public.human_approvals%rowtype;
  v_decision text;
  v_allowed bigint;
  v_reason text;
  v_offer uuid;
  v_approval uuid;
begin
  select * into v_neg from public.negotiations where id = p_negotiation for update;
  if not found then
    perform public.app_error('not_found', 'Negotiation not found', 'negotiation_id');
  end if;
  if not public.is_trusted() and v_neg.manufacturer_id is distinct from public.auth_mid() then
    perform public.app_error('forbidden', 'Negotiation belongs to another manufacturer', 'negotiation_id');
  end if;

  v_qty := coalesce(p_qty, v_neg.qty);
  if v_qty <> v_neg.qty then
    update public.negotiations set qty = v_qty where id = p_negotiation;
  end if;

  select * into v_eval from public.evaluate_offer(v_neg.product_id, v_qty, p_requested_paise);
  v_decision := v_eval.decision;
  v_reason := v_eval.reason;
  v_allowed := case when v_eval.decision = 'accept' then p_requested_paise else v_eval.floor_paise end;

  -- An approved (or countered) exception lets the buyer close at that price.
  select * into v_exception from public.human_approvals
  where negotiation_id = p_negotiation and kind = 'price_below_floor'
    and status in ('approved', 'countered') and approved_price_paise is not null
  order by decided_at desc limit 1;

  if v_decision <> 'accept' and v_exception.id is not null
     and p_requested_paise >= v_exception.approved_price_paise
     and v_qty >= coalesce(v_exception.qty, v_qty) then
    v_decision := 'accept';
    v_reason := 'approved_exception';
    v_allowed := p_requested_paise;
  end if;

  insert into public.negotiation_offers (manufacturer_id, negotiation_id, by_party, price_paise, qty, decision,
                                         counter_paise, rule_snapshot, turn_id)
  values (v_neg.manufacturer_id, p_negotiation, p_by_party, p_requested_paise, v_qty,
          v_decision::public.offer_decision, v_eval.floor_paise,
          coalesce(v_eval.rule_snapshot, '{}'::jsonb) || jsonb_build_object('reason', v_reason,
            'exception_approval_id', v_exception.id),
          p_turn)
  returning id into v_offer;

  update public.negotiations set last_floor_paise = v_eval.floor_paise where id = p_negotiation;

  if v_decision = 'needs_approval' then
    v_approval := public.request_price_approval(p_negotiation, p_requested_paise, v_qty, v_eval.floor_paise,
                                                v_eval.hard_minimum_paise, null);
  end if;

  return query select v_decision, v_allowed, v_eval.floor_paise, v_eval.hard_minimum_paise, v_reason, v_offer, v_approval;
end
$$;

-- Creates (or refreshes) the single pending price approval for a negotiation
-- and notifies the owner and every sales head whose limit covers the deal.
create or replace function public.request_price_approval(
  p_negotiation uuid,
  p_requested_paise bigint,
  p_qty integer,
  p_floor_paise bigint,
  p_hard_minimum_paise bigint,
  p_recommendation text
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_neg public.negotiations%rowtype;
  v_mfr public.manufacturers%rowtype;
  v_product public.products%rowtype;
  v_prospect public.prospects%rowtype;
  v_id uuid;
  v_value bigint;
  v_expiry_hours integer;
  v_recipients uuid[];
  v_margin text;
begin
  select * into v_neg from public.negotiations where id = p_negotiation;
  select * into v_mfr from public.manufacturers where id = v_neg.manufacturer_id;
  select * into v_product from public.products where id = v_neg.product_id;
  select * into v_prospect from public.prospects where id = v_neg.prospect_id;

  v_value := p_requested_paise * p_qty;
  v_expiry_hours := coalesce((v_mfr.settings ->> 'approval_expiry_hours')::integer, 24);

  if v_product.cost_paise is not null and p_requested_paise > 0 then
    v_margin := round(100.0 * (p_requested_paise - v_product.cost_paise) / p_requested_paise, 1)::text || '%';
  end if;

  select id into v_id from public.human_approvals
  where negotiation_id = p_negotiation and status = 'pending' and kind = 'price_below_floor';

  if v_id is null then
    insert into public.human_approvals (
      manufacturer_id, negotiation_id, prospect_id, conversation_id, kind, requested_paise, permitted_paise,
      hard_minimum_paise, qty, deal_value_paise, ai_recommendation, summary, context, expires_at)
    values (
      v_neg.manufacturer_id, p_negotiation, v_neg.prospect_id, v_neg.conversation_id, 'price_below_floor',
      p_requested_paise, p_floor_paise, p_hard_minimum_paise, p_qty, v_value,
      coalesce(p_recommendation, format('Buyer asks %s below the floor. Counter at the floor or approve to win the account.',
        to_char((p_floor_paise - p_requested_paise) / 100.0, 'FM₹999,99,99,990.00'))),
      format('%s asks ₹%s per %s for %s × %s', v_prospect.name, to_char(p_requested_paise / 100.0, 'FM99,99,99,990.00'),
        v_product.unit, p_qty, v_product.name),
      jsonb_build_object('product_name', v_product.name, 'sku', v_product.sku, 'unit', v_product.unit,
                         'prospect_name', v_prospect.name, 'city', v_prospect.city,
                         'margin_at_requested', v_margin, 'cost_paise', v_product.cost_paise),
      now() + make_interval(hours => v_expiry_hours))
    returning id into v_id;
  else
    update public.human_approvals
    set requested_paise = p_requested_paise, qty = p_qty, deal_value_paise = v_value,
        permitted_paise = p_floor_paise, hard_minimum_paise = p_hard_minimum_paise,
        ai_recommendation = coalesce(p_recommendation, ai_recommendation),
        summary = format('%s asks ₹%s per %s for %s × %s', v_prospect.name, to_char(p_requested_paise / 100.0, 'FM99,99,99,990.00'),
          v_product.unit, p_qty, v_product.name)
    where id = v_id;
  end if;

  update public.negotiations set status = 'awaiting_approval' where id = p_negotiation;

  select coalesce(array_agg(user_id), '{}') into v_recipients
  from public.profiles
  where manufacturer_id = v_neg.manufacturer_id and active
    and (role = 'owner' or (role = 'sales_head' and (approval_limit_paise is null or approval_limit_paise >= v_value)));

  perform public.notify_users(v_neg.manufacturer_id, v_recipients, 'approval_needed',
    'Approval needed: ' || v_prospect.name,
    format('Asks ₹%s vs floor ₹%s for %s × %s', to_char(p_requested_paise / 100.0, 'FM99,99,99,990.00'),
           to_char(p_floor_paise / 100.0, 'FM99,99,99,990.00'), p_qty, v_product.name),
    '/approvals?id=' || v_id, 'approval:' || v_id, '{in_app,push,email}',
    jsonb_build_object('approval_id', v_id));

  return v_id;
end
$$;

-- Non price approvals (payment terms, credit, samples, custom quotation).
create or replace function public.request_approval(
  p_conversation uuid,
  p_kind public.approval_kind,
  p_summary text,
  p_recommendation text default null,
  p_negotiation uuid default null,
  p_requested_paise bigint default null,
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
  v_mfr public.manufacturers%rowtype;
  v_prospect_name text;
  v_id uuid;
begin
  if p_kind = 'price_below_floor' then
    perform public.app_error('use_negotiate_offer', 'Price approvals are created by negotiate_offer', 'kind');
  end if;
  select * into v_conv from public.conversations where id = p_conversation;
  if not found then
    perform public.app_error('not_found', 'Conversation not found', 'conversation_id');
  end if;
  if not public.is_trusted() and v_conv.manufacturer_id is distinct from public.auth_mid() then
    perform public.app_error('forbidden', 'Conversation belongs to another manufacturer', 'conversation_id');
  end if;
  select * into v_mfr from public.manufacturers where id = v_conv.manufacturer_id;
  select name into v_prospect_name from public.prospects where id = v_conv.prospect_id;

  insert into public.human_approvals (manufacturer_id, negotiation_id, prospect_id, conversation_id, kind,
    requested_paise, summary, ai_recommendation, context, expires_at)
  values (v_conv.manufacturer_id, p_negotiation, v_conv.prospect_id, p_conversation, p_kind,
    p_requested_paise, p_summary, p_recommendation, coalesce(p_context, '{}'::jsonb),
    now() + make_interval(hours => coalesce((v_mfr.settings ->> 'approval_expiry_hours')::integer, 24)))
  returning id into v_id;

  perform public.notify_users(v_conv.manufacturer_id,
    public.tenant_users(v_conv.manufacturer_id, '{owner,sales_head}'),
    'approval_needed', 'Approval needed: ' || coalesce(v_prospect_name, 'buyer'), p_summary,
    '/approvals?id=' || v_id, 'approval:' || v_id, '{in_app,push,email}', jsonb_build_object('approval_id', v_id));
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Consent
-- ---------------------------------------------------------------------------
create or replace function public.consent_status_for(p_contact uuid, p_channel public.channel default 'whatsapp')
returns public.consent_status
language sql stable security definer
set search_path = public
as $$
  select coalesce((select status from public.consents where contact_id = p_contact and channel = p_channel), 'none')
$$;

-- Sets consent with evidence. Opt outs always apply; nothing upgrades an
-- opted_out contact except an explicit opt in from the contact.
create or replace function public.set_consent(
  p_contact uuid,
  p_status public.consent_status,
  p_source text,
  p_evidence jsonb default '{}'::jsonb,
  p_channel public.channel default 'whatsapp'
)
returns public.consent_status
language plpgsql security definer
set search_path = public
as $$
declare
  v_contact public.contacts%rowtype;
  v_current public.consent_status;
  v_new public.consent_status := p_status;
begin
  select * into v_contact from public.contacts where id = p_contact;
  if not found then
    perform public.app_error('not_found', 'Contact not found', 'contact_id');
  end if;
  if not public.is_trusted() then
    if v_contact.manufacturer_id is distinct from public.auth_mid() then
      perform public.app_error('forbidden', 'Contact belongs to another manufacturer', 'contact_id');
    end if;
    if p_status = 'engaged' then
      perform public.app_error('forbidden', 'Engaged is set only when the contact writes to you', 'status');
    end if;
    if p_status = 'opted_in' and coalesce(p_evidence, '{}'::jsonb) = '{}'::jsonb then
      perform public.app_error('evidence_required', 'An opt in needs evidence (form, reply or customer record)', 'evidence');
    end if;
  end if;

  v_current := public.consent_status_for(p_contact, p_channel);

  -- engaged never downgrades opted_in, and never revives an opt out
  if p_status = 'engaged' and v_current in ('opted_in', 'opted_out') then
    v_new := v_current;
  end if;

  insert into public.consents (manufacturer_id, contact_id, channel, status, source, evidence, changed_at, changed_by)
  values (v_contact.manufacturer_id, p_contact, p_channel, v_new, p_source, coalesce(p_evidence, '{}'::jsonb), now(), auth.uid())
  on conflict (contact_id, channel) do update
    set status = excluded.status,
        source = case when public.consents.status is distinct from excluded.status then excluded.source else public.consents.source end,
        evidence = case when public.consents.status is distinct from excluded.status then excluded.evidence else public.consents.evidence end,
        changed_at = case when public.consents.status is distinct from excluded.status then now() else public.consents.changed_at end,
        changed_by = excluded.changed_by;

  if v_new = 'opted_out' and v_current is distinct from 'opted_out' then
    -- Takes effect before the next queued send for this contact.
    update public.messages m set status = 'cancelled', error = 'contact_opted_out'
    from public.conversations c
    where m.conversation_id = c.id and c.contact_id = p_contact and m.status = 'queued';
    update public.followups f set status = 'cancelled'
    from public.conversations c
    where f.conversation_id = c.id and c.contact_id = p_contact and f.status = 'pending';
    perform public.write_audit(v_contact.manufacturer_id, 'consent_opted_out', 'contact', p_contact,
                               jsonb_build_object('source', p_source));
  end if;
  return v_new;
end
$$;

-- ---------------------------------------------------------------------------
-- enqueue_outbound_message: the only code path that queues a WhatsApp
-- message. Raises unless consent is engaged or opted_in, the 24 hour window
-- is open or the template is Meta approved, the daily cap is not reached,
-- and (for the AI) the thread is not paused.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_outbound_message(
  p_conversation uuid,
  p_body text,
  p_template uuid default null,
  p_actor public.message_actor default null,
  p_media_path text default null,
  p_media_type text default null,
  p_media_filename text default null,
  p_template_params jsonb default null,
  p_idempotency_key text default null,
  p_turn uuid default null,
  p_ai_action uuid default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
  v_mfr public.manufacturers%rowtype;
  v_template public.message_templates%rowtype;
  v_consent public.consent_status;
  v_actor public.message_actor;
  v_cap integer;
  v_sent_today integer;
  v_id uuid;
  v_body text := p_body;
begin
  if p_idempotency_key is not null then
    select id into v_id from public.messages where idempotency_key = p_idempotency_key;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  select * into v_conv from public.conversations where id = p_conversation for update;
  if not found then
    perform public.app_error('not_found', 'Conversation not found', 'conversation_id');
  end if;

  -- Caller identity and actor
  if public.is_trusted() then
    v_actor := coalesce(p_actor, 'ai');
  else
    if v_conv.manufacturer_id is distinct from public.auth_mid() then
      perform public.app_error('forbidden', 'Conversation belongs to another manufacturer', 'conversation_id');
    end if;
    if not public.rep_can_see_conversation(p_conversation) then
      perform public.app_error('forbidden', 'This lead is not assigned to you', 'conversation_id');
    end if;
    v_actor := case when public.auth_role() = 'rep' then 'rep'::public.message_actor else 'owner'::public.message_actor end;
  end if;

  select * into v_mfr from public.manufacturers where id = v_conv.manufacturer_id;

  if v_actor = 'ai' and v_conv.ai_paused then
    perform public.app_error('ai_paused', 'The AI is paused on this thread until a human resumes it', 'conversation_id');
  end if;

  -- Consent gate
  v_consent := public.consent_status_for(v_conv.contact_id, v_conv.channel);
  if v_consent not in ('engaged', 'opted_in') then
    perform public.app_error('consent_required',
      format('Contact consent is %s; WhatsApp needs engaged or opted_in', v_consent), 'consent');
  end if;

  -- Session window or approved template
  if p_template is not null then
    select * into v_template from public.message_templates
    where id = p_template and (manufacturer_id is null or manufacturer_id = v_conv.manufacturer_id);
    if not found or v_template.meta_status <> 'approved' then
      perform public.app_error('template_not_approved', 'Template is not Meta approved', 'template_id');
    end if;
    if v_body is null then
      v_body := v_template.body;
    end if;
  elsif v_conv.window_expires_at is null or now() >= v_conv.window_expires_at then
    perform public.app_error('window_closed',
      'The 24 hour session window is closed; use an approved template', 'template_id');
  end if;

  if coalesce(trim(v_body), '') = '' and p_media_path is null then
    perform public.app_error('empty_message', 'Message needs a body or an attachment', 'body');
  end if;

  -- Daily outbound cap per manufacturer
  v_cap := coalesce((v_mfr.settings ->> 'daily_outbound_cap')::integer, 500);
  select count(*) into v_sent_today from public.messages
  where manufacturer_id = v_conv.manufacturer_id and direction = 'outbound'
    and status not in ('blocked', 'cancelled', 'failed')
    and created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  if v_sent_today >= v_cap then
    perform public.app_error('daily_cap_reached', format('Daily outbound cap of %s reached', v_cap), null);
  end if;

  insert into public.messages (manufacturer_id, conversation_id, direction, body, media_path, media_type,
    media_filename, template_id, template_params, status, actor, actor_user_id, idempotency_key, turn_id, ai_action_id)
  values (v_conv.manufacturer_id, p_conversation, 'outbound', v_body, p_media_path, p_media_type,
    p_media_filename, p_template, p_template_params, 'queued', v_actor,
    case when v_actor in ('rep', 'owner') then auth.uid() end, p_idempotency_key, p_turn, p_ai_action)
  returning id into v_id;

  if p_template is not null then
    update public.message_templates set usage_count = usage_count + 1 where id = p_template;
  end if;

  update public.conversations
  set last_outbound_at = now(), last_message_preview = left(coalesce(v_body, '[attachment]'), 140)
  where id = p_conversation;

  perform pgmq.send('outbound_messages', jsonb_build_object('message_id', v_id));
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Pipeline stages
-- ---------------------------------------------------------------------------
-- Internal transition used by system flows. Silently ignores transitions
-- that would move a prospect backwards along the happy path.
create or replace function public.set_stage_internal(
  p_prospect uuid, p_to public.prospect_stage, p_note text, p_actor uuid
)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_from public.prospect_stage;
  v_mid uuid;
  v_order constant public.prospect_stage[] :=
    array['new', 'contacted', 'engaged', 'qualified', 'negotiating', 'quoted', 'first_order', 'repeat_order']::public.prospect_stage[];
begin
  select stage, manufacturer_id into v_from, v_mid from public.prospects where id = p_prospect for update;
  if not found or v_from = p_to then
    return false;
  end if;
  -- forward only, except reaching repeat_order or recovering from lost
  if v_from <> 'lost' and p_to <> 'lost'
     and array_position(v_order, p_to) < array_position(v_order, v_from) then
    return false;
  end if;
  update public.prospects set stage = p_to, stage_changed_at = now() where id = p_prospect;
  insert into public.prospect_events (manufacturer_id, prospect_id, kind, from_stage, to_stage, body, actor_id)
  values (v_mid, p_prospect, 'stage_change', v_from, p_to, p_note, p_actor);
  return true;
end
$$;

-- Client facing, validated transition with an event row. A prospect cannot
-- skip from New to First Order. Orders move prospects to first_order only
-- through confirm_order.
create or replace function public.set_stage(
  p_prospect uuid,
  p_to public.prospect_stage,
  p_note text default null,
  p_client_ts timestamptz default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_prospect public.prospects%rowtype;
  v_result jsonb;
begin
  if p_idempotency_key is not null then
    select result into v_result from public.idempotency_keys where key = p_idempotency_key;
    if found then
      return v_result;
    end if;
  end if;

  select * into v_prospect from public.prospects where id = p_prospect for update;
  if not found then
    perform public.app_error('not_found', 'Prospect not found', 'prospect_id');
  end if;
  if not public.is_trusted() then
    if v_prospect.manufacturer_id is distinct from public.auth_mid() then
      perform public.app_error('forbidden', 'Prospect belongs to another manufacturer', 'prospect_id');
    end if;
    if public.auth_role() = 'rep' and v_prospect.assigned_rep_id is distinct from auth.uid() then
      perform public.app_error('forbidden', 'This lead is not assigned to you', 'prospect_id');
    end if;
    if public.auth_role() = 'ops_admin' then
      perform public.app_error('forbidden', 'Ops cannot move pipeline stages', 'prospect_id');
    end if;
  end if;

  if v_prospect.stage = p_to then
    v_result := jsonb_build_object('ok', true, 'stage', p_to, 'changed', false);
  else
    if p_to in ('first_order', 'repeat_order') and not public.is_trusted() then
      perform public.app_error('use_confirm_order', 'Orders move a prospect to First Order; confirm the PO instead', 'stage');
    end if;
    if not exists (select 1 from public.stage_transitions where from_stage = v_prospect.stage and to_stage = p_to) then
      perform public.app_error('invalid_transition',
        format('Cannot move from %s to %s', v_prospect.stage, p_to), 'stage');
    end if;
    update public.prospects set stage = p_to, stage_changed_at = now() where id = p_prospect;
    insert into public.prospect_events (manufacturer_id, prospect_id, kind, from_stage, to_stage, body, actor_id, client_ts)
    values (v_prospect.manufacturer_id, p_prospect, 'stage_change', v_prospect.stage, p_to, p_note, auth.uid(), p_client_ts);
    v_result := jsonb_build_object('ok', true, 'stage', p_to, 'changed', true, 'from', v_prospect.stage);
  end if;

  if p_idempotency_key is not null then
    insert into public.idempotency_keys (key, user_id, rpc, result)
    values (p_idempotency_key, auth.uid(), 'set_stage', v_result) on conflict (key) do nothing;
  end if;
  return v_result;
end
$$;

-- Notes and call logs (rep PWA offline queue syncs through these).
create or replace function public.log_prospect_event(
  p_prospect uuid,
  p_kind text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_client_ts timestamptz default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_prospect public.prospects%rowtype;
  v_id uuid;
  v_result jsonb;
begin
  if p_kind not in ('note', 'call_log') then
    perform public.app_error('invalid_kind', 'Only notes and call logs can be logged', 'kind');
  end if;
  if p_idempotency_key is not null then
    select result into v_result from public.idempotency_keys where key = p_idempotency_key;
    if found then
      return v_result;
    end if;
  end if;
  select * into v_prospect from public.prospects where id = p_prospect;
  if not found or v_prospect.manufacturer_id is distinct from public.auth_mid() then
    perform public.app_error('not_found', 'Prospect not found', 'prospect_id');
  end if;
  if public.auth_role() = 'rep' and v_prospect.assigned_rep_id is distinct from auth.uid() then
    perform public.app_error('forbidden', 'This lead is not assigned to you', 'prospect_id');
  end if;

  insert into public.prospect_events (manufacturer_id, prospect_id, kind, body, data, actor_id, client_ts)
  values (v_prospect.manufacturer_id, p_prospect, p_kind, p_body, coalesce(p_data, '{}'::jsonb), auth.uid(), p_client_ts)
  returning id into v_id;

  -- A connected call counts as contact.
  if p_kind = 'call_log' and v_prospect.stage = 'new' and coalesce(p_data ->> 'outcome', '') in ('connected', 'interested', 'callback') then
    perform public.set_stage_internal(p_prospect, 'contacted', 'Call logged', auth.uid());
  end if;

  v_result := jsonb_build_object('ok', true, 'event_id', v_id);
  if p_idempotency_key is not null then
    insert into public.idempotency_keys (key, user_id, rpc, result)
    values (p_idempotency_key, auth.uid(), 'log_prospect_event', v_result) on conflict (key) do nothing;
  end if;
  return v_result;
end
$$;

-- Qualification fields recorded by the AI or a rep.
create or replace function public.log_qualification_field(p_prospect uuid, p_field text, p_value text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_prospect public.prospects%rowtype;
  v_q jsonb;
begin
  if p_field not in ('current_suppliers', 'monthly_volume', 'decision_maker', 'timeline', 'objections',
                     'brands_carried', 'retail_reach', 'credit_expectation', 'notes') then
    perform public.app_error('invalid_field', 'Unknown qualification field', 'field');
  end if;
  select * into v_prospect from public.prospects where id = p_prospect for update;
  if not found then
    perform public.app_error('not_found', 'Prospect not found', 'prospect_id');
  end if;
  if not public.is_trusted() and (v_prospect.manufacturer_id is distinct from public.auth_mid()
     or not public.rep_can_see(p_prospect)) then
    perform public.app_error('forbidden', 'Not allowed', 'prospect_id');
  end if;
  v_q := v_prospect.qualification || jsonb_build_object(p_field, jsonb_build_object('value', left(p_value, 500), 'at', now()));
  update public.prospects set qualification = v_q where id = p_prospect;
  -- Enough signal to call the lead qualified
  if v_prospect.stage = 'engaged' and (select count(*) from jsonb_object_keys(v_q)) >= 3 then
    perform public.set_stage_internal(p_prospect, 'qualified', 'Qualification captured', null);
    perform public.notify_users(v_prospect.manufacturer_id, array_remove(array[v_prospect.assigned_rep_id], null),
      'qualified_lead', 'Qualified lead: ' || v_prospect.name, 'The AI captured enough qualification to hand over',
      '/rep/leads/' || p_prospect, 'qualified:' || p_prospect, '{in_app,push}');
  end if;
  return v_q;
end
$$;

-- ---------------------------------------------------------------------------
-- Human takeover
-- ---------------------------------------------------------------------------
create or replace function public.pause_ai(p_conversation uuid, p_reason text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
begin
  select * into v_conv from public.conversations where id = p_conversation for update;
  if not found then
    perform public.app_error('not_found', 'Conversation not found', 'conversation_id');
  end if;
  if not public.is_trusted() and (v_conv.manufacturer_id is distinct from public.auth_mid()
     or not public.rep_can_see_conversation(p_conversation)) then
    perform public.app_error('forbidden', 'Not allowed', 'conversation_id');
  end if;
  update public.conversations
  set ai_paused = true, paused_reason = coalesce(p_reason, 'Taken over by a person'), paused_by = auth.uid(), paused_at = now()
  where id = p_conversation;
  perform public.write_audit(v_conv.manufacturer_id, 'pause_ai', 'conversation', p_conversation,
                             jsonb_build_object('reason', p_reason));
end
$$;

create or replace function public.resume_ai(p_conversation uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
begin
  select * into v_conv from public.conversations where id = p_conversation for update;
  if not found then
    perform public.app_error('not_found', 'Conversation not found', 'conversation_id');
  end if;
  if not public.is_trusted() and (v_conv.manufacturer_id is distinct from public.auth_mid()
     or not public.rep_can_see_conversation(p_conversation)) then
    perform public.app_error('forbidden', 'Not allowed', 'conversation_id');
  end if;
  update public.conversations
  set ai_paused = false, paused_reason = null, paused_by = null, paused_at = null
  where id = p_conversation;
  perform public.write_audit(v_conv.manufacturer_id, 'resume_ai', 'conversation', p_conversation, '{}'::jsonb);
end
$$;

-- AI or rule driven escalation: pause, assign a rep if none, notify.
create or replace function public.escalate_to_human(p_conversation uuid, p_reason text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
  v_prospect public.prospects%rowtype;
  v_rep uuid;
begin
  select * into v_conv from public.conversations where id = p_conversation for update;
  if not found then
    perform public.app_error('not_found', 'Conversation not found', 'conversation_id');
  end if;
  if not public.is_trusted() and v_conv.manufacturer_id is distinct from public.auth_mid() then
    perform public.app_error('forbidden', 'Not allowed', 'conversation_id');
  end if;
  select * into v_prospect from public.prospects where id = v_conv.prospect_id for update;
  v_rep := v_prospect.assigned_rep_id;
  if v_rep is null then
    v_rep := public.pick_rep(v_conv.manufacturer_id);
    if v_rep is not null then
      update public.prospects set assigned_rep_id = v_rep where id = v_prospect.id;
    end if;
  end if;
  update public.conversations
  set ai_paused = true, paused_reason = p_reason, paused_at = now(), paused_by = null
  where id = p_conversation;
  perform public.notify_users(v_conv.manufacturer_id,
    case when v_rep is null then public.tenant_users(v_conv.manufacturer_id, '{owner,sales_head}') else array[v_rep] end,
    'escalation', 'AI escalated: ' || v_prospect.name, p_reason,
    '/rep/leads/' || v_prospect.id, 'escalation:' || p_conversation || ':' || to_char(now(), 'YYYYMMDDHH24MI'),
    '{in_app,push}', jsonb_build_object('conversation_id', p_conversation));
  return v_rep;
end
$$;

-- Least loaded active rep (open assigned leads).
create or replace function public.pick_rep(p_manufacturer uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select pr.user_id
  from public.profiles pr
  left join public.prospects p on p.assigned_rep_id = pr.user_id and p.stage not in ('lost', 'first_order', 'repeat_order')
  where pr.manufacturer_id = p_manufacturer and pr.role = 'rep' and pr.active
  group by pr.user_id
  order by count(p.id), pr.user_id
  limit 1
$$;

-- Rep or owner reply from the app (passes the same consent gate).
create or replace function public.send_human_message(
  p_conversation uuid, p_body text, p_idempotency_key text default null, p_template uuid default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if public.is_trusted() then
    perform public.app_error('forbidden', 'Human messages need a signed in user', null);
  end if;
  v_id := public.enqueue_outbound_message(p_conversation, p_body, p_template, null, null, null, null, null, p_idempotency_key);
  update public.conversations set unread_count = 0 where id = p_conversation;
  return v_id;
end
$$;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language sql security definer
set search_path = public
as $$
  update public.conversations set unread_count = 0
  where id = p_conversation and manufacturer_id = public.auth_mid() and public.rep_can_see_conversation(p_conversation);
$$;
