-- Manufacturer-owned lead review, part 2.
-- Distrik supplies discovery, cleaning, scoring and guardrails; each
-- manufacturer's own team reviews, approves, merges and assigns its prospects.
-- No Distrik employee sits between discovery and the manufacturer.
--
--   discovery -> automatic cleaning, dedupe, classification, research, scoring
--             -> Lead Review (manufacturer) -> approved prospects -> outreach

-- ---------------------------------------------------------------------------
-- 1. System administrator: technical platform maintenance only
-- ---------------------------------------------------------------------------
create or replace function public.is_system_admin()
returns boolean
language sql stable
as $$
  select public.auth_role() = 'system_admin'
$$;

create or replace function public.sysadmin_users()
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(user_id), '{}') from public.profiles where role = 'system_admin' and active
$$;

-- ---------------------------------------------------------------------------
-- 2. Granular team permissions (owner delegates without handing over
--    pricing, finance or team administration)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column permissions text[] not null default '{}';

alter table public.profiles
  add constraint profiles_permissions_valid check (
    permissions <@ array['review_leads', 'resolve_duplicates', 'assign_leads', 'launch_campaigns', 'override_reviews']::text[]
  );

-- Sales heads get the lead workflow by default (owners always have everything).
update public.profiles
set permissions = '{review_leads,resolve_duplicates,assign_leads,launch_campaigns}'
where role = 'sales_head' and permissions = '{}';

create or replace function public.profiles_default_permissions()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'sales_head' and (new.permissions is null or new.permissions = '{}') then
    new.permissions := '{review_leads,resolve_duplicates,assign_leads,launch_campaigns}';
  elsif new.role in ('rep', 'system_admin', 'owner') then
    new.permissions := '{}';
  end if;
  return new;
end
$$;
create trigger profiles_default_permissions before insert on public.profiles
  for each row execute function public.profiles_default_permissions();

-- Owner: always. Sales head: only with the delegated permission.
create or replace function public.has_permission(p_permission text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.auth_mid() is not null and (
    public.auth_role() = 'owner'
    or exists (
      select 1 from public.profiles
      where user_id = auth.uid() and active and role = 'sales_head'
        and manufacturer_id = public.auth_mid() and p_permission = any (permissions)
    ))
$$;

-- Recipients for a permission inside a tenant (owners plus delegated heads).
create or replace function public.permitted_users(p_manufacturer uuid, p_permission text)
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(user_id), '{}') from public.profiles
  where manufacturer_id = p_manufacturer and active
    and (role = 'owner' or (role = 'sales_head' and p_permission = any (permissions)))
$$;

create or replace function public.set_member_permissions(p_user uuid, p_permissions text[])
returns text[]
language plpgsql security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
  v_clean text[];
begin
  if public.auth_role() <> 'owner' then
    perform public.app_error('forbidden', 'Only the owner can change team permissions', null);
  end if;
  select * into v_target from public.profiles where user_id = p_user for update;
  if not found or v_target.manufacturer_id is distinct from public.auth_mid() then
    perform public.app_error('not_found', 'Team member not found', 'user_id');
  end if;
  if v_target.role <> 'sales_head' then
    perform public.app_error('invalid_role', 'Lead permissions can be delegated to sales heads only', 'user_id');
  end if;
  select coalesce(array_agg(distinct x order by x), '{}') into v_clean from unnest(coalesce(p_permissions, '{}')) x;
  if not (v_clean <@ array['review_leads', 'resolve_duplicates', 'assign_leads', 'launch_campaigns', 'override_reviews']::text[]) then
    perform public.app_error('invalid_permission', 'Unknown permission', 'permissions');
  end if;
  update public.profiles set permissions = v_clean where user_id = p_user;
  perform public.write_audit(v_target.manufacturer_id, 'set_member_permissions', 'profile', p_user,
    jsonb_build_object('from', v_target.permissions, 'to', v_clean));
  return v_clean;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Review model
-- ---------------------------------------------------------------------------
alter table public.prospects rename column needs_ops_attention to attention_reason;
alter table public.prospects
  add column review_flags text[] not null default '{}',
  add column merged_into uuid references public.prospects(id) on delete set null,
  add column last_checked_at timestamptz;

comment on column public.prospects.review_flags is
  'possible_duplicate | low_classification_confidence | flagged_by_rep | missing_phone';
comment on column public.prospects.review_status is
  'pending = Pending Review, needs_review = has warnings, approved, rejected, merged (into merged_into)';

create index prospects_review_queue on public.prospects (manufacturer_id, review_status, campaign_id)
  where review_status in ('pending', 'needs_review');

-- Every review decision, edit, merge and assignment (append only).
create table public.prospect_reviews (
  id bigint generated always as identity primary key,
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  action text not null check (action in ('approve', 'reject', 'override', 'edit', 'merge', 'merged_into',
    'keep_separate', 'assign', 'flag', 'reopen', 'import')),
  from_status public.review_status,
  to_status public.review_status,
  reason text,
  data jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.prospect_reviews (prospect_id, created_at desc);
create index on public.prospect_reviews (manufacturer_id, created_at desc);

-- Suspected duplicates are now real prospects flagged for the manufacturer.
alter table public.merge_candidates
  add column candidate_prospect_id uuid references public.prospects(id) on delete cascade,
  add column decision_note text;
create unique index merge_candidates_pair on public.merge_candidates (candidate_prospect_id, prospect_id)
  where candidate_prospect_id is not null;

alter table public.campaigns
  add column discovery_completed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4. RLS: manufacturers see their whole prospect list; the system admin sees
--    no manufacturer business data at all.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'documents', 'products', 'discount_rules', 'autonomy_policies', 'territories', 'knowledge_chunks',
    'campaigns', 'campaign_jobs', 'contacts', 'prospect_events', 'consents', 'consent_events',
    'conversations', 'messages', 'followups', 'ai_turns', 'negotiations', 'negotiation_offers',
    'quotations', 'human_approvals', 'purchase_orders', 'orders', 'order_items', 'shipments',
    'payments', 'reorder_predictions', 'ai_actions', 'calls', 'product_events'
  ] loop
    execute format('drop policy if exists ops_read on public.%I', t);
  end loop;
