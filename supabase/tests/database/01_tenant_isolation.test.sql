begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

create or replace function pg_temp.as_user(p_user uuid, p_role text, p_mid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated',
    'app_role', p_role, 'manufacturer_id', p_mid)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

select plan(16);

-- Shakti owner
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001', 'owner', '11111111-1111-4111-8111-111111111111');

select is((select count(*) from prospects where manufacturer_id = '22222222-2222-4222-8222-222222222222')::int, 0,
  'owner cannot read another tenant''s prospects');
select is((select count(*) from contacts where manufacturer_id = '22222222-2222-4222-8222-222222222222')::int, 0,
  'owner cannot read another tenant''s contacts');
select is((select count(*) from products where manufacturer_id = '22222222-2222-4222-8222-222222222222')::int, 0,
  'owner cannot read another tenant''s products');
select ok((select count(*) from prospects where review_status in ('pending', 'needs_review'))::int > 0,
  'the manufacturer sees its own prospects awaiting its review');
select ok((select count(*) from prospects)::int > 0, 'owner sees own approved prospects');

update products set name = 'hacked' where manufacturer_id = '22222222-2222-4222-8222-222222222222';
select pg_temp.as_service();
select is((select count(*) from products where name = 'hacked')::int, 0, 'cross tenant update changes nothing');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001', 'owner', '11111111-1111-4111-8111-111111111111');
select throws_ok(
  $$ insert into products (manufacturer_id, name, sku) values ('22222222-2222-4222-8222-222222222222', 'x', 'X-1') $$,
  '42501', null, 'cannot insert rows into another tenant');

select throws_ok(
  $$ select set_stage_internal((select id from prospects limit 1), 'lost', 'x', null) $$,
  '42501', null, 'internal helpers are not executable from the API');

select throws_ok(
  $$ select evaluate_offer('b0000000-0000-4000-8000-000000000010', 10, 45000) $$,
  'P0001', 'forbidden', 'cannot price another tenant''s product');

-- Kaveri owner cannot see Shakti data
select pg_temp.as_user('a0000000-0000-4000-8000-000000000006', 'owner', '22222222-2222-4222-8222-222222222222');
select is((select count(*) from prospects where manufacturer_id = '11111111-1111-4111-8111-111111111111')::int, 0,
  'second tenant cannot read Shakti prospects');
select is((select count(*) from human_approvals)::int, 0, 'second tenant cannot read Shakti approvals');
select is((select count(*) from messages)::int, 0, 'second tenant cannot read Shakti messages');

-- Rep sees only assigned prospects
select pg_temp.as_user('a0000000-0000-4000-8000-000000000003', 'rep', '11111111-1111-4111-8111-111111111111');
select is((select count(*) from prospects where assigned_rep_id is distinct from 'a0000000-0000-4000-8000-000000000003')::int, 0,
  'rep sees only prospects assigned to them');
select is((select count(*) from conversations c where not exists (
  select 1 from prospects p where p.id = c.prospect_id))::int, 0,
  'rep sees no conversations for prospects they cannot see');
select throws_ok(
  $$ select decide_approval((select id from human_approvals limit 1), 'approve', null, null) $$,
  'P0001', null, 'rep cannot decide approvals');

-- The restricted system admin sees no manufacturer business data
select pg_temp.as_user('a0000000-0000-4000-8000-000000000004', 'system_admin', null);
select is((select count(*) from prospects)::int, 0, 'the system admin cannot read prospects of any tenant');

select * from finish();
rollback;
