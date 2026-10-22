-- Self-serve signup: public plans, waitlist, tenant applications filled in by
-- the manufacturer, subscription payments (provider placeholder for now) and
-- subscriptions. Activation provisions the same tenant the system admin used
-- to create by hand.
--
--   landing -> plan -> application (pending_payment) -> payment (placeholder)
--           -> activation (admin today, payment webhook later) -> tenant + invite

-- ---------------------------------------------------------------------------
-- Plans (platform configuration, readable by anyone)
-- ---------------------------------------------------------------------------
create table public.plans (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  tagline text,
  monthly_price_paise bigint not null check (monthly_price_paise > 0),
  yearly_price_paise bigint not null check (yearly_price_paise > 0),
  features text[] not null default '{}',
  -- Display only for now: nothing in the product is blocked by these.
  limits jsonb not null default '{}'::jsonb,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Yearly billing is 20% off twelve months.
insert into public.plans (code, name, tagline, monthly_price_paise, yearly_price_paise, features, limits, is_featured, sort_order) values
  ('basic', 'Basic', 'For a first new market', 500000, 4800000,
   array['AI WhatsApp sales agent (English, Hindi, Hinglish)', 'Buyer discovery and Lead Review', 'Price floors and approval guardrails',
         'GST quotations and PO matching', 'Rep app with offline mode', 'Email support'],
   '{"seats": 3, "active_campaigns": 1, "prospects_per_month": 100}', false, 1),
  ('growth', 'Growth', 'For manufacturers expanding city by city', 900000, 8640000,
   array['Everything in Basic', 'Reorder predictions and follow ups', 'Analytics and AI health', 'Catalogue extraction to Product Brain',
         'Priority support'],
   '{"seats": 10, "active_campaigns": 3, "prospects_per_month": 400}', true, 2),
  ('scale', 'Scale', 'For multi-state sales teams', 2000000, 19200000,
   array['Everything in Growth', 'Unlimited campaigns', 'Delegated permissions for sales heads', 'Guided onboarding',
         'Dedicated success manager'],
   '{"seats": 25, "active_campaigns": null, "prospects_per_month": 1500}', false, 3);

-- ---------------------------------------------------------------------------
-- Waitlist (the public counter is the row count)
-- ---------------------------------------------------------------------------
create table public.waitlist_entries (
  id bigint generated always as identity primary key,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text,
  company text,
  phone text,
  source text not null default 'landing' check (source in ('landing', 'signup')),
  application_id uuid,
  created_at timestamptz not null default now()
);
create unique index waitlist_entries_email on public.waitlist_entries (lower(email));

-- ---------------------------------------------------------------------------
-- Tenant applications (what the system admin used to type in)
-- ---------------------------------------------------------------------------
create table public.tenant_applications (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'active', 'rejected', 'cancelled')),
  plan_code text not null references public.plans(code),
  billing_cycle text not null check (billing_cycle in ('monthly', 'yearly')),
  amount_paise bigint not null check (amount_paise > 0),
  company_name text not null,
  legal_name text,
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  state text not null,
  state_code text references public.india_states(code),
  city text,
  address text,
  company_phone text,
  company_email text,
  whatsapp_display_number text,
  owner_name text not null,
  owner_email text not null,
  owner_phone text not null check (owner_phone ~ '^\+[1-9][0-9]{7,14}$'),
  terms_version text not null,
  accepted_terms_at timestamptz not null,
  status_token_hash text not null unique,
  ip_hash text,
  user_agent text,
  manufacturer_id uuid references public.manufacturers(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  activated_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  rejection_reason text,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tenant_applications_open_email on public.tenant_applications (lower(owner_email))
  where status in ('pending_payment', 'paid');
create index on public.tenant_applications (status, created_at desc);
create index on public.tenant_applications (ip_hash, created_at desc);
create trigger tenant_applications_touch before update on public.tenant_applications
  for each row execute function public.touch_updated_at();

alter table public.waitlist_entries
  add constraint waitlist_entries_application_fk foreign key (application_id)
  references public.tenant_applications(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Subscription payments and subscriptions
-- ---------------------------------------------------------------------------
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.tenant_applications(id) on delete set null,
  manufacturer_id uuid references public.manufacturers(id) on delete cascade,
  provider text not null default 'placeholder',
  provider_ref text,
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index on public.subscription_payments (application_id);
create index on public.subscription_payments (manufacturer_id, created_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null unique references public.manufacturers(id) on delete cascade,
  plan_code text not null references public.plans(code),
  billing_cycle text not null check (billing_cycle in ('monthly', 'yearly')),
  status text not null default 'active' check (status in ('active', 'past_due', 'cancelled', 'trialing')),
  amount_paise bigint not null,
  current_period_start date not null,
  current_period_end date not null,
  application_id uuid references public.tenant_applications(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: anon reads plans only; tenants read their own subscription; the system
-- admin reads applications. Waitlist rows have no client access at all.
-- ---------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.tenant_applications enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.subscriptions enable row level security;

create policy public_read on public.plans for select to anon
  using (active);
create policy member_read on public.plans for select to authenticated
  using (active or public.is_system_admin());
create policy sysadmin_manage on public.plans for all to authenticated
  using (public.is_system_admin()) with check (public.is_system_admin());

create policy sysadmin_read on public.tenant_applications for select to authenticated
  using (public.is_system_admin());

create policy tenant_read on public.subscriptions for select to authenticated
  using (manufacturer_id = public.auth_mid() or public.is_system_admin());
create policy tenant_read on public.subscription_payments for select to authenticated
  using ((manufacturer_id is not null and manufacturer_id = public.auth_mid()) or public.is_system_admin());

grant select on public.plans to anon, authenticated;
grant insert, update on public.plans to authenticated;
grant select on public.tenant_applications, public.subscriptions, public.subscription_payments to authenticated;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Public counter and plans for the landing page (counts only, no rows).
create or replace function public.public_stats()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'waitlist_count', (select count(*) from public.waitlist_entries),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object(
                'code', code, 'name', name, 'tagline', tagline, 'monthly_price_paise', monthly_price_paise,
                'yearly_price_paise', yearly_price_paise, 'features', features, 'limits', limits,
                'is_featured', is_featured) order by sort_order), '[]'::jsonb)
              from public.plans where active)
  )
