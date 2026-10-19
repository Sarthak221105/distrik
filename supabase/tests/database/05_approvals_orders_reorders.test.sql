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

select plan(13);
select pg_temp.as_service();
create temp table a as
select id, negotiation_id from human_approvals where status = 'pending' and kind = 'price_below_floor' limit 1;
grant select on a to authenticated;

-- Sales head above their limit
update profiles set approval_limit_paise = 100000 where user_id = 'a0000000-0000-4000-8000-000000000002';
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002', 'sales_head', '11111111-1111-4111-8111-111111111111');
select throws_ok($$ select decide_approval((select id from a), 'approve', null, null) $$,
  'P0001', 'approval_limit_exceeded', 'a sales head cannot approve above their limit');

-- Owner: counter below the hard minimum is refused
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001', 'owner', '11111111-1111-4111-8111-111111111111');
select throws_ok($$ select decide_approval((select id from a), 'counter', 50000, null) $$,
  'P0001', 'below_hard_minimum', 'a counter below the hard minimum is refused');

-- Owner approves: quotation created at the approved price, AI turn queued
select is((decide_approval((select id from a), 'approve', null, 'Strategic account') ->> 'status'), 'approved',
  'owner approves');
select pg_temp.as_service();
select is((select (lines -> 0 ->> 'unit_price_paise')::bigint from quotations where negotiation_id = (select negotiation_id from a)),
  54000::bigint, 'the quotation carries the approved price');
select is((select status from negotiations where id = (select negotiation_id from a)), 'quoted'::negotiation_status,
  'negotiation moves to quoted');
select ok(exists (select 1 from ai_turns where reason = 'approval_decided' and context ->> 'approval_id' = (select id::text from a)),
  'the conversation resumes with an AI turn');
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001', 'owner', '11111111-1111-4111-8111-111111111111');
select throws_ok($$ select decide_approval((select id from a), 'reject', null, null) $$,
  'P0001', 'already_decided', 'an approval resolves once');

-- Orders: a mismatched PO needs a logged override
select throws_ok($$ select confirm_order((select id from purchase_orders where match_status = 'mismatch' limit 1), null) $$,
  'P0001', 'override_reason_required', 'a mismatched PO needs an override reason');
select lives_ok($$ select confirm_order((select id from purchase_orders where match_status = 'mismatch' limit 1),
  'Buyer confirmed revised quantity on call') $$, 'override with a reason creates the order');
select pg_temp.as_service();
select ok(exists (select 1 from audit_log where action = 'confirm_order_override'), 'the override is in the audit log');

-- Matched PO: order, first order stage, consent opted in
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001', 'owner', '11111111-1111-4111-8111-111111111111');
select lives_ok($$ select confirm_order((select id from purchase_orders where match_status = 'matched' limit 1), null) $$,
  'a matched PO confirms without an override');
select pg_temp.as_service();
select is((select p.stage from prospects p where p.name = 'Agrawal Trading Company'), 'first_order'::prospect_stage,
  'the buyer moves to First Order');

-- Reorders: every account with two or more orders has a prediction
select is((
  select count(*) from (
    select o.prospect_id, oi.product_id from orders o join order_items oi on oi.order_id = o.id
    where o.status <> 'cancelled' group by 1, 2 having count(distinct o.ordered_on) >= 2
  ) x
  where not exists (select 1 from reorder_predictions r where r.prospect_id = x.prospect_id and r.product_id = x.product_id)
)::int, 0, 'every account and product with two orders has a reorder prediction');

select * from finish();
rollback;