end
$$;

drop policy if exists ops_all on public.prospects;
drop policy if exists qa_gate on public.prospects;           -- the manufacturer reviews its own queue now
drop policy if exists ops_flag on public.ai_actions;
drop policy if exists ops_all on public.raw_records;
drop policy if exists ops_all on public.merge_candidates;
revoke update on public.raw_records from authenticated;

-- Manufacturers: tenant row; the system admin may list and set up tenants.
drop policy if exists tenant_read on public.manufacturers;
drop policy if exists ops_write on public.manufacturers;
create policy tenant_read on public.manufacturers for select to authenticated
  using (id = public.auth_mid() or public.is_system_admin());
create policy sysadmin_setup on public.manufacturers for all to authenticated
  using (public.is_system_admin()) with check (public.is_system_admin());

drop policy if exists self_or_tenant_read on public.profiles;
create policy self_or_tenant_read on public.profiles for select to authenticated
  using (user_id = auth.uid() or manufacturer_id = public.auth_mid() or public.is_system_admin());
drop policy if exists owner_manage_team on public.profiles;
create policy owner_manage_team on public.profiles for update to authenticated
  using (manufacturer_id = public.auth_mid() and public.auth_role() = 'owner')
  with check (manufacturer_id = public.auth_mid() and role in ('sales_head', 'rep', 'owner'));

-- Templates: tenant and global templates; Meta status sync is technical.
drop policy if exists read_templates on public.message_templates;
drop policy if exists ops_manage on public.message_templates;
create policy read_templates on public.message_templates for select to authenticated
  using (manufacturer_id is null or manufacturer_id = public.auth_mid() or public.is_system_admin());
create policy sysadmin_status_sync on public.message_templates for update to authenticated
  using (public.is_system_admin()) with check (public.is_system_admin());

-- Data sources and prompts: platform configuration (compliance, not lead QA).
drop policy if exists ops_manage on public.sources;
drop policy if exists ops_manage on public.prompt_versions;
create policy sysadmin_manage on public.sources for all to authenticated
  using (public.is_system_admin()) with check (public.is_system_admin());
create policy sysadmin_manage on public.prompt_versions for all to authenticated
  using (public.is_system_admin()) with check (public.is_system_admin());

-- Raw source payloads and duplicate candidates: the manufacturer's reviewers.
create policy managers_read on public.raw_records for select to authenticated
  using (manufacturer_id = public.auth_mid() and public.is_manager());
create policy managers_read on public.merge_candidates for select to authenticated
  using (manufacturer_id = public.auth_mid() and public.is_manager());

-- Review history: tenant read; reps only for leads they can see.
alter table public.prospect_reviews enable row level security;
create policy tenant_read on public.prospect_reviews for select to authenticated
  using (manufacturer_id = public.auth_mid());
create policy rep_assigned on public.prospect_reviews as restrictive for select to authenticated
  using (public.rep_can_see(prospect_id));
grant select on public.prospect_reviews to authenticated;

-- Audit log: owners read their tenant; the system admin reads platform rows only.
drop policy if exists owner_read on public.audit_log;
create policy owner_read on public.audit_log for select to authenticated
  using ((manufacturer_id = public.auth_mid() and public.auth_role() = 'owner')
         or (manufacturer_id is null and public.is_system_admin()));

-- Storage: strictly per tenant.
drop policy if exists tenant_read on storage.objects;
create policy tenant_read on storage.objects for select to authenticated
  using (bucket_id in ('catalogues', 'quotations', 'purchase-orders', 'whatsapp-media')
         and (storage.foldername(name))[1] = public.auth_mid()::text);

-- ---------------------------------------------------------------------------
-- 5. Review helpers
-- ---------------------------------------------------------------------------
create or replace function public.log_review(
  p_prospect uuid, p_action text, p_from public.review_status, p_to public.review_status,
  p_reason text default null, p_data jsonb default '{}'::jsonb
)
returns void
language sql security definer
set search_path = public
as $$
  insert into public.prospect_reviews (manufacturer_id, prospect_id, action, from_status, to_status, reason, data, actor_id)
  select manufacturer_id, id, p_action, p_from, p_to, p_reason, coalesce(p_data, '{}'::jsonb), auth.uid()
  from public.prospects where id = p_prospect;
$$;

-- needs_review whenever warnings remain and nobody has decided yet.
create or replace function public.refresh_review_status(p_prospect uuid)
returns public.review_status
language plpgsql security definer
set search_path = public
as $$
declare
  v_p public.prospects%rowtype;
  v_new public.review_status;
begin
  select * into v_p from public.prospects where id = p_prospect for update;
  if not found or v_p.review_status in ('approved', 'rejected', 'merged') then
    return v_p.review_status;
  end if;
  v_new := case when cardinality(v_p.review_flags) > 0 then 'needs_review' else 'pending' end;
  if v_new is distinct from v_p.review_status then
    update public.prospects set review_status = v_new where id = p_prospect;
  end if;
  return v_new;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Lead Review RPCs (every one checks tenant and permission itself)
-- ---------------------------------------------------------------------------

