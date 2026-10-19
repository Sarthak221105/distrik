-- Approvals, quotations, purchase orders, orders and reorders (PRD 10, 11).

-- ---------------------------------------------------------------------------
-- AI turns: one row per trigger, queued once.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_ai_turn(
  p_conversation uuid,
  p_reason text,
  p_trigger_message uuid default null,
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_mid uuid;
  v_id uuid;
begin
  select manufacturer_id into v_mid from public.conversations where id = p_conversation;
  if v_mid is null then
    return null;
  end if;
  insert into public.ai_turns (manufacturer_id, conversation_id, trigger_message_id, reason, context)
  values (v_mid, p_conversation, p_trigger_message, p_reason, coalesce(p_context, '{}'::jsonb))
  on conflict (trigger_message_id) do nothing
  returning id into v_id;
  if v_id is not null then
    perform pgmq.send('ai_turns', jsonb_build_object('turn_id', v_id));
  end if;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- decide_approval: the only way to resolve an approval.
-- ---------------------------------------------------------------------------
create or replace function public.decide_approval(
  p_id uuid,
  p_decision text,
  p_counter_paise bigint default null,
  p_note text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_appr public.human_approvals%rowtype;
  v_profile public.profiles%rowtype;
  v_neg public.negotiations%rowtype;
  v_status public.approval_status;
  v_price bigint;
  v_value bigint;
  v_quote uuid;
begin
  if p_decision not in ('approve', 'reject', 'counter') then
    perform public.app_error('invalid_decision', 'Decision must be approve, reject or counter', 'decision');
  end if;

  select * into v_appr from public.human_approvals where id = p_id for update;
  if not found or v_appr.manufacturer_id is distinct from public.auth_mid() then
    perform public.app_error('not_found', 'Approval not found', 'id');
  end if;

  select * into v_profile from public.profiles where user_id = auth.uid() and active;
  if v_profile.role is null or v_profile.role not in ('owner', 'sales_head') then
    perform public.app_error('forbidden', 'Only an owner or sales head can decide approvals', null);
  end if;

  if v_appr.status <> 'pending' then
    perform public.app_error('already_decided', format('This approval is already %s', v_appr.status), null);
  end if;
  if v_appr.expires_at <= now() then
    update public.human_approvals set status = 'expired' where id = p_id;
    perform public.app_error('expired', 'This approval has expired', null);
  end if;

  if p_decision = 'counter' then
    if p_counter_paise is null or p_counter_paise <= 0 then
      perform public.app_error('counter_required', 'Enter a counter price', 'counter_paise');
    end if;
    if v_appr.kind = 'price_below_floor' then
      if p_counter_paise < coalesce(v_appr.hard_minimum_paise, 0) then
        perform public.app_error('below_hard_minimum',
          'Counter is below your hard minimum; change the commercial rule first', 'counter_paise');
      end if;
      if p_counter_paise <= v_appr.requested_paise then
        perform public.app_error('counter_not_above_ask', 'A counter must be above the buyer''s ask; approve instead', 'counter_paise');
      end if;
    end if;
  end if;

  v_price := case p_decision when 'approve' then v_appr.requested_paise when 'counter' then p_counter_paise end;
  v_value := coalesce(v_price, v_appr.requested_paise, 0) * coalesce(v_appr.qty, 1);

  if p_decision in ('approve', 'counter') and v_profile.approval_limit_paise is not null
     and v_value > v_profile.approval_limit_paise then
    perform public.app_error('approval_limit_exceeded',
      format('Deal value ₹%s exceeds your approval limit of ₹%s',
        to_char(v_value / 100.0, 'FM99,99,99,990'), to_char(v_profile.approval_limit_paise / 100.0, 'FM99,99,99,990')),
      null);
  end if;

  v_status := case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'countered' end;

  update public.human_approvals
  set status = v_status, decided_by = auth.uid(), decided_at = now(), decision_note = p_note,
      counter_paise = case when p_decision = 'counter' then p_counter_paise end,
      approved_price_paise = v_price
  where id = p_id;

  if v_appr.negotiation_id is not null then
    select * into v_neg from public.negotiations where id = v_appr.negotiation_id for update;
    insert into public.negotiation_offers (manufacturer_id, negotiation_id, by_party, price_paise, qty, decision,
                                           counter_paise, rule_snapshot)
    values (v_appr.manufacturer_id, v_neg.id, 'manufacturer', coalesce(v_price, v_appr.requested_paise),
            coalesce(v_appr.qty, v_neg.qty),
            case p_decision when 'approve' then 'approved' when 'counter' then 'countered' else 'declined' end::public.offer_decision,
            case when p_decision = 'counter' then p_counter_paise when p_decision = 'reject' then v_appr.permitted_paise end,
            jsonb_build_object('approval_id', p_id, 'decided_by', auth.uid(), 'note', p_note));

    if v_appr.kind = 'price_below_floor' then
      if p_decision = 'approve' then
        update public.negotiations set status = 'agreed', agreed_price_paise = v_appr.requested_paise,
          qty = coalesce(v_appr.qty, qty)
        where id = v_neg.id;
        v_quote := public.create_quotation(v_neg.id, null, null, null);
      else
        update public.negotiations set status = 'open' where id = v_neg.id;
      end if;
    end if;
  end if;

  insert into public.ai_actions (manufacturer_id, conversation_id, prospect_id, agent, action_type, input, output,
                                 rule_checked, outcome)
  values (v_appr.manufacturer_id, v_appr.conversation_id, v_appr.prospect_id, 'human', 'decide_approval',
          jsonb_build_object('approval_id', p_id, 'decision', p_decision, 'counter_paise', p_counter_paise),
          jsonb_build_object('status', v_status, 'quotation_id', v_quote),
          'approval_limit', v_status::text);

  if v_appr.conversation_id is not null then
    perform public.enqueue_ai_turn(v_appr.conversation_id, 'approval_decided', null,
      jsonb_build_object('approval_id', p_id, 'decision', p_decision, 'counter_paise', p_counter_paise,
                         'quotation_id', v_quote));
  end if;

  -- Close the notifications for everyone else.
  update public.notifications set read_at = coalesce(read_at, now())
  where dedupe_key = 'approval:' || p_id;

  perform public.write_audit(v_appr.manufacturer_id, 'decide_approval', 'human_approval', p_id,
    jsonb_build_object('decision', p_decision, 'counter_paise', p_counter_paise, 'deal_value_paise', v_value));

  return jsonb_build_object('ok', true, 'status', v_status, 'quotation_id', v_quote);
end
$$;

-- Expire stale approvals and send the half way reminder (pg_cron, every minute).
create or replace function public.process_approval_timers()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select * from public.human_approvals
    where status = 'pending' and expires_at <= now()
    for update skip locked
  loop
    update public.human_approvals set status = 'expired' where id = r.id;
    if r.negotiation_id is not null then
      update public.negotiations set status = 'open' where id = r.negotiation_id and status = 'awaiting_approval';
    end if;
    if r.conversation_id is not null then
      perform public.enqueue_ai_turn(r.conversation_id, 'approval_expired', null,
        jsonb_build_object('approval_id', r.id, 'hold_price_paise', r.permitted_paise));
    end if;
    v_count := v_count + 1;
  end loop;

  for r in
    select * from public.human_approvals
    where status = 'pending' and reminder_sent_at is null
      and now() >= created_at + (expires_at - created_at) / 2
    for update skip locked
  loop
    update public.human_approvals set reminder_sent_at = now() where id = r.id;
    perform public.notify_users(r.manufacturer_id, public.tenant_users(r.manufacturer_id, '{owner,sales_head}'),
      'approval_expiring', 'Approval expiring soon', coalesce(r.summary, 'An approval is waiting for you'),
      '/approvals?id=' || r.id, 'approval_reminder:' || r.id, '{in_app,push,email}',
      jsonb_build_object('approval_id', r.id));
  end loop;
  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- Quotations
-- ---------------------------------------------------------------------------

-- Guard: a price below the floor cannot reach a quotation without an
-- approved human_approvals row for that negotiation.
create or replace function public.quotations_price_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l jsonb;
  v_eval record;
  v_price bigint;
  v_qty integer;
begin
  if tg_op = 'UPDATE' and new.lines = old.lines then
    return new;
  end if;
  for l in select * from jsonb_array_elements(new.lines) loop
    v_price := (l ->> 'unit_price_paise')::bigint;
    v_qty := (l ->> 'qty')::integer;
    select * into v_eval from public.evaluate_offer((l ->> 'product_id')::uuid, v_qty, v_price);
    if v_eval.decision <> 'accept' then
      if not exists (
        select 1 from public.human_approvals a
        where a.negotiation_id = new.negotiation_id
          and a.status in ('approved', 'countered')
          and a.kind in ('price_below_floor', 'custom_quotation')
          and a.approved_price_paise is not null
          and a.approved_price_paise <= v_price
      ) then
        raise exception using errcode = 'P0001', message = 'price_below_floor_without_approval',
          detail = format('Line %s at %s paise is below the floor (%s) and has no approval', l ->> 'sku', v_price, v_eval.floor_paise),
          hint = 'lines';
      end if;
    end if;
  end loop;
  return new;
end
$$;
create trigger quotations_price_guard before insert or update of lines on public.quotations
  for each row execute function public.quotations_price_guard();

-- Builds a GST correct quotation from a negotiation (or explicit lines) and
-- queues PDF generation. A change after sending creates a new version.
create or replace function public.create_quotation(
  p_negotiation uuid,
  p_lines jsonb default null,
  p_shipping_paise bigint default null,
  p_payment_terms text default null,
  p_notes text default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_neg public.negotiations%rowtype;
  v_mfr public.manufacturers%rowtype;
  v_prospect public.prospects%rowtype;
  v_prev public.quotations%rowtype;
  v_contact uuid;
  v_input jsonb;
  v_lines jsonb := '[]'::jsonb;
  l jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_price bigint;
  v_taxable bigint;
  v_tax bigint;
  v_subtotal bigint := 0;
  v_tax_total bigint := 0;
  v_mode text;
  v_number text;
  v_version integer := 1;
  v_seq integer;
  v_id uuid;
  v_terms text;
begin
  select * into v_neg from public.negotiations where id = p_negotiation;
  if not found then
    perform public.app_error('not_found', 'Negotiation not found', 'negotiation_id');
  end if;
  if not public.is_trusted() then
    if v_neg.manufacturer_id is distinct from public.auth_mid() or not public.is_manager() then
      perform public.app_error('forbidden', 'Only an owner or sales head can issue quotations', null);
    end if;
  end if;
  select * into v_mfr from public.manufacturers where id = v_neg.manufacturer_id;
  select * into v_prospect from public.prospects where id = v_neg.prospect_id;
  select contact_id into v_contact from public.conversations where id = v_neg.conversation_id;

  v_input := coalesce(p_lines, jsonb_build_array(jsonb_build_object(
    'product_id', v_neg.product_id, 'qty', v_neg.qty,
    'unit_price_paise', coalesce(v_neg.agreed_price_paise, v_neg.last_floor_paise))));

  v_mode := case when public.gst_state_code(v_prospect.state) is null
                   or public.gst_state_code(v_prospect.state) = v_mfr.state_code then 'intra' else 'inter' end;

  for l in select * from jsonb_array_elements(v_input) loop
    select * into v_product from public.products
    where id = (l ->> 'product_id')::uuid and manufacturer_id = v_neg.manufacturer_id;
    if not found then
      perform public.app_error('invalid_product', 'Quotation line has an unknown product', 'lines');
    end if;
    v_qty := (l ->> 'qty')::integer;
    v_price := (l ->> 'unit_price_paise')::bigint;
    if v_qty is null or v_qty < 1 or v_price is null or v_price <= 0 then
      perform public.app_error('invalid_line', 'Each line needs a quantity and a price', 'lines');
    end if;
    v_taxable := v_qty * v_price;
    v_tax := round(v_taxable * v_product.gst_rate / 100.0)::bigint;
    v_subtotal := v_subtotal + v_taxable;
    v_tax_total := v_tax_total + v_tax;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_product.id, 'sku', v_product.sku, 'name', v_product.name, 'unit', v_product.unit,
      'hsn_code', v_product.hsn_code, 'qty', v_qty, 'unit_price_paise', v_price,
      'gst_rate', v_product.gst_rate, 'taxable_paise', v_taxable, 'tax_paise', v_tax,
      'cgst_paise', case when v_mode = 'intra' then v_tax / 2 else 0 end,
      'sgst_paise', case when v_mode = 'intra' then v_tax - v_tax / 2 else 0 end,
      'igst_paise', case when v_mode = 'inter' then v_tax else 0 end,
      'line_total_paise', v_taxable + v_tax);
  end loop;

  select * into v_prev from public.quotations
  where negotiation_id = p_negotiation order by version desc limit 1;

  if v_prev.id is not null then
    v_number := v_prev.number;
    v_version := v_prev.version + 1;
    update public.quotations set status = 'superseded' where negotiation_id = p_negotiation and status <> 'superseded';
  else
    update public.manufacturers set quote_seq = quote_seq + 1 where id = v_mfr.id returning quote_seq into v_seq;
    v_number := format('%s/%s/%s', v_mfr.quote_prefix, to_char(now() at time zone 'Asia/Kolkata', 'YYYY'), lpad(v_seq::text, 4, '0'));
  end if;

  select payment_terms into v_terms from public.discount_rules
  where product_id = v_neg.product_id and qty_from <= v_neg.qty order by qty_from desc limit 1;

  insert into public.quotations (manufacturer_id, prospect_id, negotiation_id, contact_id, number, version, lines,
    subtotal_paise, tax_paise, shipping_paise, total_paise, tax_mode, payment_terms, notes, valid_until, status, created_by)
  values (v_neg.manufacturer_id, v_neg.prospect_id, p_negotiation, v_contact, v_number, v_version, v_lines,
    v_subtotal, v_tax_total, coalesce(p_shipping_paise, 0), v_subtotal + v_tax_total + coalesce(p_shipping_paise, 0),
    v_mode, coalesce(p_payment_terms, v_neg.payment_terms, v_terms, v_mfr.settings ->> 'default_payment_terms'),
    coalesce(p_notes, v_mfr.settings ->> 'shipping_note'),
    (now() at time zone 'Asia/Kolkata')::date + coalesce((v_mfr.settings ->> 'quotation_validity_days')::integer, 15),
    'generating', auth.uid())
  returning id into v_id;

  update public.negotiations set status = 'quoted' where id = p_negotiation;
  perform public.set_stage_internal(v_neg.prospect_id, 'quoted', 'Quotation ' || v_number || ' v' || v_version, auth.uid());
  perform pgmq.send('quotation_jobs', jsonb_build_object('quotation_id', v_id));
  return v_id;
end
$$;

-- Settles a negotiation at a price the rules allow (AI tool settle_and_quote).
create or replace function public.settle_negotiation(
  p_negotiation uuid, p_price_paise bigint, p_qty integer default null, p_turn uuid default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_res record;
  v_quote uuid;
begin
  select * into v_res from public.negotiate_offer(p_negotiation, p_price_paise, p_qty, 'ai', p_turn);
  if v_res.decision <> 'accept' then
    return jsonb_build_object('ok', false, 'decision', v_res.decision, 'floor_paise', v_res.floor_paise,
                              'reason', v_res.reason, 'approval_id', v_res.approval_id);
  end if;
  update public.negotiations set status = 'agreed', agreed_price_paise = p_price_paise,
    qty = coalesce(p_qty, qty) where id = p_negotiation;
  v_quote := public.create_quotation(p_negotiation, null, null, null);
  return jsonb_build_object('ok', true, 'quotation_id', v_quote, 'price_paise', p_price_paise);
end
$$;

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------
create or replace function public.register_purchase_order(
  p_prospect uuid, p_file_path text, p_mime text default null, p_message uuid default null, p_quotation uuid default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_prospect public.prospects%rowtype;
  v_quote uuid := p_quotation;
  v_id uuid;
begin
  select * into v_prospect from public.prospects where id = p_prospect;
  if not found then
    perform public.app_error('not_found', 'Prospect not found', 'prospect_id');
  end if;
  if not public.is_trusted() and (v_prospect.manufacturer_id is distinct from public.auth_mid()
     or not public.rep_can_see(p_prospect)) then
    perform public.app_error('forbidden', 'Not allowed', 'prospect_id');
  end if;
  -- file paths are "<bucket>/<manufacturer_id>/..." (PO uploads or WhatsApp media)
  if split_part(p_file_path, '/', 1) not in ('purchase-orders', 'whatsapp-media')
     or split_part(p_file_path, '/', 2) <> v_prospect.manufacturer_id::text then
    perform public.app_error('invalid_path', 'File must live in the manufacturer folder', 'file_path');
  end if;
  if v_quote is null then
    select id into v_quote from public.quotations
    where prospect_id = p_prospect and status in ('sent', 'accepted')
    order by created_at desc limit 1;
  end if;
  insert into public.purchase_orders (manufacturer_id, quotation_id, prospect_id, message_id, file_path, mime_type, uploaded_by)
  values (v_prospect.manufacturer_id, v_quote, p_prospect, p_message, p_file_path, p_mime, auth.uid())
  on conflict (message_id) do nothing
  returning id into v_id;
  if v_id is not null then
    perform pgmq.send('po_parse', jsonb_build_object('po_id', v_id));
  end if;
  return v_id;
end
$$;

-- SQL matcher: compares a parsed PO with its quotation and sets match_status.
-- parsed shape: { po_number, po_date, lines: [{ sku, description, qty, unit_price_paise }],
--                 subtotal_paise, tax_paise, total_paise, delivery_address, buyer_gstin }
create or replace function public.match_purchase_order(p_po uuid)
returns public.po_match_status
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_quote public.quotations%rowtype;
  v_diffs jsonb := '[]'::jsonb;
  v_status public.po_match_status;
  ql jsonb;
  pl jsonb;
  v_used integer[] := '{}';
  v_idx integer;
  v_best integer;
  v_best_score numeric;
  v_score numeric;
  v_low_conf boolean;
  v_recipients uuid[];
  v_prospect_name text;
begin
  select * into v_po from public.purchase_orders where id = p_po for update;
  if not found then
    perform public.app_error('not_found', 'PO not found', 'po_id');
  end if;
  if not public.is_trusted() and v_po.manufacturer_id is distinct from public.auth_mid() then
    perform public.app_error('forbidden', 'Not allowed', 'po_id');
  end if;

  if v_po.quotation_id is null then
    select id into v_po.quotation_id from public.quotations
    where prospect_id = v_po.prospect_id and status in ('sent', 'accepted') order by created_at desc limit 1;
  end if;
  select * into v_quote from public.quotations where id = v_po.quotation_id;

  if v_quote.id is null then
    v_diffs := jsonb_build_array(jsonb_build_object('field', 'quotation', 'issue', 'no_sent_quotation'));
  elsif v_po.parsed is null then
    v_diffs := jsonb_build_array(jsonb_build_object('field', 'parsed', 'issue', 'not_parsed'));
  else
    -- line matching: sku first, then name similarity
    for ql in select * from jsonb_array_elements(v_quote.lines) loop
      v_best := null;
      v_best_score := 0;
      v_idx := 0;
      for pl in select * from jsonb_array_elements(coalesce(v_po.parsed -> 'lines', '[]'::jsonb)) loop
        v_idx := v_idx + 1;
        continue when v_idx = any (v_used);
        if upper(coalesce(pl ->> 'sku', '')) = upper(ql ->> 'sku') and coalesce(pl ->> 'sku', '') <> '' then
          v_score := 1;
        else
          v_score := similarity(lower(coalesce(pl ->> 'description', '')), lower(ql ->> 'name'));
        end if;
        if v_score > v_best_score then
          v_best_score := v_score;
          v_best := v_idx;
        end if;
      end loop;

      if v_best is null or v_best_score < 0.35 then
        v_diffs := v_diffs || jsonb_build_object('field', 'line', 'sku', ql ->> 'sku', 'issue', 'missing_in_po',
                                                 'quotation', ql ->> 'name', 'po', null);
      else
        v_used := v_used || v_best;
        pl := v_po.parsed -> 'lines' -> (v_best - 1);
        if (pl ->> 'qty')::numeric is distinct from (ql ->> 'qty')::numeric then
          v_diffs := v_diffs || jsonb_build_object('field', 'qty', 'sku', ql ->> 'sku',
                                                   'quotation', (ql ->> 'qty')::numeric, 'po', (pl ->> 'qty')::numeric);
        end if;
        if abs(coalesce((pl ->> 'unit_price_paise')::numeric, -1) - (ql ->> 'unit_price_paise')::numeric) > 100 then
          v_diffs := v_diffs || jsonb_build_object('field', 'unit_price_paise', 'sku', ql ->> 'sku',
                                                   'quotation', (ql ->> 'unit_price_paise')::numeric,
                                                   'po', (pl ->> 'unit_price_paise')::numeric);
        end if;
      end if;
    end loop;

    v_idx := 0;
    for pl in select * from jsonb_array_elements(coalesce(v_po.parsed -> 'lines', '[]'::jsonb)) loop
      v_idx := v_idx + 1;
      if not (v_idx = any (v_used)) then
        v_diffs := v_diffs || jsonb_build_object('field', 'line', 'issue', 'extra_in_po',
                                                 'quotation', null, 'po', pl ->> 'description');
      end if;
    end loop;

    if v_po.parsed ? 'total_paise' and abs((v_po.parsed ->> 'total_paise')::numeric - v_quote.total_paise) > 100 then
      v_diffs := v_diffs || jsonb_build_object('field', 'total_paise', 'quotation', v_quote.total_paise,
                                               'po', (v_po.parsed ->> 'total_paise')::numeric);
    end if;
  end if;

  v_low_conf := coalesce(v_po.confidence, 0) < 0.8
    or exists (select 1 from jsonb_each_text(coalesce(v_po.field_confidence, '{}'::jsonb)) f
               where f.key in ('lines', 'qty', 'unit_price', 'total') and f.value::numeric < 0.7);

  v_status := case
    when v_quote.id is null or v_po.parsed is null then 'needs_review'
    when v_low_conf then 'needs_review'
    when jsonb_array_length(v_diffs) > 0 then 'mismatch'
    else 'matched' end;

  update public.purchase_orders
  set match_status = v_status, diffs = v_diffs, quotation_id = v_quote.id,
      status = case when status in ('received', 'parsing') then 'parsed' else status end
  where id = p_po;

  if v_status = 'matched' and v_quote.id is not null then
    update public.quotations set status = 'accepted' where id = v_quote.id and status = 'sent';
  end if;

  select name into v_prospect_name from public.prospects where id = v_po.prospect_id;
  v_recipients := public.tenant_users(v_po.manufacturer_id, '{owner,sales_head}');
  perform public.notify_users(v_po.manufacturer_id, v_recipients, 'po_' || v_status::text,
    case v_status when 'matched' then 'PO matched, ready to confirm'
                  when 'mismatch' then 'PO differs from quotation'
                  else 'PO needs review' end || ': ' || coalesce(v_prospect_name, ''),
    format('%s difference(s) found', jsonb_array_length(v_diffs)),
    '/quotations?po=' || p_po, 'po:' || p_po || ':' || v_status::text, '{in_app,email}',
    jsonb_build_object('po_id', p_po));
  return v_status;
end
$$;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create or replace function public.confirm_order(p_po uuid, p_override_reason text default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_quote public.quotations%rowtype;
  v_mfr public.manufacturers%rowtype;
  v_prospect public.prospects%rowtype;
  v_seq integer;
  v_order uuid;
  v_number text;
  l jsonb;
  v_days integer;
  v_contact uuid;
begin
  if not public.is_manager() then
    perform public.app_error('forbidden', 'Only an owner or sales head can confirm orders', null);
  end if;
  select * into v_po from public.purchase_orders where id = p_po for update;
  if not found or v_po.manufacturer_id is distinct from public.auth_mid() then
    perform public.app_error('not_found', 'PO not found', 'po_id');
  end if;
  if v_po.status = 'confirmed' then
    perform public.app_error('already_confirmed', 'This PO is already an order', null);
  end if;
  if v_po.match_status <> 'matched' and coalesce(length(trim(p_override_reason)), 0) < 5 then
    perform public.app_error('override_reason_required',
      'This PO does not match its quotation; give an override reason to confirm it', 'override_reason');
  end if;
  select * into v_quote from public.quotations where id = v_po.quotation_id;
  if v_quote.id is null then
    perform public.app_error('no_quotation', 'The PO has no quotation to confirm against', null);
  end if;
  select * into v_mfr from public.manufacturers where id = v_po.manufacturer_id;
  select * into v_prospect from public.prospects where id = v_po.prospect_id for update;

  update public.manufacturers set order_seq = order_seq + 1 where id = v_mfr.id returning order_seq into v_seq;
  v_number := format('SO/%s/%s', to_char(now() at time zone 'Asia/Kolkata', 'YYYY'), lpad(v_seq::text, 4, '0'));

  insert into public.orders (manufacturer_id, prospect_id, quotation_id, po_id, number, total_paise, confirmed_by,
                             override_reason, ordered_on)
  values (v_po.manufacturer_id, v_po.prospect_id, v_quote.id, p_po, v_number, v_quote.total_paise, auth.uid(),
          case when v_po.match_status <> 'matched' then p_override_reason end,
          (now() at time zone 'Asia/Kolkata')::date)
  returning id into v_order;

  for l in select * from jsonb_array_elements(v_quote.lines) loop
    insert into public.order_items (manufacturer_id, order_id, product_id, qty, unit_price_paise, tax_paise, line_total_paise)
    values (v_po.manufacturer_id, v_order, (l ->> 'product_id')::uuid, (l ->> 'qty')::integer,
            (l ->> 'unit_price_paise')::bigint, (l ->> 'tax_paise')::bigint, (l ->> 'line_total_paise')::bigint);
  end loop;

  v_days := coalesce(nullif(substring(coalesce(v_quote.payment_terms, '') from '([0-9]+)\s*day'), '')::integer, 0);
  insert into public.shipments (manufacturer_id, order_id) values (v_po.manufacturer_id, v_order);
  insert into public.payments (manufacturer_id, order_id, amount_paise, due_date)
  values (v_po.manufacturer_id, v_order, v_quote.total_paise, (now() at time zone 'Asia/Kolkata')::date + v_days);

  update public.purchase_orders set status = 'confirmed' where id = p_po;
  update public.quotations set status = 'accepted' where id = v_quote.id;
  if v_quote.negotiation_id is not null then
    update public.negotiations set status = 'closed' where id = v_quote.negotiation_id;
  end if;

  perform public.set_stage_internal(v_po.prospect_id,
    case when v_prospect.is_customer then 'repeat_order' else 'first_order' end::public.prospect_stage,
    'Order ' || v_number, auth.uid());
  update public.prospects set is_customer = true, is_stale = false where id = v_po.prospect_id;

  -- An existing customer has opted in for order and reorder updates.
  for v_contact in select id from public.contacts where prospect_id = v_po.prospect_id and is_primary loop
    if public.consent_status_for(v_contact) <> 'opted_out' then
      perform public.set_consent(v_contact, 'opted_in', 'existing_customer_order',
        jsonb_build_object('order_id', v_order, 'po_id', p_po));
    end if;
  end loop;

  if v_po.match_status <> 'matched' then
    perform public.write_audit(v_po.manufacturer_id, 'confirm_order_override', 'purchase_order', p_po,
      jsonb_build_object('reason', p_override_reason, 'diffs', v_po.diffs, 'order_id', v_order));
  end if;
  perform public.write_audit(v_po.manufacturer_id, 'confirm_order', 'order', v_order,
    jsonb_build_object('po_id', p_po, 'quotation_id', v_quote.id, 'total_paise', v_quote.total_paise));
  return v_order;
end
$$;

-- Manual shipment and payment updates (MVP).
create or replace function public.update_order_status(
  p_order uuid, p_shipment public.shipment_status default null, p_payment public.payment_status default null,
  p_tracking_ref text default null, p_carrier text default null, p_payment_ref text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found or v_order.manufacturer_id is distinct from public.auth_mid() or not public.rep_can_see(v_order.prospect_id) then
    perform public.app_error('not_found', 'Order not found', 'order_id');
  end if;
  if p_shipment is not null then
    update public.shipments
    set status = p_shipment, tracking_ref = coalesce(p_tracking_ref, tracking_ref), carrier = coalesce(p_carrier, carrier),
        dispatched_at = case when p_shipment in ('dispatched', 'in_transit', 'delivered') then coalesce(dispatched_at, now()) end,
        delivered_at = case when p_shipment = 'delivered' then now() end,
        updated_by = auth.uid(), updated_at = now()
    where order_id = p_order;
    update public.orders set status = case p_shipment
      when 'dispatched' then 'dispatched' when 'in_transit' then 'in_transit' when 'delivered' then 'delivered'
      else 'confirmed' end::public.order_status
    where id = p_order and status <> 'cancelled';
  end if;
  if p_payment is not null then
    update public.payments
    set status = p_payment, paid_at = case when p_payment = 'paid' then now() end,
        reference = coalesce(p_payment_ref, reference), updated_by = auth.uid(), updated_at = now()
    where order_id = p_order;
  end if;
  perform public.write_audit(v_order.manufacturer_id, 'update_order_status', 'order', p_order,
    jsonb_build_object('shipment', p_shipment, 'payment', p_payment));
end
$$;

-- ---------------------------------------------------------------------------
-- Reorders: nightly. For each account and product with at least two orders,
-- predicted = last order + average gap; confidence rises with order count and
-- falls with gap variance.
-- ---------------------------------------------------------------------------
create or replace function public.compute_reorders()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
  v_lead integer;
  v_status public.reorder_status;
  v_conv uuid;
begin
  -- Payments past due become overdue.
  update public.payments set status = 'overdue', updated_at = now()
  where status = 'due' and due_date < (now() at time zone 'Asia/Kolkata')::date;

  for r in
    with dated as (
      select o.manufacturer_id, o.prospect_id, oi.product_id, o.ordered_on
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.status <> 'cancelled'
      group by 1, 2, 3, 4
    ),
    gaps as (
      select *, ordered_on - lag(ordered_on) over (partition by prospect_id, product_id order by ordered_on) as gap
      from dated
    )
    select manufacturer_id, prospect_id, product_id,
           count(*)::integer as n,
           max(ordered_on) as last_date,
           avg(gap)::numeric as avg_gap,
           coalesce(stddev_samp(gap), 0)::numeric as sd_gap
    from gaps
    group by 1, 2, 3
    having count(*) >= 2
  loop
    select coalesce((settings ->> 'reorder_lead_days')::integer, 5) into v_lead
    from public.manufacturers where id = r.manufacturer_id;

    v_status := case
      when (r.last_date + round(r.avg_gap)::integer) < (now() at time zone 'Asia/Kolkata')::date then 'overdue'
      when (r.last_date + round(r.avg_gap)::integer) - (now() at time zone 'Asia/Kolkata')::date <= v_lead then 'due'
      else 'upcoming' end;

    insert into public.reorder_predictions (manufacturer_id, prospect_id, product_id, order_count, last_order_date,
      avg_gap_days, predicted_date, confidence, status, updated_at)
    values (r.manufacturer_id, r.prospect_id, r.product_id, r.n, r.last_date, round(r.avg_gap, 2),
      r.last_date + round(r.avg_gap)::integer,
      round(least(0.95, greatest(0.05,
        (0.35 + 0.12 * least(r.n, 6)) * (1 - least(0.6, r.sd_gap / nullif(r.avg_gap, 0))))), 3),
      v_status, now())
    on conflict (prospect_id, product_id) do update
      set order_count = excluded.order_count, last_order_date = excluded.last_order_date,
          avg_gap_days = excluded.avg_gap_days, predicted_date = excluded.predicted_date,
          confidence = excluded.confidence,
          status = case when public.reorder_predictions.status = 'dismissed'
                         and public.reorder_predictions.predicted_date = excluded.predicted_date
                        then 'dismissed' else excluded.status end,
          updated_at = now();

    -- Newly due: tell the rep and start a reorder conversation once per date.
    if v_status in ('due', 'overdue') then
      update public.reorder_predictions
      set notified_for = r.last_date + round(r.avg_gap)::integer
      where prospect_id = r.prospect_id and product_id = r.product_id
        and status <> 'dismissed'
        and notified_for is distinct from r.last_date + round(r.avg_gap)::integer
      returning id into v_conv;
      if v_conv is not null then
        perform public.notify_users(r.manufacturer_id,
          (select array_remove(array[assigned_rep_id], null) from public.prospects where id = r.prospect_id)
            || case when (select assigned_rep_id from public.prospects where id = r.prospect_id) is null
                    then public.tenant_users(r.manufacturer_id, '{owner,sales_head}') else '{}'::uuid[] end,
          'reorder_' || v_status::text,
          'Reorder ' || v_status::text || ': ' || (select name from public.prospects where id = r.prospect_id),
          'Predicted for ' || to_char(r.last_date + round(r.avg_gap)::integer, 'DD Mon'),
          '/rep/reorders', 'reorder:' || r.prospect_id || ':' || r.product_id || ':' || (r.last_date + round(r.avg_gap)::integer),
          '{in_app,push}');
        select c.id into v_conv from public.conversations c
        join public.contacts ct on ct.id = c.contact_id
        where c.prospect_id = r.prospect_id and ct.is_primary and c.channel = 'whatsapp' and not c.ai_paused
        limit 1;
        if v_conv is not null then
          perform public.enqueue_ai_turn(v_conv, 'reorder_due', null,
            jsonb_build_object('product_id', r.product_id, 'predicted_date', r.last_date + round(r.avg_gap)::integer));
        end if;
      end if;
      v_conv := null;
    end if;
    v_count := v_count + 1;
  end loop;

  -- Overdue accounts surface to their rep as at risk.
  update public.prospects p set is_stale = true
  where exists (select 1 from public.reorder_predictions rp
                where rp.prospect_id = p.id and rp.status = 'overdue'
                  and rp.predicted_date < (now() at time zone 'Asia/Kolkata')::date - 14);
  return v_count;
end
$$;

create or replace function public.dismiss_reorder(p_id uuid)
returns void
language sql security definer
set search_path = public
as $$
  update public.reorder_predictions set status = 'dismissed'
  where id = p_id and manufacturer_id = public.auth_mid() and public.rep_can_see(prospect_id);
$$;

-- ---------------------------------------------------------------------------
-- Follow ups
-- ---------------------------------------------------------------------------
create or replace function public.schedule_followup(
  p_conversation uuid, p_due_at timestamptz, p_reason text, p_created_by text default 'ai'
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
  v_attempt integer;
  v_id uuid;
begin
  select * into v_conv from public.conversations where id = p_conversation;
  if not found then
    perform public.app_error('not_found', 'Conversation not found', 'conversation_id');
  end if;
  if not public.is_trusted() and (v_conv.manufacturer_id is distinct from public.auth_mid()
     or not public.rep_can_see_conversation(p_conversation)) then
    perform public.app_error('forbidden', 'Not allowed', 'conversation_id');
  end if;
  if p_due_at < now() or p_due_at > now() + interval '30 days' then
    perform public.app_error('invalid_due_at', 'Follow ups must be within the next 30 days', 'due_at');
  end if;
  select coalesce(max(attempt), 0) + 1 into v_attempt from public.followups
  where conversation_id = p_conversation and created_at > coalesce(v_conv.last_inbound_at, '-infinity');
  update public.followups set status = 'cancelled' where conversation_id = p_conversation and status = 'pending';
  insert into public.followups (manufacturer_id, conversation_id, due_at, reason, attempt, created_by)
  values (v_conv.manufacturer_id, p_conversation, p_due_at, p_reason, v_attempt,
          case when public.is_trusted() then p_created_by else 'rep' end)
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.process_due_followups()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
  v_max integer;
  v_prospect public.prospects%rowtype;
begin
  for r in
    select f.*, c.prospect_id, c.ai_paused, c.contact_id
    from public.followups f join public.conversations c on c.id = f.conversation_id
    where f.status = 'pending' and f.due_at <= now()
    order by f.due_at
    limit 200
    for update of f skip locked
  loop
    select coalesce(jsonb_array_length(settings -> 'followup_cadence_days'), 3) into v_max
    from public.manufacturers where id = r.manufacturer_id;

    if r.attempt > v_max then
      update public.followups set status = 'done' where id = r.id;
      select * into v_prospect from public.prospects where id = r.prospect_id;
      update public.prospects set is_stale = true where id = r.prospect_id;
      perform public.notify_users(r.manufacturer_id,
        coalesce(array_remove(array[v_prospect.assigned_rep_id], null), '{}') ||
          case when v_prospect.assigned_rep_id is null then public.tenant_users(r.manufacturer_id, '{sales_head}') else '{}' end,
        'stale_lead', 'No reply: ' || v_prospect.name, 'Follow ups exhausted; try a call',
        '/rep/leads/' || r.prospect_id, 'stale:' || r.conversation_id || ':' || r.attempt, '{in_app,push}');
    elsif r.ai_paused or public.consent_status_for(r.contact_id) not in ('engaged', 'opted_in') then
      update public.followups set status = 'cancelled' where id = r.id;
    else
      update public.followups set status = 'processing' where id = r.id;
      perform public.enqueue_ai_turn(r.conversation_id, 'followup', null,
        jsonb_build_object('followup_id', r.id, 'attempt', r.attempt, 'reason', r.reason));
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;
