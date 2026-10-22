begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

create or replace function pg_temp.as_user(p_user uuid, p_role text, p_mid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated',
    'app_role', p_role, 'manufacturer_id', p_mid)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;
create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

select plan(31);

create temp table ids (k text primary key, v uuid);
grant select on ids to anon, authenticated;

create temp table vals (k text primary key, v jsonb);
grant select on vals to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Anonymous visitors: plans and the counter only
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
select is((select count(*) from plans)::int, 3, 'anyone can read the three active plans');
select is((select monthly_price_paise from plans where code = 'basic'), 500000::bigint, 'Basic costs Rs 5,000 a month');
select ok((public_stats() ->> 'waitlist_count')::int >= 4, 'the public counter includes the seeded waitlist');
select throws_ok($$ select count(*) from waitlist_entries $$, '42501', null, 'anonymous visitors cannot read waitlist rows');
select throws_ok($$ select count(*) from tenant_applications $$, '42501', null, 'anonymous visitors cannot read applications');
select throws_ok($$ select submit_tenant_application('{}'::jsonb, 'x') $$, '42501', null,
  'anonymous visitors cannot call the submit function directly');

-- ---------------------------------------------------------------------------
-- 2. Submitting an application (as the public-signup function does)
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
insert into vals values ('count_before', to_jsonb((public_stats() ->> 'waitlist_count')::int));

insert into vals select 'submit', submit_tenant_application('{
  "plan_code": "growth", "billing_cycle": "yearly", "company_name": "Narmada Agro Foods",
  "gstin": "23AAJCN1111K1Z1", "state": "Madhya Pradesh", "city": "Bhopal",
  "owner_name": "Kiran Rao", "owner_email": "Kiran@NarmadaAgro.test", "owner_phone": "98260 55501",
  "terms_version": "2026-10-20"
}'::jsonb, 'hash-narmada-1', 'ip-1', 'pgtap');
insert into ids select 'app', (v ->> 'application_id')::uuid from vals where k = 'submit';

select is((select status from tenant_applications where id = (select v from ids where k = 'app')), 'pending_payment',
  'a new application waits for payment');
select is((select amount_paise from tenant_applications where id = (select v from ids where k = 'app')), 8640000::bigint,
  'the yearly Growth price is frozen on the application');
select is((select owner_email from tenant_applications where id = (select v from ids where k = 'app')), 'kiran@narmadaagro.test',
  'the owner email is stored in lower case');
select is((select status from subscription_payments where application_id = (select v from ids where k = 'app')), 'pending',
  'a placeholder payment row waits alongside it');
select is((public_stats() ->> 'waitlist_count')::int, (select v::int from vals where k = 'count_before') + 1,
  'submitting the form adds one to the waitlist counter');
select ok(exists (select 1 from notifications n join profiles p on p.user_id = n.user_id
                  where p.role = 'system_admin' and n.link like '/system/applications%'),
  'system admins are notified of the new application');