-- Approve or reject one or many prospects. Re-deciding an approved or
-- rejected prospect is an override: owner, or a head with override_reviews.
create or replace function public.review_prospects(p_ids uuid[], p_decision text, p_reason text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_mid uuid := public.auth_mid();
  v_p public.prospects%rowtype;
  v_to public.review_status;
  v_done integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_override boolean;
  v_campaign uuid;
begin
  if not public.has_permission('review_leads') then
    perform public.app_error('forbidden', 'You do not have permission to review leads', null);
  end if;
  if p_decision not in ('approve', 'reject') then
    perform public.app_error('invalid_decision', 'Decision must be approve or reject', 'decision');
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    perform public.app_error('nothing_selected', 'Select at least one prospect', 'ids');
  end if;
  if cardinality(p_ids) > 500 then
    perform public.app_error('too_many', 'Review at most 500 prospects at a time', 'ids');
  end if;
  if p_decision = 'reject' and coalesce(length(trim(p_reason)), 0) < 3 then
    perform public.app_error('reason_required', 'Give a reason for rejecting', 'reason');
  end if;
  v_to := case p_decision when 'approve' then 'approved' else 'rejected' end::public.review_status;

  for v_p in
    select * from public.prospects where id = any (p_ids) and manufacturer_id = v_mid order by id for update
  loop
    v_override := false;
    if v_p.pipeline_step <> 'done' then
      v_skipped := v_skipped || jsonb_build_object('id', v_p.id, 'name', v_p.name, 'reason', 'still_processing');
      continue;
    elsif v_p.review_status = 'merged' then
      v_skipped := v_skipped || jsonb_build_object('id', v_p.id, 'name', v_p.name, 'reason', 'merged');
      continue;
    elsif v_p.review_status = v_to then
      continue;
    elsif v_p.review_status in ('approved', 'rejected') then
      if not public.has_permission('override_reviews') then
        v_skipped := v_skipped || jsonb_build_object('id', v_p.id, 'name', v_p.name, 'reason', 'already_decided');
        continue;
      end if;
      if coalesce(length(trim(p_reason)), 0) < 3 then
        v_skipped := v_skipped || jsonb_build_object('id', v_p.id, 'name', v_p.name, 'reason', 'override_needs_reason');
        continue;
      end if;
      v_override := true;
    end if;
    if p_decision = 'approve' and 'possible_duplicate' = any (v_p.review_flags) then
      v_skipped := v_skipped || jsonb_build_object('id', v_p.id, 'name', v_p.name, 'reason', 'unresolved_duplicate');
      continue;
    end if;

    update public.prospects
    set review_status = v_to,
        review_note = case when p_decision = 'reject' or v_override then p_reason else review_note end,
        reviewed_by = auth.uid(), reviewed_at = now(),
        review_flags = '{}', attention_reason = null,
        outreach_approved = case when v_to = 'rejected' then false else outreach_approved end
    where id = v_p.id;

    perform public.log_review(v_p.id, case when v_override then 'override' else p_decision end,
      v_p.review_status, v_to, p_reason, jsonb_build_object('flags_cleared', v_p.review_flags));
    if v_override then
      perform public.write_audit(v_mid, 'override_prospect_review', 'prospect', v_p.id,
        jsonb_build_object('from', v_p.review_status, 'to', v_to, 'reason', p_reason));
    end if;
    v_done := v_done + 1;
  end loop;

  for v_campaign in select distinct campaign_id from public.prospects
                    where id = any (p_ids) and manufacturer_id = v_mid and campaign_id is not null loop
    perform public.advance_campaign(v_campaign);
  end loop;

  insert into public.product_events (manufacturer_id, user_id, name, properties)
  values (v_mid, auth.uid(), 'leads_reviewed', jsonb_build_object('decision', p_decision, 'count', v_done));
  return jsonb_build_object('updated', v_done, 'skipped', v_skipped);
end
$$;

-- Correct a prospect's details. Reviewers edit any prospect in the tenant;
-- reps edit the leads assigned to them.
create or replace function public.update_prospect_details(p_id uuid, p_fields jsonb, p_reason text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_p public.prospects%rowtype;
  v_contact public.contacts%rowtype;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_phone text;
  v_allowed constant text[] := array['name', 'type', 'category', 'address', 'city', 'state', 'pincode', 'gstin',
    'website', 'contact_name', 'contact_role', 'phone', 'email'];
begin
  select * into v_p from public.prospects where id = p_id for update;
  if not found or v_p.manufacturer_id is distinct from public.auth_mid() then
    perform public.app_error('not_found', 'Prospect not found', 'id');
  end if;
  if not (public.has_permission('review_leads')
          or (public.auth_role() = 'rep' and v_p.assigned_rep_id = auth.uid())) then
    perform public.app_error('forbidden', 'You cannot edit this prospect', null);
  end if;
  if v_p.review_status = 'merged' then
    perform public.app_error('merged', 'This prospect was merged into another record', 'id');
  end if;
  for v_key in select jsonb_object_keys(coalesce(p_fields, '{}'::jsonb)) loop
    if not (v_key = any (v_allowed)) then
      perform public.app_error('invalid_field', 'Field ' || v_key || ' cannot be edited', v_key);
    end if;
  end loop;
  if p_fields ? 'type' and (p_fields ->> 'type') not in ('distributor', 'super_stockist', 'wholesaler', 'dealer',
      'retailer', 'modern_trade', 'other') then
    perform public.app_error('invalid_type', 'Unknown buyer type', 'type');
  end if;
  if p_fields ? 'name' and coalesce(trim(p_fields ->> 'name'), '') = '' then
    perform public.app_error('name_required', 'Company name cannot be empty', 'name');
  end if;

  for v_key in select unnest(array['name', 'type', 'category', 'address', 'city', 'state', 'pincode', 'gstin', 'website']) loop
    if p_fields ? v_key and (to_jsonb(v_p) ->> v_key) is distinct from nullif(trim(p_fields ->> v_key), '') then
      v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', to_jsonb(v_p) ->> v_key,
        'to', nullif(trim(p_fields ->> v_key), '')));
    end if;
  end loop;

  update public.prospects set
    name = coalesce(nullif(trim(p_fields ->> 'name'), ''), name),
    normalized_name = case when p_fields ? 'name' then public.normalize_business_name(p_fields ->> 'name') else normalized_name end,
    type = coalesce(p_fields ->> 'type', type),
    category = case when p_fields ? 'category' then nullif(trim(p_fields ->> 'category'), '') else category end,
    address = case when p_fields ? 'address' then nullif(trim(p_fields ->> 'address'), '') else address end,
    city = case when p_fields ? 'city' then initcap(nullif(trim(p_fields ->> 'city'), '')) else city end,
    state = case when p_fields ? 'state' then nullif(trim(p_fields ->> 'state'), '') else state end,
    pincode = case when p_fields ? 'pincode' then nullif(trim(p_fields ->> 'pincode'), '') else pincode end,
    gstin = case when p_fields ? 'gstin' then upper(nullif(trim(p_fields ->> 'gstin'), '')) else gstin end,
    website = case when p_fields ? 'website' then nullif(trim(p_fields ->> 'website'), '') else website end
  where id = p_id;

  if p_fields ?| array['contact_name', 'contact_role', 'phone', 'email'] then
    select * into v_contact from public.contacts where prospect_id = p_id and is_primary limit 1;
    if p_fields ? 'phone' and coalesce(trim(p_fields ->> 'phone'), '') <> '' then
      v_phone := public.normalize_phone_e164(p_fields ->> 'phone');
      if v_phone is null then
        perform public.app_error('invalid_phone', 'Enter a valid 10 digit Indian mobile number', 'phone');
      end if;
      if exists (select 1 from public.contacts where manufacturer_id = v_p.manufacturer_id and phone_e164 = v_phone
                 and prospect_id <> p_id) then
        perform public.app_error('duplicate_phone',
          'Another prospect already has this phone number; merge the two records instead', 'phone');
      end if;
    end if;
    if v_contact.id is null then
      insert into public.contacts (manufacturer_id, prospect_id, name, role, phone_e164, email, is_primary)
      values (v_p.manufacturer_id, p_id, nullif(trim(p_fields ->> 'contact_name'), ''),
              nullif(trim(p_fields ->> 'contact_role'), ''), v_phone, nullif(trim(p_fields ->> 'email'), ''), true)
      returning * into v_contact;
      insert into public.consents (manufacturer_id, contact_id, channel, status, source)
      values (v_p.manufacturer_id, v_contact.id, 'whatsapp', 'none', 'manual_edit') on conflict do nothing;
    else
      update public.contacts set
        name = case when p_fields ? 'contact_name' then nullif(trim(p_fields ->> 'contact_name'), '') else name end,
        role = case when p_fields ? 'contact_role' then nullif(trim(p_fields ->> 'contact_role'), '') else role end,
        phone_e164 = case when p_fields ? 'phone' then v_phone else phone_e164 end,
        email = case when p_fields ? 'email' then nullif(trim(p_fields ->> 'email'), '') else email end
      where id = v_contact.id;
    end if;
    v_changes := v_changes || jsonb_build_object('contact', p_fields - array['name', 'type', 'category', 'address',
      'city', 'state', 'pincode', 'gstin', 'website']);
    if p_fields ? 'phone' and v_phone is not null then
      update public.prospects set review_flags = array_remove(review_flags, 'missing_phone') where id = p_id;
      perform public.refresh_review_status(p_id);
    end if;
  end if;

  perform public.log_review(p_id, 'edit', v_p.review_status, v_p.review_status, p_reason, v_changes);
  return jsonb_build_object('ok', true, 'changes', v_changes);
