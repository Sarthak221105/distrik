-- Row level security, privileges and the Custom Access Token Hook.
-- Frontend checks are a convenience; these policies and the RPC role checks
-- are the real enforcement (PRD sections 6, 13, 15).

-- ---------------------------------------------------------------------------
-- Custom Access Token Hook: copies manufacturer_id and app_role into the JWT.
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_claims jsonb := event -> 'claims';
  v_profile record;
begin
  select manufacturer_id, role into v_profile
  from public.profiles
  where user_id = (event ->> 'user_id')::uuid and active;

  if found then
    v_claims := jsonb_set(v_claims, '{app_role}', to_jsonb(v_profile.role::text));
    if v_profile.manufacturer_id is not null then
      v_claims := jsonb_set(v_claims, '{manufacturer_id}', to_jsonb(v_profile.manufacturer_id::text));
    else
      v_claims := v_claims - 'manufacturer_id';
    end if;
  else
    v_claims := v_claims - 'manufacturer_id' - 'app_role';
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.profiles to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Visibility helpers (security definer so policies do not recurse)
-- ---------------------------------------------------------------------------
create or replace function public.rep_can_see(p_prospect uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.auth_role() <> 'rep'
      or exists (select 1 from public.prospects where id = p_prospect and assigned_rep_id = auth.uid())
$$;

create or replace function public.rep_can_see_conversation(p_conversation uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.auth_role() <> 'rep'
      or exists (select 1 from public.conversations c
                 join public.prospects p on p.id = c.prospect_id
                 where c.id = p_conversation and p.assigned_rep_id = auth.uid())
$$;

create or replace function public.is_manager()
returns boolean
language sql stable
as $$
  select public.auth_role() in ('owner', 'sales_head')
$$;

-- ---------------------------------------------------------------------------
-- Privileges: browsers get select everywhere RLS allows, and writes only
-- where listed below. Everything else goes through security definer RPCs.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant select on public.india_states, public.stage_transitions to anon;

alter default privileges in schema public revoke all on tables from anon, authenticated;

-- Enable RLS on every table in public.
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end
$$;

-- Generic tenant read policy plus audited ops read on tenant tables.
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
    execute format(
      'create policy tenant_isolation on public.%I for all to authenticated
         using (manufacturer_id = public.auth_mid())
         with check (manufacturer_id = public.auth_mid())', t);
    execute format(
      'create policy ops_read on public.%I for select to authenticated using (public.is_ops())', t);
  end loop;
end
$$;

-- Reference tables
create policy read_all on public.india_states for select using (true);
create policy read_all on public.stage_transitions for select using (true);

-- Manufacturers: tenant reads its own row; owner edits profile fields.
create policy tenant_read on public.manufacturers for select to authenticated
  using (id = public.auth_mid() or public.is_ops());
create policy owner_update on public.manufacturers for update to authenticated
  using (id = public.auth_mid() and public.auth_role() = 'owner')
  with check (id = public.auth_mid());
create policy ops_write on public.manufacturers for all to authenticated
  using (public.is_ops()) with check (public.is_ops());
grant update (name, legal_name, gstin, state, state_code, city, address, phone, email, logo_path,
              settings, quote_prefix, whatsapp_display_number) on public.manufacturers to authenticated;
grant insert on public.manufacturers to authenticated;

-- Profiles
create policy self_or_tenant_read on public.profiles for select to authenticated
  using (user_id = auth.uid() or manufacturer_id = public.auth_mid() or public.is_ops());
create policy owner_manage_team on public.profiles for update to authenticated
  using (manufacturer_id = public.auth_mid() and public.auth_role() = 'owner')
  with check (manufacturer_id = public.auth_mid() and role <> 'ops_admin');
create policy self_update on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy auth_admin_read on public.profiles for select to supabase_auth_admin using (true);
grant update (full_name, phone, role, approval_limit_paise, active) on public.profiles to authenticated;

-- Self updates may not change role, limit or active flag.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted() or public.is_ops() then
    return new;
  end if;
  if public.auth_role() <> 'owner' and (new.role is distinct from old.role
      or new.approval_limit_paise is distinct from old.approval_limit_paise
      or new.active is distinct from old.active) then
    raise exception using errcode = 'P0001', message = 'forbidden', detail = 'Only an owner can change roles and limits';
  end if;
  if new.user_id = auth.uid() and new.role is distinct from old.role then
    raise exception using errcode = 'P0001', message = 'forbidden', detail = 'You cannot change your own role';
  end if;
  return new;
end
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- Prospects: manufacturers only ever see records that passed ops QA, and
-- reps only see the prospects assigned to them (restrictive policies).
create policy tenant_isolation on public.prospects for all to authenticated
  using (manufacturer_id = public.auth_mid())
  with check (manufacturer_id = public.auth_mid());
create policy ops_all on public.prospects for all to authenticated
  using (public.is_ops()) with check (public.is_ops());
create policy qa_gate on public.prospects as restrictive for select to authenticated
  using (public.is_ops() or review_status = 'approved');
create policy rep_assigned on public.prospects as restrictive for select to authenticated
  using (public.auth_role() <> 'rep' or assigned_rep_id = auth.uid());
grant update (qualification, assigned_rep_id) on public.prospects to authenticated;

-- Reps: restrictive assignment filter on prospect children.
do $$
declare
  t text;
begin
  foreach t in array array['contacts', 'conversations', 'negotiations', 'quotations', 'purchase_orders',
                           'orders', 'prospect_events', 'reorder_predictions'] loop
    execute format(
      'create policy rep_assigned on public.%I as restrictive for select to authenticated
         using (public.rep_can_see(prospect_id))', t);
  end loop;
  foreach t in array array['messages', 'followups'] loop
    execute format(
      'create policy rep_assigned on public.%I as restrictive for select to authenticated
         using (public.rep_can_see_conversation(conversation_id))', t);
  end loop;
end
$$;
create policy rep_assigned on public.human_approvals as restrictive for select to authenticated
  using (public.auth_role() <> 'rep' or public.rep_can_see(prospect_id));

-- Writes through PostgREST, restricted by role (the tenant_isolation policy
-- already pins the tenant; these restrictive policies add the role check).
do $$
declare
  t text;
begin
  foreach t in array array['products', 'discount_rules', 'territories', 'documents', 'knowledge_chunks'] loop
    execute format(
      'create policy managers_write on public.%I as restrictive for insert to authenticated
         with check (public.is_manager())', t);
    execute format(
      'create policy managers_update on public.%I as restrictive for update to authenticated
         using (public.is_manager())', t);
    execute format(
      'create policy managers_delete on public.%I as restrictive for delete to authenticated
         using (public.is_manager())', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;

create policy owner_write on public.autonomy_policies as restrictive for insert to authenticated
  with check (public.auth_role() = 'owner');
create policy owner_update on public.autonomy_policies as restrictive for update to authenticated
  using (public.auth_role() = 'owner');
create policy owner_delete on public.autonomy_policies as restrictive for delete to authenticated
  using (public.auth_role() = 'owner');
grant insert, update, delete on public.autonomy_policies to authenticated;

-- Pricing rules must stay consistent: floor within the product's allowed discount.
-- (hard_minimum <= floor is a table check.)

-- Shipments and payments are updated manually in MVP.
grant update (status, carrier, tracking_ref, dispatched_at, delivered_at, updated_by, updated_at)
  on public.shipments to authenticated;
grant update (status, paid_at, reference, updated_by, updated_at) on public.payments to authenticated;
create policy rep_assigned_write on public.shipments as restrictive for update to authenticated
  using (public.auth_role() <> 'rep'
         or exists (select 1 from public.orders o where o.id = order_id and public.rep_can_see(o.prospect_id)));
create policy rep_assigned_write on public.payments as restrictive for update to authenticated
  using (public.auth_role() <> 'rep'
         or exists (select 1 from public.orders o where o.id = order_id and public.rep_can_see(o.prospect_id)));

-- Product analytics events from the frontend.
grant insert on public.product_events to authenticated;

-- AI review: ops flag transcripts for the evaluation set.
grant update (flagged, flag_reason, flagged_by) on public.ai_actions to authenticated;
create policy ops_flag on public.ai_actions for update to authenticated
  using (public.is_ops()) with check (public.is_ops());

-- Templates: global (manufacturer_id null) plus tenant templates; ops manage
-- Meta approval state.
create policy read_templates on public.message_templates for select to authenticated
  using (manufacturer_id is null or manufacturer_id = public.auth_mid() or public.is_ops());
create policy managers_insert on public.message_templates for insert to authenticated
  with check (manufacturer_id = public.auth_mid() and public.is_manager() and meta_status in ('draft', 'submitted'));
create policy managers_update on public.message_templates for update to authenticated
  using (manufacturer_id = public.auth_mid() and public.is_manager() and meta_status in ('draft', 'rejected'))
  with check (manufacturer_id = public.auth_mid() and meta_status in ('draft', 'submitted'));
create policy ops_manage on public.message_templates for all to authenticated
  using (public.is_ops()) with check (public.is_ops());
grant insert, update on public.message_templates to authenticated;

-- Sources and prompt versions are platform level and ops managed.
create policy read_sources on public.sources for select to authenticated using (true);
create policy ops_manage on public.sources for all to authenticated using (public.is_ops()) with check (public.is_ops());
grant insert, update on public.sources to authenticated;
create policy ops_manage on public.prompt_versions for all to authenticated using (public.is_ops()) with check (public.is_ops());
grant insert, update on public.prompt_versions to authenticated;

-- Ops only tables.
create policy ops_all on public.raw_records for all to authenticated using (public.is_ops()) with check (public.is_ops());
create policy ops_all on public.merge_candidates for all to authenticated using (public.is_ops()) with check (public.is_ops());
grant update on public.raw_records to authenticated;

-- Notifications and push subscriptions belong to one user.
create policy own_rows on public.notifications for select to authenticated using (user_id = auth.uid());
create policy own_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant update (read_at) on public.notifications to authenticated;

create policy own_rows on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant insert, delete on public.push_subscriptions to authenticated;

-- Audit log: owners read their tenant, ops read everything.
create policy owner_read on public.audit_log for select to authenticated
  using ((manufacturer_id = public.auth_mid() and public.auth_role() = 'owner') or public.is_ops());

-- idempotency_keys: no client access (RLS on, no policy).

-- Ops writes on tenant data happen only through audited RPCs, so the
-- generic ops_read policies above are select only.