$$;

create or replace function public.waitlist_position(p_email text)
returns integer
language sql stable security definer
set search_path = public
as $$
  select count(*)::integer from public.waitlist_entries
  where id <= (select id from public.waitlist_entries where lower(email) = lower(trim(p_email)))
$$;

-- Adds an email to the waitlist once; returns the position and the count.
create or replace function public.join_waitlist(
  p_email text, p_name text default null, p_company text default null, p_phone text default null,
  p_source text default 'landing', p_application uuid default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_new boolean;
begin
  if not public.is_trusted() then
    perform public.app_error('forbidden', 'Use the public signup endpoint', null);
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    perform public.app_error('invalid_email', 'Enter a valid email address', 'email');
  end if;
  insert into public.waitlist_entries (email, name, company, phone, source, application_id)
  values (v_email, left(nullif(trim(p_name), ''), 120), left(nullif(trim(p_company), ''), 160),
          public.normalize_phone_e164(p_phone), coalesce(p_source, 'landing'), p_application)
  on conflict (lower(email)) do update
    set application_id = coalesce(public.waitlist_entries.application_id, excluded.application_id),
        company = coalesce(public.waitlist_entries.company, excluded.company),
        name = coalesce(public.waitlist_entries.name, excluded.name)
  returning (xmax = 0) into v_new;
  return jsonb_build_object('joined', v_new, 'position', public.waitlist_position(v_email),
                            'waitlist_count', (select count(*) from public.waitlist_entries));
end
$$;

-- Saves an application filled in by the manufacturer itself. Called by the
-- public-signup Edge Function (service role) after rate limiting.
create or replace function public.submit_tenant_application(
  p jsonb, p_status_token_hash text, p_ip_hash text default null, p_user_agent text default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
  v_cycle text := coalesce(p ->> 'billing_cycle', 'monthly');
  v_email text := lower(trim(coalesce(p ->> 'owner_email', '')));
  v_company_email text := nullif(lower(trim(coalesce(p ->> 'company_email', ''))), '');
  v_state_code text;
  v_gstin text := nullif(upper(trim(coalesce(p ->> 'gstin', ''))), '');
  v_owner_phone text := public.normalize_phone_e164(p ->> 'owner_phone');
  v_company_phone text;
  v_existing public.tenant_applications%rowtype;
  v_id uuid;
  v_amount bigint;
  v_wait jsonb;
begin
  if not public.is_trusted() then
    perform public.app_error('forbidden', 'Use the public signup endpoint', null);
  end if;

  select * into v_plan from public.plans where code = p ->> 'plan_code' and active;
  if not found then
    perform public.app_error('invalid_plan', 'Choose one of the available plans', 'plan_code');
  end if;
  if v_cycle not in ('monthly', 'yearly') then
    perform public.app_error('invalid_cycle', 'Billing must be monthly or yearly', 'billing_cycle');
  end if;
  if coalesce(length(trim(p ->> 'company_name')), 0) < 2 or length(p ->> 'company_name') > 160 then
    perform public.app_error('company_name_required', 'Enter your company name', 'company_name');
  end if;
  v_state_code := public.gst_state_code(p ->> 'state');
  if v_state_code is null then
    perform public.app_error('invalid_state', 'Choose your state', 'state');
  end if;
  if v_gstin is not null then
    if v_gstin !~ '^[0-9]{2}[A-Z0-9]{13}$' then
      perform public.app_error('invalid_gstin', 'GSTIN must be 15 characters', 'gstin');
    end if;
    if left(v_gstin, 2) <> v_state_code then
      perform public.app_error('gstin_state_mismatch', 'The GSTIN does not belong to the selected state', 'gstin');
    end if;
  end if;
  if coalesce(length(trim(p ->> 'owner_name')), 0) < 2 then
    perform public.app_error('owner_name_required', 'Enter your full name', 'owner_name');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    perform public.app_error('invalid_email', 'Enter a valid email address', 'owner_email');
  end if;
  if v_company_email is not null and v_company_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform public.app_error('invalid_email', 'Enter a valid company email', 'company_email');
  end if;
  if v_owner_phone is null then
    perform public.app_error('invalid_phone', 'Enter a 10 digit Indian mobile number', 'owner_phone');
  end if;
  if coalesce(p ->> 'company_phone', '') <> '' then
    v_company_phone := public.normalize_phone_e164(p ->> 'company_phone');
    if v_company_phone is null then
      perform public.app_error('invalid_phone', 'Enter a valid company phone number', 'company_phone');
    end if;
  end if;
  if coalesce(p ->> 'terms_version', '') = '' then
    perform public.app_error('terms_required', 'Accept the Terms and Privacy Policy to continue', 'terms');
  end if;
  if exists (select 1 from public.profiles where lower(email) = v_email and active) then
    perform public.app_error('account_exists', 'This email already has a Distrik account. Sign in instead.', 'owner_email');
  end if;
  if p_ip_hash is not null and (select count(*) from public.tenant_applications
      where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 5 then
    perform public.app_error('too_many_requests', 'Too many applications from this network. Try again later.', null);
  end if;

  v_amount := case v_cycle when 'yearly' then v_plan.yearly_price_paise else v_plan.monthly_price_paise end;

  -- One open application per email: a resubmission updates it (and moves the
  -- status link to the new token) instead of creating a duplicate.
  select * into v_existing from public.tenant_applications
  where lower(owner_email) = v_email and status in ('pending_payment', 'paid') for update;

  if v_existing.id is not null then
    if v_existing.status = 'paid' then
      perform public.app_error('already_paid', 'Your workspace is being set up. Check your email.', 'owner_email');
    end if;
    update public.tenant_applications set
      plan_code = v_plan.code, billing_cycle = v_cycle, amount_paise = v_amount,
      company_name = trim(p ->> 'company_name'), legal_name = nullif(trim(coalesce(p ->> 'legal_name', '')), ''),
      gstin = v_gstin, state = (select name from public.india_states where code = v_state_code), state_code = v_state_code,
      city = nullif(initcap(trim(coalesce(p ->> 'city', ''))), ''), address = nullif(trim(coalesce(p ->> 'address', '')), ''),
      company_phone = v_company_phone, company_email = v_company_email,
      whatsapp_display_number = nullif(trim(coalesce(p ->> 'whatsapp_display_number', '')), ''),
      owner_name = trim(p ->> 'owner_name'), owner_phone = v_owner_phone,
      terms_version = p ->> 'terms_version', accepted_terms_at = now(),
      status_token_hash = p_status_token_hash, ip_hash = coalesce(p_ip_hash, ip_hash), user_agent = left(p_user_agent, 300)
    where id = v_existing.id;
    update public.subscription_payments set amount_paise = v_amount
    where application_id = v_existing.id and status = 'pending';
    v_id := v_existing.id;
  else
    insert into public.tenant_applications (plan_code, billing_cycle, amount_paise, company_name, legal_name, gstin, state,
      state_code, city, address, company_phone, company_email, whatsapp_display_number, owner_name, owner_email,
      owner_phone, terms_version, accepted_terms_at, status_token_hash, ip_hash, user_agent)
    values (v_plan.code, v_cycle, v_amount, trim(p ->> 'company_name'), nullif(trim(coalesce(p ->> 'legal_name', '')), ''),
      v_gstin, (select name from public.india_states where code = v_state_code), v_state_code,
      nullif(initcap(trim(coalesce(p ->> 'city', ''))), ''), nullif(trim(coalesce(p ->> 'address', '')), ''),
      v_company_phone, v_company_email, nullif(trim(coalesce(p ->> 'whatsapp_display_number', '')), ''),
      trim(p ->> 'owner_name'), v_email, v_owner_phone, p ->> 'terms_version', now(), p_status_token_hash, p_ip_hash,
      left(p_user_agent, 300))
    returning id into v_id;
    -- The payment step is a placeholder until a gateway is connected.
    insert into public.subscription_payments (application_id, provider, amount_paise, status)
    values (v_id, 'placeholder', v_amount, 'pending');
    perform public.notify_users(null, public.sysadmin_users(), 'tenant_application',
      'New signup: ' || trim(p ->> 'company_name'),
      format('%s plan (%s), %s', v_plan.name, v_cycle, (select name from public.india_states where code = v_state_code)),
      '/system/applications?id=' || v_id, 'application:' || v_id, '{in_app,email}');
  end if;

  v_wait := public.join_waitlist(v_email, p ->> 'owner_name', p ->> 'company_name', p ->> 'owner_phone', 'signup', v_id);

  return jsonb_build_object('application_id', v_id, 'status', 'pending_payment', 'updated', v_existing.id is not null,
    'plan_name', v_plan.name, 'billing_cycle', v_cycle, 'amount_paise', v_amount,
    'waitlist_position', v_wait -> 'position', 'waitlist_count', v_wait -> 'waitlist_count');
end
$$;

-- What the public status page may show (looked up by the hashed token).
create or replace function public.application_status(p_status_token_hash text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  a public.tenant_applications%rowtype;
  v_plan public.plans%rowtype;
begin
  if not public.is_trusted() then
    perform public.app_error('forbidden', 'Use the public signup endpoint', null);
  end if;
  select * into a from public.tenant_applications where status_token_hash = p_status_token_hash;
  if not found then
    perform public.app_error('not_found', 'This link is no longer valid', null);
  end if;
  select * into v_plan from public.plans where code = a.plan_code;
  return jsonb_build_object(
    'status', a.status, 'company_name', a.company_name, 'owner_name', a.owner_name,
    'owner_email', regexp_replace(a.owner_email, '^(.).*(@.*)$', '\1•••\2'),
    'plan_code', a.plan_code, 'plan_name', v_plan.name, 'billing_cycle', a.billing_cycle, 'amount_paise', a.amount_paise,
    'waitlist_position', public.waitlist_position(a.owner_email),
    'waitlist_count', (select count(*) from public.waitlist_entries),
    'payment_status', (select status from public.subscription_payments where application_id = a.id
                       order by created_at desc limit 1),
    'created_at', a.created_at, 'activated_at', a.activated_at);
end
$$;

-- Step 1 of activation (payment confirmed): marks the payment paid, creates
-- the manufacturer (existing defaults and autonomy triggers apply) and its
-- subscription. Safe to retry after a failed invite: a paid application
-- returns its existing manufacturer.
create or replace function public.provision_tenant_from_application(
  p_application uuid, p_payment_ref text default 'manual', p_provider text default 'manual'
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  a public.tenant_applications%rowtype;
  v_mid uuid;
  v_end date;
begin
  if not public.is_trusted() then
    perform public.app_error('forbidden', 'Activation runs on the server', null);
  end if;
  select * into a from public.tenant_applications where id = p_application for update;
  if not found then
    perform public.app_error('not_found', 'Application not found', 'id');
  end if;
  if a.status = 'active' then
    perform public.app_error('already_active', 'This workspace is already active', null);
  end if;
  if a.status in ('rejected', 'cancelled') then
    perform public.app_error('not_activatable', 'This application was ' || a.status, null);
  end if;
  if exists (select 1 from public.profiles where lower(email) = lower(a.owner_email) and active) then
    perform public.app_error('account_exists', 'The owner email already has a Distrik account', null);
  end if;

  if a.status = 'paid' and a.manufacturer_id is not null then
    v_mid := a.manufacturer_id;
  else
    update public.subscription_payments
    set status = 'paid', paid_at = now(), provider = coalesce(p_provider, provider),
        provider_ref = coalesce(nullif(trim(p_payment_ref), ''), 'manual')
    where application_id = a.id and status = 'pending';
    if not found then
      insert into public.subscription_payments (application_id, provider, provider_ref, amount_paise, status, paid_at)
      values (a.id, coalesce(p_provider, 'manual'), coalesce(nullif(trim(p_payment_ref), ''), 'manual'), a.amount_paise, 'paid', now());
    end if;

    insert into public.manufacturers (name, legal_name, gstin, state, state_code, city, address, phone, email,
      whatsapp_display_number)
    values (a.company_name, a.legal_name, a.gstin, a.state, a.state_code, a.city, a.address, a.company_phone,
      coalesce(a.company_email, a.owner_email), a.whatsapp_display_number)
    returning id into v_mid;

    v_end := case a.billing_cycle when 'yearly' then current_date + interval '1 year' else current_date + interval '1 month' end;
    insert into public.subscriptions (manufacturer_id, plan_code, billing_cycle, status, amount_paise,
      current_period_start, current_period_end, application_id)
    values (v_mid, a.plan_code, a.billing_cycle, 'active', a.amount_paise, current_date, v_end, a.id);

    update public.subscription_payments set manufacturer_id = v_mid where application_id = a.id;
    update public.tenant_applications set status = 'paid', manufacturer_id = v_mid where id = a.id;
    perform public.write_audit(v_mid, 'provision_tenant', 'tenant_application', a.id,
      jsonb_build_object('plan', a.plan_code, 'cycle', a.billing_cycle, 'payment_ref', p_payment_ref));
  end if;

  return jsonb_build_object('manufacturer_id', v_mid, 'owner_email', a.owner_email, 'owner_name', a.owner_name,
                            'owner_phone', a.owner_phone, 'company_name', a.company_name);
end
$$;

-- Step 2 (owner invited through Auth): creates the owner profile and marks
-- the application active.
create or replace function public.complete_tenant_activation(p_application uuid, p_owner_user uuid, p_actor uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  a public.tenant_applications%rowtype;
begin
  if not public.is_trusted() then
    perform public.app_error('forbidden', 'Activation runs on the server', null);
  end if;
  select * into a from public.tenant_applications where id = p_application for update;
  if not found or a.status <> 'paid' or a.manufacturer_id is null then
    perform public.app_error('not_ready', 'Provision the application before completing activation', null);
  end if;
  insert into public.profiles (user_id, manufacturer_id, role, full_name, phone, email, approval_limit_paise)
  values (p_owner_user, a.manufacturer_id, 'owner', a.owner_name, a.owner_phone, a.owner_email, null)
  on conflict (user_id) do update set manufacturer_id = excluded.manufacturer_id, role = 'owner', active = true;
  update public.tenant_applications
  set status = 'active', owner_user_id = p_owner_user, activated_by = p_actor, activated_at = now()
  where id = a.id;
  perform public.write_audit(a.manufacturer_id, 'activate_tenant', 'tenant_application', a.id,
    jsonb_build_object('owner_user_id', p_owner_user, 'by', p_actor));
  return jsonb_build_object('ok', true, 'manufacturer_id', a.manufacturer_id, 'owner_user_id', p_owner_user);
end
$$;

-- Undo step 1 when the Auth invite fails, so activation can be retried cleanly.
create or replace function public.undo_tenant_provision(p_application uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  a public.tenant_applications%rowtype;
begin
  if not public.is_trusted() then
    perform public.app_error('forbidden', 'Activation runs on the server', null);
  end if;
  select * into a from public.tenant_applications where id = p_application for update;
  if not found or a.status <> 'paid' then
    return;
  end if;
  update public.tenant_applications set status = 'pending_payment', manufacturer_id = null where id = a.id;
  update public.subscription_payments set status = 'pending', paid_at = null, manufacturer_id = null
  where application_id = a.id and status = 'paid';
  if a.manufacturer_id is not null then
    delete from public.manufacturers where id = a.manufacturer_id;
  end if;
end
$$;

create or replace function public.reject_tenant_application(p_application uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  a public.tenant_applications%rowtype;
begin
  if not (public.is_system_admin() or public.is_trusted()) then
    perform public.app_error('forbidden', 'System administrators only', null);
  end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then
    perform public.app_error('reason_required', 'Give a reason for rejecting this application', 'reason');
  end if;
  select * into a from public.tenant_applications where id = p_application for update;
  if not found then
    perform public.app_error('not_found', 'Application not found', 'id');
  end if;
  if a.status not in ('pending_payment', 'paid') or a.manufacturer_id is not null then
    perform public.app_error('not_rejectable', 'Only applications waiting for payment can be rejected', null);
  end if;
  update public.tenant_applications
  set status = 'rejected', rejection_reason = p_reason, rejected_by = auth.uid(), rejected_at = now()
  where id = a.id;
  update public.subscription_payments set status = 'cancelled' where application_id = a.id and status = 'pending';
  perform public.write_audit(null, 'reject_tenant_application', 'tenant_application', a.id,
    jsonb_build_object('reason', p_reason, 'company', a.company_name));
  return jsonb_build_object('ok', true, 'status', 'rejected');
end
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.public_stats(), public.waitlist_position(text),
  public.join_waitlist(text, text, text, text, text, uuid),
  public.submit_tenant_application(jsonb, text, text, text),
  public.application_status(text),
  public.provision_tenant_from_application(uuid, text, text),
  public.complete_tenant_activation(uuid, uuid, uuid),
  public.undo_tenant_provision(uuid),
  public.reject_tenant_application(uuid, text)
from public, anon, authenticated;

grant execute on function public.public_stats() to anon, authenticated;
grant execute on function public.reject_tenant_application(uuid, text) to authenticated;
grant execute on function
  public.public_stats(), public.waitlist_position(text),
  public.join_waitlist(text, text, text, text, text, uuid),
  public.submit_tenant_application(jsonb, text, text, text),
  public.application_status(text),
  public.provision_tenant_from_application(uuid, text, text),
  public.complete_tenant_activation(uuid, uuid, uuid),
  public.undo_tenant_provision(uuid),
  public.reject_tenant_application(uuid, text)
to service_role;

alter publication supabase_realtime add table public.tenant_applications;

-- ---------------------------------------------------------------------------
-- System console helpers: tenants list with plan, WhatsApp connection
-- ---------------------------------------------------------------------------
-- Self-serve tenants arrive without a BSP phone number id; the system admin
-- connects WhatsApp after onboarding (the column is not client-writable).
create or replace function public.sysadmin_connect_whatsapp(
  p_manufacturer uuid, p_phone_number_id text, p_display_number text default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_display text;
begin
  if not (public.is_system_admin() or public.is_trusted()) then
    perform public.app_error('forbidden', 'System administrators only', null);
  end if;
  if coalesce(btrim(p_phone_number_id), '') = '' then
    perform public.app_error('invalid_input', 'Enter the BSP phone number id', 'whatsapp_phone_number_id');
  end if;
  if nullif(btrim(p_display_number), '') is not null then
    v_display := public.normalize_phone_e164(p_display_number);
    if v_display is null then
      perform public.app_error('invalid_input', 'Enter a valid display number', 'whatsapp_display_number');
    end if;
  end if;
  if exists (select 1 from public.manufacturers where whatsapp_phone_number_id = btrim(p_phone_number_id) and id <> p_manufacturer) then
    perform public.app_error('conflict', 'This phone number id is connected to another tenant', 'whatsapp_phone_number_id');
  end if;
  update public.manufacturers
  set whatsapp_phone_number_id = btrim(p_phone_number_id),
      whatsapp_display_number = coalesce(v_display, whatsapp_display_number)
  where id = p_manufacturer;
  if not found then
    perform public.app_error('not_found', 'Tenant not found', null);
  end if;
  perform public.write_audit(p_manufacturer, 'connect_whatsapp', 'manufacturer', p_manufacturer,
    jsonb_build_object('phone_number_id', btrim(p_phone_number_id)));
  return jsonb_build_object('ok', true);
end
$$;

drop function if exists public.sysadmin_tenants();
create function public.sysadmin_tenants()
returns table (
  id uuid, name text, legal_name text, city text, state text, gstin text,
  whatsapp_phone_number_id text, whatsapp_display_number text, created_at timestamptz,
  users bigint, products bigint, campaigns bigint,
  plan_code text, billing_cycle text, subscription_status text
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not (public.is_system_admin() or public.is_trusted()) then
    perform public.app_error('forbidden', 'System administrators only', null);
  end if;
  return query
  select m.id, m.name, m.legal_name, m.city, m.state, m.gstin, m.whatsapp_phone_number_id, m.whatsapp_display_number,
         m.created_at,
         (select count(*) from public.profiles p where p.manufacturer_id = m.id and p.active),
         (select count(*) from public.products p where p.manufacturer_id = m.id),
         (select count(*) from public.campaigns c where c.manufacturer_id = m.id),
         s.plan_code, s.billing_cycle, s.status
  from public.manufacturers m
  left join public.subscriptions s on s.manufacturer_id = m.id
  order by m.name;
end
$$;

revoke execute on function public.sysadmin_connect_whatsapp(uuid, text, text), public.sysadmin_tenants() from public, anon;
grant execute on function public.sysadmin_connect_whatsapp(uuid, text, text), public.sysadmin_tenants() to authenticated, service_role;