end
$$;

-- A rep (or reviewer) asks for a closer look: the prospect goes back to
-- Needs Review and reviewers are told.
create or replace function public.flag_prospect(p_id uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_p public.prospects%rowtype;
  v_name text;
begin
  select * into v_p from public.prospects where id = p_id for update;
  if not found or v_p.manufacturer_id is distinct from public.auth_mid() then
    perform public.app_error('not_found', 'Prospect not found', 'id');
  end if;
  if not (public.has_permission('review_leads')
          or (public.auth_role() = 'rep' and v_p.assigned_rep_id = auth.uid())) then
    perform public.app_error('forbidden', 'You cannot flag this prospect', null);
  end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then
    perform public.app_error('reason_required', 'Say what looks wrong', 'reason');
  end if;
  if v_p.review_status in ('rejected', 'merged') then
    perform public.app_error('already_closed', 'This prospect is already ' || v_p.review_status, null);
  end if;
  select full_name into v_name from public.profiles where user_id = auth.uid();
  update public.prospects
  set review_status = 'needs_review',
      review_flags = (select array_agg(distinct f) from unnest(review_flags || array['flagged_by_rep']) f),
      attention_reason = left(coalesce(v_name, 'A team member') || ': ' || p_reason, 500),
      outreach_approved = false
  where id = p_id;
  perform public.log_review(p_id, 'flag', v_p.review_status, 'needs_review', p_reason);
  perform public.notify_users(v_p.manufacturer_id, public.permitted_users(v_p.manufacturer_id, 'review_leads'),
    'lead_flagged', 'Lead flagged for review: ' || v_p.name, left(p_reason, 200),
    '/leads?id=' || p_id, 'lead_flagged:' || p_id || ':' || to_char(now(), 'YYYYMMDDHH24MI'), '{in_app,push}');
end
$$;

-- Merge two prospects, keeping p_keep. Contacts, conversations, deals,
-- documents, history and assignments move to the kept record.
create or replace function public.merge_prospects(p_keep uuid, p_drop uuid, p_note text default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_keep public.prospects%rowtype;
  v_drop public.prospects%rowtype;
  v_order constant public.prospect_stage[] :=
    array['new', 'contacted', 'engaged', 'qualified', 'negotiating', 'quoted', 'first_order', 'repeat_order']::public.prospect_stage[];
begin
  if not (public.has_permission('resolve_duplicates') or public.is_trusted()) then
    perform public.app_error('forbidden', 'You do not have permission to merge prospects', null);
  end if;
  if p_keep = p_drop then
    perform public.app_error('same_record', 'Choose two different prospects', 'ids');
  end if;
  select * into v_keep from public.prospects where id = p_keep for update;
  select * into v_drop from public.prospects where id = p_drop for update;
  if v_keep.id is null or v_drop.id is null or v_keep.manufacturer_id <> v_drop.manufacturer_id
     or (not public.is_trusted() and v_keep.manufacturer_id is distinct from public.auth_mid()) then
    perform public.app_error('not_found', 'Prospect not found', 'ids');
  end if;
  if v_keep.review_status = 'merged' or v_drop.review_status = 'merged' then
    perform public.app_error('merged', 'One of these records was already merged', 'ids');
  end if;

  -- relationships move to the kept record
  update public.contacts set prospect_id = p_keep,
    is_primary = is_primary and not exists (select 1 from public.contacts c where c.prospect_id = p_keep and c.is_primary)
  where prospect_id = p_drop;
  update public.conversations set prospect_id = p_keep where prospect_id = p_drop;
  update public.negotiations set prospect_id = p_keep where prospect_id = p_drop;
  update public.quotations set prospect_id = p_keep where prospect_id = p_drop;
  update public.purchase_orders set prospect_id = p_keep where prospect_id = p_drop;
  update public.orders set prospect_id = p_keep where prospect_id = p_drop;
  update public.human_approvals set prospect_id = p_keep where prospect_id = p_drop;
  update public.ai_actions set prospect_id = p_keep where prospect_id = p_drop;
  update public.prospect_events set prospect_id = p_keep where prospect_id = p_drop;
  update public.raw_records set prospect_id = p_keep where prospect_id = p_drop;
  update public.territories set distributor_prospect_id = p_keep where distributor_prospect_id = p_drop;
  delete from public.reorder_predictions r where r.prospect_id = p_drop
    and exists (select 1 from public.reorder_predictions k where k.prospect_id = p_keep and k.product_id = r.product_id);
  update public.reorder_predictions set prospect_id = p_keep where prospect_id = p_drop;
  update public.merge_candidates set status = 'merged', resolved_by = auth.uid(), resolved_at = now(),
    decision_note = coalesce(p_note, decision_note)
  where status = 'pending' and ((candidate_prospect_id = p_drop and prospect_id = p_keep)
                                or (candidate_prospect_id = p_keep and prospect_id = p_drop));
  update public.merge_candidates set prospect_id = p_keep where prospect_id = p_drop and status = 'pending';
  update public.merge_candidates set candidate_prospect_id = p_keep where candidate_prospect_id = p_drop and status = 'pending';
  delete from public.merge_candidates where candidate_prospect_id = prospect_id;

  -- fill gaps on the kept record; the more advanced stage wins
  update public.prospects k set
    address = coalesce(k.address, v_drop.address), pincode = coalesce(k.pincode, v_drop.pincode),
    city = coalesce(k.city, v_drop.city), state = coalesce(k.state, v_drop.state),
    gstin = coalesce(k.gstin, v_drop.gstin), website = coalesce(k.website, v_drop.website),
    geo = coalesce(k.geo, v_drop.geo), category = coalesce(k.category, v_drop.category),
    source_url = coalesce(k.source_url, v_drop.source_url),
    confidence = case when 'verified' in (k.confidence, v_drop.confidence) then 'verified' else 'inferred' end,
    signals = v_drop.signals || k.signals, research = v_drop.research || k.research,
    qualification = v_drop.qualification || k.qualification,
    assigned_rep_id = coalesce(k.assigned_rep_id, v_drop.assigned_rep_id),
    is_customer = k.is_customer or v_drop.is_customer,
    outreach_approved = k.outreach_approved or (v_drop.outreach_approved and k.review_status = 'approved'),
    stage = case when k.stage = 'lost' or v_drop.stage = 'lost' then
                   case when k.stage = 'lost' then v_drop.stage else k.stage end
                 when array_position(v_order, v_drop.stage) > array_position(v_order, k.stage) then v_drop.stage
                 else k.stage end,
    review_flags = array_remove(k.review_flags, 'possible_duplicate')
  where k.id = p_keep;

  update public.prospects set review_status = 'merged', merged_into = p_keep, outreach_approved = false,
    review_flags = '{}', reviewed_by = auth.uid(), reviewed_at = now(), assigned_rep_id = null
  where id = p_drop;

  perform public.refresh_review_status(p_keep);
  perform public.score_prospect(p_keep);
  perform public.log_review(p_keep, 'merge', v_keep.review_status, v_keep.review_status, p_note,
    jsonb_build_object('merged_prospect_id', p_drop, 'merged_name', v_drop.name));
  perform public.log_review(p_drop, 'merged_into', v_drop.review_status, 'merged', p_note,
    jsonb_build_object('kept_prospect_id', p_keep, 'kept_name', v_keep.name));
  perform public.write_audit(v_keep.manufacturer_id, 'merge_prospects', 'prospect', p_keep,
    jsonb_build_object('dropped', p_drop, 'note', p_note));
  return p_keep;
end
$$;

-- Decide a suspected duplicate flagged during discovery.
create or replace function public.resolve_duplicate(p_candidate uuid, p_merge boolean, p_note text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_mc public.merge_candidates%rowtype;
  v_campaign uuid;
begin
  if not public.has_permission('resolve_duplicates') then
    perform public.app_error('forbidden', 'You do not have permission to resolve duplicates', null);
  end if;
  select * into v_mc from public.merge_candidates where id = p_candidate for update;
  if not found or v_mc.manufacturer_id is distinct from public.auth_mid() then
    perform public.app_error('not_found', 'Duplicate warning not found', 'id');
  end if;
  if v_mc.status <> 'pending' then
    perform public.app_error('already_resolved', 'This duplicate warning was already resolved', null);
  end if;

  if p_merge then
    perform public.merge_prospects(v_mc.prospect_id, v_mc.candidate_prospect_id, p_note);
  else
    update public.merge_candidates set status = 'distinct', resolved_by = auth.uid(), resolved_at = now(),
      decision_note = p_note where id = p_candidate;
    -- only clear the flag if no other duplicate warning remains open
    if not exists (select 1 from public.merge_candidates where status = 'pending'
                   and (candidate_prospect_id = v_mc.candidate_prospect_id)) then
      update public.prospects set review_flags = array_remove(review_flags, 'possible_duplicate')
      where id = v_mc.candidate_prospect_id;
    end if;
    perform public.refresh_review_status(v_mc.candidate_prospect_id);
    perform public.log_review(v_mc.candidate_prospect_id, 'keep_separate', null, null, p_note,
      jsonb_build_object('other_prospect_id', v_mc.prospect_id, 'similarity', v_mc.similarity));
  end if;

  select campaign_id into v_campaign from public.prospects where id = coalesce(v_mc.candidate_prospect_id, v_mc.prospect_id);
  if v_campaign is not null then
    perform public.advance_campaign(v_campaign);
  end if;
  return jsonb_build_object('ok', true, 'merged', p_merge);
end
$$;

-- Manual merge from Lead Review (pick any two records).
create or replace function public.merge_prospect_records(p_keep uuid, p_drop uuid, p_note text default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.has_permission('resolve_duplicates') then
    perform public.app_error('forbidden', 'You do not have permission to merge prospects', null);
  end if;
  return public.merge_prospects(p_keep, p_drop, p_note);
end
$$;

-- Assign approved prospects to a rep.
create or replace function public.assign_prospects(p_ids uuid[], p_rep uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_mid uuid := public.auth_mid();
  v_p public.prospects%rowtype;
  v_done integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_rep_name text;
begin
  if not public.has_permission('assign_leads') then
    perform public.app_error('forbidden', 'You do not have permission to assign leads', null);
  end if;
  select full_name into v_rep_name from public.profiles
  where user_id = p_rep and manufacturer_id = v_mid and role = 'rep' and active;
  if not found then
    perform public.app_error('invalid_rep', 'Choose an active rep from your team', 'rep');
  end if;
  for v_p in select * from public.prospects where id = any (p_ids) and manufacturer_id = v_mid for update loop
    if v_p.review_status <> 'approved' then
      v_skipped := v_skipped || jsonb_build_object('id', v_p.id, 'name', v_p.name, 'reason', 'not_approved');
      continue;
    end if;
    update public.prospects set assigned_rep_id = p_rep where id = v_p.id;
    insert into public.prospect_events (manufacturer_id, prospect_id, kind, body, actor_id, data)
    values (v_mid, v_p.id, 'assignment', 'Assigned to ' || coalesce(v_rep_name, 'rep'), auth.uid(),
            jsonb_build_object('rep', p_rep, 'previous', v_p.assigned_rep_id));
    perform public.log_review(v_p.id, 'assign', v_p.review_status, v_p.review_status, null,
      jsonb_build_object('rep', p_rep, 'rep_name', v_rep_name, 'previous', v_p.assigned_rep_id));
    v_done := v_done + 1;
  end loop;
  if v_done > 0 then
    perform public.notify_users(v_mid, array[p_rep], 'lead_assigned',
      format('%s new lead%s assigned to you', v_done, case when v_done > 1 then 's' else '' end),
      'Open your leads to start', '/rep/leads', 'assigned_batch:' || p_rep || ':' || to_char(now(), 'YYYYMMDDHH24MISS'),
      '{in_app,push}');
  end if;
  return jsonb_build_object('assigned', v_done, 'skipped', v_skipped);
end
$$;

-- Manufacturer uploads its own buyer list (CSV) into a campaign; rows flow
-- through the same cleaning, dedupe, scoring and review pipeline.
create or replace function public.import_prospect_records(p_campaign uuid, p_rows jsonb, p_origin_note text default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_source uuid;
  v_row jsonb;
  v_count integer := 0;
begin
  if not public.has_permission('review_leads') then
    perform public.app_error('forbidden', 'You do not have permission to import leads', null);
  end if;
  select * into v_campaign from public.campaigns where id = p_campaign;
  if not found or v_campaign.manufacturer_id is distinct from public.auth_mid() then
    perform public.app_error('not_found', 'Campaign not found', 'campaign_id');
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    perform public.app_error('no_rows', 'The file has no rows', 'rows');
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    perform public.app_error('too_many_rows', 'Import at most 2,000 rows at a time', 'rows');
  end if;
  select id into v_source from public.sources where adapter = 'csv_upload' and enabled
    and coalesce(trim(lawful_basis), '') <> '' limit 1;
  if v_source is null then
    perform public.app_error('source_disabled', 'File import is not enabled on this platform', null);
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    if coalesce(trim(v_row ->> 'name'), '') = '' then
      continue;
    end if;
    insert into public.raw_records (manufacturer_id, campaign_id, source_id, external_id, payload)
    values (v_campaign.manufacturer_id, p_campaign, v_source,
            coalesce(v_row ->> 'external_id', md5(coalesce(v_row ->> 'name', '') || coalesce(v_row ->> 'phone', '') || coalesce(v_row ->> 'address', ''))),
            v_row || jsonb_build_object('origin', 'manufacturer_upload', 'uploaded_by', auth.uid(), 'origin_note', p_origin_note))
    on conflict (campaign_id, source_id, external_id) do nothing;
    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  insert into public.campaign_jobs (manufacturer_id, campaign_id, step, source_id, status, records, started_at, finished_at)
  values (v_campaign.manufacturer_id, p_campaign, 'ingest', v_source, 'done', v_count, now(), now())
  on conflict (campaign_id, step, source_id) do update
    set records = public.campaign_jobs.records + excluded.records, status = 'done', finished_at = now();

  update public.campaigns set stalled_step = null,
    status = case when status in ('draft', 'failed') then 'discovering' else status end,
    status_detail = case when status in ('draft', 'failed', 'discovering') then 'Cleaning uploaded records' else status_detail end
  where id = p_campaign;

  perform public.normalize_campaign_records(p_campaign);
  perform public.write_audit(v_campaign.manufacturer_id, 'import_prospect_records', 'campaign', p_campaign,
    jsonb_build_object('rows', v_count, 'note', p_origin_note));
  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Campaign state machine: discovery -> lead review -> ready -> live
-- ---------------------------------------------------------------------------
create or replace function public.advance_campaign(p_campaign uuid)
returns public.campaign_status
language plpgsql security definer
set search_path = public
as $$
declare
  v_c public.campaigns%rowtype;
  v_ingest_open integer;
  v_ingest_failed integer;
  v_in_pipeline integer;
  v_awaiting integer;
  v_flagged integer;
  v_approved integer;
  v_rejected integer;
  v_total integer;
  v_dupes integer;
  v_status public.campaign_status;
  v_detail text;
  v_stalled text;
  v_first_complete boolean := false;
begin
  select * into v_c from public.campaigns where id = p_campaign for update;
  if not found or v_c.status in ('paused', 'completed') then
    return v_c.status;
  end if;

  select count(*) filter (where status in ('queued', 'running')), count(*) filter (where status = 'failed')
  into v_ingest_open, v_ingest_failed
  from public.campaign_jobs where campaign_id = p_campaign and step = 'ingest';

  select count(*) filter (where pipeline_step <> 'done' and review_status <> 'merged'),
         count(*) filter (where pipeline_step = 'done' and review_status in ('pending', 'needs_review')),
         count(*) filter (where review_status = 'needs_review'),
         count(*) filter (where review_status = 'approved'),
         count(*) filter (where review_status = 'rejected'),
         count(*) filter (where review_status <> 'merged')
  into v_in_pipeline, v_awaiting, v_flagged, v_approved, v_rejected, v_total
  from public.prospects where campaign_id = p_campaign;

  select count(*) into v_dupes from public.merge_candidates where campaign_id = p_campaign and status = 'pending';

  if v_ingest_open > 0 then
    v_status := 'discovering';
    v_detail := format('Finding buyers (%s found so far)', v_total);
  elsif v_total = 0 then
    v_status := case when v_ingest_failed > 0 then 'failed' else 'discovering' end;
    v_detail := case when v_ingest_failed > 0 then 'Every source failed' else 'Waiting for buyer records (import a file to add your own)' end;
    v_stalled := 'ingest';
  elsif v_in_pipeline > 0 then
    v_status := 'scoring';
    v_detail := format('Cleaning, researching and scoring %s of %s', v_total - v_in_pipeline, v_total);
  else
    v_first_complete := v_c.discovery_completed_at is null;
    if v_awaiting > 0 or v_dupes > 0 then
      v_status := 'lead_review';
      v_detail := format('%s awaiting your review (%s with warnings, %s possible duplicates) · %s approved · %s rejected',
                         v_awaiting, v_flagged, v_dupes, v_approved, v_rejected);
    elsif v_approved > 0 then
      v_status := 'ready';
      v_detail := format('%s approved prospects ready for outreach · %s rejected', v_approved, v_rejected);
    else
      v_status := 'lead_review';
      v_detail := 'No approved prospects yet. Import more buyers or start a new campaign';
    end if;
  end if;

  -- Outreach can already be running for approved prospects while review continues.
  if v_c.status = 'live' then
    update public.campaigns
    set status_detail = case when v_awaiting > 0 then format('Outreach running · %s still awaiting review', v_awaiting)
                             else 'Outreach running' end,
        discovery_completed_at = coalesce(discovery_completed_at, case when v_in_pipeline = 0 and v_ingest_open = 0 then now() end)
    where id = p_campaign;
    return 'live';
  end if;

  update public.campaigns
  set status = v_status, status_detail = v_detail, stalled_step = v_stalled,
      discovery_completed_at = case when v_status in ('lead_review', 'ready') then coalesce(discovery_completed_at, now())
                                    else discovery_completed_at end,
      ready_at = case when v_status = 'ready' and ready_at is null then now() else ready_at end
  where id = p_campaign;

  if v_first_complete and v_status in ('lead_review', 'ready') then
    perform public.notify_users(v_c.manufacturer_id, public.permitted_users(v_c.manufacturer_id, 'review_leads'),
      'leads_awaiting_review', 'Discovery complete: ' || v_c.name,
      format('%s prospects are waiting for your review', v_awaiting), '/leads?campaign=' || p_campaign,
      'discovery_complete:' || p_campaign, '{in_app,push,email}');
    if v_dupes > 0 then
      perform public.notify_users(v_c.manufacturer_id, public.permitted_users(v_c.manufacturer_id, 'resolve_duplicates'),
        'duplicates_need_decision', 'Possible duplicates: ' || v_c.name,
        format('%s records may be duplicates and need a decision', v_dupes),
        '/leads?campaign=' || p_campaign || '&status=needs_review', 'duplicates:' || p_campaign, '{in_app}');
    end if;
  end if;

  if v_status = 'ready' and v_c.status <> 'ready' then
    perform public.notify_users(v_c.manufacturer_id, public.permitted_users(v_c.manufacturer_id, 'launch_campaigns'),
      'campaign_ready', 'Ready to launch: ' || v_c.name, v_detail, '/campaigns/' || p_campaign,
      'campaign_ready:' || p_campaign, '{in_app,push,email}');
  end if;
  return v_status;
end
$$;

-- Release approved prospects for outreach (selected ones, or all eligible).
-- Prospects still under review are never touched; consent rules still apply
-- message by message in enqueue_outbound_message.
create or replace function public.approve_outreach(p_prospect_ids uuid[], p_rep uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_mid uuid := public.auth_mid();
  v_p public.prospects%rowtype;
  v_contact public.contacts%rowtype;
  v_rep uuid;
  v_conv uuid;
  v_ai integer := 0;
  v_rep_tasks integer := 0;
  v_skipped integer := 0;
  v_campaign uuid;
begin
  if not public.has_permission('launch_campaigns') then
    perform public.app_error('forbidden', 'You do not have permission to launch outreach', null);
  end if;
  if p_rep is not null and not exists (select 1 from public.profiles where user_id = p_rep and manufacturer_id = v_mid and role = 'rep' and active) then
    perform public.app_error('invalid_rep', 'Rep not found in your team', 'rep');
  end if;

  select count(*) into v_skipped from public.prospects
  where id = any (p_prospect_ids) and manufacturer_id = v_mid and review_status <> 'approved';

  for v_p in
    select * from public.prospects
    where id = any (p_prospect_ids) and manufacturer_id = v_mid and review_status = 'approved' and not outreach_approved
    for update
  loop
    v_rep := coalesce(p_rep, v_p.assigned_rep_id, public.pick_rep(v_mid));
    update public.prospects set outreach_approved = true, outreach_approved_at = now(), assigned_rep_id = v_rep
    where id = v_p.id;
    v_campaign := coalesce(v_campaign, v_p.campaign_id);

    select * into v_contact from public.contacts where prospect_id = v_p.id and is_primary and phone_e164 is not null limit 1;
    if v_contact.id is not null and public.consent_status_for(v_contact.id) = 'opted_in' then
      insert into public.conversations (manufacturer_id, prospect_id, contact_id, channel)
      values (v_mid, v_p.id, v_contact.id, 'whatsapp')
      on conflict (contact_id, channel) do update set prospect_id = excluded.prospect_id
      returning id into v_conv;
      perform public.enqueue_ai_turn(v_conv, 'outreach_opener', null, jsonb_build_object('campaign_id', v_p.campaign_id));
      v_ai := v_ai + 1;
    else
      v_rep_tasks := v_rep_tasks + 1;
    end if;
    if v_rep is not null then
      perform public.notify_users(v_mid, array[v_rep], 'lead_assigned', 'New lead: ' || v_p.name,
        coalesce(v_p.city, '') || ' · fit ' || coalesce(round(v_p.fit_score)::text, '–'),
        '/rep/leads/' || v_p.id, 'assigned:' || v_p.id || ':' || v_rep, '{in_app}');
    end if;
    insert into public.prospect_events (manufacturer_id, prospect_id, kind, body, actor_id, data)
    values (v_mid, v_p.id, 'assignment', 'Released for outreach', auth.uid(), jsonb_build_object('rep', v_rep));
    v_contact := null;
  end loop;

  if v_campaign is not null then
    update public.campaigns set status = 'live', launched_at = coalesce(launched_at, now())
    where id = v_campaign and status in ('lead_review', 'ready');
    perform public.advance_campaign(v_campaign);
  end if;
  return jsonb_build_object('ai_openers', v_ai, 'rep_tasks', v_rep_tasks, 'skipped_not_approved', v_skipped);
end
$$;

create or replace function public.launch_campaign(p_campaign uuid, p_min_fit numeric default 0)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if not public.has_permission('launch_campaigns') then
    perform public.app_error('forbidden', 'You do not have permission to launch outreach', null);
  end if;
  select array_agg(id) into v_ids from public.prospects
  where campaign_id = p_campaign and manufacturer_id = public.auth_mid()
    and review_status = 'approved' and not outreach_approved and coalesce(fit_score, 0) >= coalesce(p_min_fit, 0);
  if v_ids is null then
    return jsonb_build_object('ai_openers', 0, 'rep_tasks', 0, 'skipped_not_approved', 0);
  end if;
  return public.approve_outreach(v_ids, null);
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Analytics for manufacturer-managed review
-- ---------------------------------------------------------------------------
create or replace view public.v_review_stats with (security_invoker = true) as
select p.manufacturer_id,
       p.campaign_id,
       count(*) filter (where p.review_status <> 'merged') as discovered,
       count(*) filter (where p.review_status = 'pending' and p.pipeline_step = 'done') as pending_review,
       count(*) filter (where p.review_status = 'needs_review') as needs_review,
       count(*) filter (where p.review_status = 'approved') as approved,
       count(*) filter (where p.review_status = 'rejected') as rejected,
       count(*) filter (where p.review_status = 'merged') as merged,
       count(*) filter (where p.outreach_approved) as outreach_started,
       round((percentile_cont(0.5) within group (order by extract(epoch from p.reviewed_at - p.created_at) / 3600.0)
              filter (where p.reviewed_at is not null and p.review_status in ('approved', 'rejected')))::numeric, 1)
         as median_review_hours
from public.prospects p
group by p.manufacturer_id, p.campaign_id;

create or replace view public.v_duplicate_stats with (security_invoker = true) as
select manufacturer_id, campaign_id,
       count(*) filter (where status = 'pending') as pending,
       count(*) filter (where status = 'merged') as merged,
       count(*) filter (where status = 'distinct') as kept_separate
from public.merge_candidates
group by manufacturer_id, campaign_id;

grant select on public.v_review_stats, public.v_duplicate_stats to authenticated;

-- ---------------------------------------------------------------------------
-- 9. System admin observability (aggregates only, no buyer data)
-- ---------------------------------------------------------------------------
create or replace function public.sysadmin_platform_health()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if not (public.is_system_admin() or public.is_trusted()) then
    perform public.app_error('forbidden', 'System administrators only', null);
  end if;
  return jsonb_build_object(
    'failed_messages_24h', (select count(*) from public.messages where status = 'failed' and created_at > now() - interval '24 hours'),
    'blocked_messages_24h', (select count(*) from public.messages where status = 'blocked' and created_at > now() - interval '24 hours'),
    'failed_ai_turns_24h', (select count(*) from public.ai_turns where status = 'failed' and created_at > now() - interval '24 hours'),
    'stalled_campaigns', (select coalesce(jsonb_agg(jsonb_build_object('tenant', m.name, 'campaign_id', c.id,
                             'status', c.status, 'stalled_step', c.stalled_step, 'since', c.created_at)), '[]'::jsonb)
                          from public.campaigns c join public.manufacturers m on m.id = c.manufacturer_id
                          where c.stalled_step is not null or c.status = 'failed'),
    'failed_jobs', (select coalesce(jsonb_agg(jsonb_build_object('tenant', m.name, 'step', j.step, 'error', left(j.error, 300),
                        'attempts', j.attempts, 'at', coalesce(j.finished_at, j.created_at)) order by j.created_at desc), '[]'::jsonb)
                    from (select * from public.campaign_jobs where status = 'failed' order by created_at desc limit 50) j
                    join public.manufacturers m on m.id = j.manufacturer_id)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 10. Migrate existing data
-- ---------------------------------------------------------------------------
-- Low confidence classification notes become review flags.
update public.prospects
set review_flags = array['low_classification_confidence'],
    review_status = case when review_status = 'pending' then 'needs_review'::public.review_status else review_status end
where attention_reason is not null and review_status in ('pending', 'needs_review');

-- Gray zone duplicates that were hidden in the old ops merge queue become real
-- prospects flagged for the manufacturer.
do $$
declare
  r record;
  v_new uuid;
begin
  for r in
    select mc.* from public.merge_candidates mc
    where mc.status = 'pending' and mc.candidate_prospect_id is null
  loop
    update public.raw_records set status = 'new' where id = r.raw_record_id and status = 'duplicate_review';
    v_new := public.create_prospect_from_raw(r.raw_record_id);
    update public.merge_candidates set candidate_prospect_id = v_new where id = r.id;
    update public.prospects
    set review_flags = array['possible_duplicate'], review_status = 'needs_review',
        attention_reason = format('Possible duplicate (%s%% similar)', round(r.similarity * 100))
    where id = v_new;
  end loop;
end
$$;
