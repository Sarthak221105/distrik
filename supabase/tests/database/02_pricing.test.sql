begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

select plan(14);
select pg_temp.as_service();

-- PRD 9 example: floor ₹558, hard minimum ₹540 (100 jars hits the 50+ tier)
select is((select decision from evaluate_offer('b0000000-0000-4000-8000-000000000001', 100, 54000)), 'needs_approval',
  '₹540 for 100 jars needs approval');
select is((select floor_paise from evaluate_offer('b0000000-0000-4000-8000-000000000001', 100, 54000)), 55800::bigint,
  'counter is always the floor (₹558)');
select is((select decision from evaluate_offer('b0000000-0000-4000-8000-000000000001', 100, 55800)), 'accept',
  'at the floor is accepted');
select is((select decision from evaluate_offer('b0000000-0000-4000-8000-000000000001', 100, 53999)), 'reject',
  'below the hard minimum is rejected');
select is((select reason from evaluate_offer('b0000000-0000-4000-8000-000000000001', 10, 62000)), 'below_moq',
  'below MOQ is rejected');
select is((select floor_paise from evaluate_offer('b0000000-0000-4000-8000-000000000001', 250, 54500)), 54500::bigint,
  '200+ tier floor applies at 250 jars');
-- 20+ tier: floor 600, max discount 5% of 620 = 589 -> floor stays 600
select is((select floor_paise from evaluate_offer('b0000000-0000-4000-8000-000000000001', 20, 60000)), 60000::bigint,
  'effective floor is max(tier floor, distributor price less max discount)');

-- The discount cap raises the floor when it is stricter than the tier floor.
update discount_rules set max_discount_pct = 2 where product_id = 'b0000000-0000-4000-8000-000000000001' and qty_from = 50;
select is((select floor_paise from evaluate_offer('b0000000-0000-4000-8000-000000000001', 100, 60000)), 60760::bigint,
  'a 2% cap on ₹620 lifts the floor to ₹607.60');
update discount_rules set max_discount_pct = 12 where product_id = 'b0000000-0000-4000-8000-000000000001' and qty_from = 50;

-- Property test: never accept below the effective floor, never reject at or
-- above it, across random quantities and prices for every product.
select is((
  with samples as (
    select p.id as product_id, (1 + floor(random() * 400))::int as qty,
           (1000 + floor(random() * 700000))::bigint as price
    from products p, generate_series(1, 400)
    where p.manufacturer_id = '11111111-1111-4111-8111-111111111111'
  ),
  evaluated as (
    select s.*, e.* from samples s cross join lateral evaluate_offer(s.product_id, s.qty, s.price) e
  )
  select count(*) from evaluated
  where (decision = 'accept' and price < floor_paise)
     or (decision = 'needs_approval' and (price >= floor_paise or price < hard_minimum_paise))
     or (decision = 'reject' and reason not in ('below_moq', 'no_pricing_rule', 'invalid_price') and price >= hard_minimum_paise)
)::int, 0, 'property: evaluate_offer never accepts below the floor (2000 random asks)');

-- Negotiation honours an approved exception, and only for that negotiation.
create temp table t_neg as
select open_negotiation((select c.id from conversations c join prospects p on p.id = c.prospect_id
                         where p.name = 'Shree Balaji Distributors'), 'b0000000-0000-4000-8000-000000000001', 100) as id;
select is((select decision from negotiate_offer((select id from t_neg), 54000, 100, 'buyer', null)), 'needs_approval',
  'negotiate_offer opens an approval below the floor');
select is((select count(*) from human_approvals where negotiation_id = (select id from t_neg) and status = 'pending')::int, 1,
  'exactly one pending price approval per negotiation');

-- Quotation guard: below the floor needs an approved approval
select throws_ok(
  $$ insert into quotations (manufacturer_id, prospect_id, negotiation_id, number, lines, subtotal_paise, tax_paise,
       total_paise, tax_mode, valid_until)
     select n.manufacturer_id, n.prospect_id, n.id, 'TEST/1',
            jsonb_build_array(jsonb_build_object('product_id', n.product_id, 'sku', 'SKO-5L', 'qty', 100, 'unit_price_paise', 54000)),
            5400000, 270000, 5670000, 'intra', current_date + 7
     from negotiations n where n.id = (select id from t_neg) $$,
  'P0001', 'price_below_floor_without_approval', 'a price below the floor cannot reach a quotation without approval');

update human_approvals set status = 'approved', approved_price_paise = 54000, decided_at = now()
where negotiation_id = (select id from t_neg) and status = 'pending';
select is((select decision from negotiate_offer((select id from t_neg), 54000, 100, 'buyer', null)), 'accept',
  'an approved exception lets the buyer close at the approved price');
select lives_ok(
  $$ select create_quotation((select id from t_neg), null, null, null) $$,
  'quotation at the approved price is allowed');

select * from finish();
rollback;