-- The same email again updates the open application instead of duplicating it
select is((submit_tenant_application('{
  "plan_code": "scale", "billing_cycle": "monthly", "company_name": "Narmada Agro Foods Pvt Ltd",
  "state": "Madhya Pradesh", "owner_name": "Kiran Rao", "owner_email": "kiran@narmadaagro.test",
  "owner_phone": "9826055501", "terms_version": "2026-10-20"
}'::jsonb, 'hash-narmada-2', 'ip-1', 'pgtap') ->> 'updated')::boolean, true, 'a second submit by the same email updates the open application');
select is((select count(*) from tenant_applications where lower(owner_email) = 'kiran@narmadaagro.test')::int, 1,
  'there is still one application for that email');
select is((public_stats() ->> 'waitlist_count')::int, (select v::int from vals where k = 'count_before') + 1,
  'resubmitting does not count the same person twice');
select is((select amount_paise from tenant_applications where id = (select v from ids where k = 'app')), 2000000::bigint,
  'the price follows the newly chosen plan');

-- Validation lives in the database
select throws_ok($$ select submit_tenant_application('{"plan_code":"gold","billing_cycle":"monthly","company_name":"X Co","state":"Goa","owner_name":"Al B","owner_email":"a@b.test","owner_phone":"9800000123","terms_version":"v"}'::jsonb, 'h-a') $$,
  'P0001', 'invalid_plan', 'an unknown plan is rejected');
select throws_ok($$ select submit_tenant_application('{"plan_code":"basic","billing_cycle":"monthly","company_name":"X Co","state":"Goa","gstin":"27AAJCN1111K1Z1","owner_name":"Al B","owner_email":"a@b.test","owner_phone":"9800000123","terms_version":"v"}'::jsonb, 'h-b') $$,
  'P0001', 'gstin_state_mismatch', 'a GSTIN from another state is rejected');
select throws_ok($$ select submit_tenant_application('{"plan_code":"basic","billing_cycle":"monthly","company_name":"X Co","state":"Goa","owner_name":"Al B","owner_email":"a@b.test","owner_phone":"9800000123"}'::jsonb, 'h-c') $$,
  'P0001', 'terms_required', 'the Terms must be accepted');
select throws_ok($$ select submit_tenant_application('{"plan_code":"basic","billing_cycle":"monthly","company_name":"X Co","state":"Madhya Pradesh","owner_name":"Al B","owner_email":"owner@shakti.test","owner_phone":"9800000123","terms_version":"v"}'::jsonb, 'h-d') $$,
  'P0001', 'account_exists', 'an email that already has a workspace is told to sign in');

select is((application_status('hash-narmada-2') ->> 'status'), 'pending_payment', 'the private status link shows the application');
select throws_ok($$ select application_status('hash-narmada-1') $$, 'P0001', 'not_found', 'the replaced status link no longer works');

-- ---------------------------------------------------------------------------
-- 3. Activation: payment, manufacturer, subscription, owner
-- ---------------------------------------------------------------------------
insert into vals select 'prov', provision_tenant_from_application((select v from ids where k = 'app'), 'UTR 1234', 'manual');
insert into ids select 'mid', (v ->> 'manufacturer_id')::uuid from vals where k = 'prov';

select is((select name from manufacturers where id = (select v from ids where k = 'mid')), 'Narmada Agro Foods Pvt Ltd',
  'activation creates the manufacturer from the application');
select ok((select count(*) from autonomy_policies where manufacturer_id = (select v from ids where k = 'mid')) > 0,
  'the new tenant starts with the default autonomy policies');
select ok(exists (select 1 from subscriptions where manufacturer_id = (select v from ids where k = 'mid')
                  and plan_code = 'scale' and billing_cycle = 'monthly' and status = 'active'
                  and current_period_end = (current_date + interval '1 month')::date),
  'a monthly Scale subscription starts today');
select is((select status || ':' || provider_ref from subscription_payments where application_id = (select v from ids where k = 'app')),
  'paid:UTR 1234', 'the payment is recorded as paid with its reference');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-0000000000aa', 'authenticated', 'authenticated',
        'kiran@narmadaagro.test', now(), now());
select complete_tenant_activation((select v from ids where k = 'app'), 'b0000000-0000-4000-8000-0000000000aa', null);
select is((select role::text || ':' || manufacturer_id::text from profiles where user_id = 'b0000000-0000-4000-8000-0000000000aa'),
  'owner:' || (select v from ids where k = 'mid')::text, 'the applicant becomes the owner of the new workspace');
select throws_ok(format('select provision_tenant_from_application(%L, null, null)', (select v from ids where k = 'app')),
  'P0001', 'already_active', 'an active application cannot be activated twice');

-- ---------------------------------------------------------------------------
-- 4. Who sees what
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001', 'owner', '11111111-1111-4111-8111-111111111111');
select is((select string_agg(plan_code, ',') from subscriptions), 'growth', 'a manufacturer sees only its own subscription');
select is((select count(*) from tenant_applications)::int, 0, 'an owner cannot list applications');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004', 'system_admin', null);
select ok((select count(*) from tenant_applications) >= 2, 'the system admin can list applications');

select * from finish();
rollback;
