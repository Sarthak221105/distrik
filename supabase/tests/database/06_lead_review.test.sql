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

select plan(38);

-- People
--   owner  a..01 (Shakti), sales head a..02 (default lead permissions), rep a..03,
--   system admin a..04, other tenant owner a..06 (Kaveri)
create temp table ids (k text primary key, v uuid);
grant select on ids to authenticated;
insert into ids values ('campaign', 'c0000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- 1. Manufacturer import: cleaning, auto merge, uncertain duplicate, review queue
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001', 'owner', '11111111-1111-4111-8111-111111111111');
select is(import_prospect_records((select v from ids where k = 'campaign'), '[
  {"name": "Fresh Kirana Mart", "phone": "98220 31001", "city": "Nagpur", "state": "Maharashtra", "type": "wholesaler"},
  {"name": "Sitabuldi Traders Nagpur", "phone": "98220 31002", "city": "Nagpur", "state": "Maharashtra"},
  {"name": "Deshmukh Agencies Pvt Ltd", "phone": "98220 31003", "city": "Nagpur", "state": "Maharashtra"},
  {"name": "No Phone Distributors", "city": "Nagpur", "state": "Maharashtra"}
]'::jsonb, 'Trade fair visitor list, Oct 2026'), 4, 'the manufacturer imports its own buyer list into the pipeline');

select pg_temp.as_service();
insert into ids select 'fresh', id from prospects where name = 'Fresh Kirana Mart';
insert into ids select 'dupcand', id from prospects where name = 'Sitabuldi Traders Nagpur';
insert into ids select 'sitabuldi', id from prospects where name = 'Sitabuldi Traders';
insert into ids select 'nophone', id from prospects where name = 'No Phone Distributors';

select is((select count(*) from prospects where name = 'Deshmukh Agencies Pvt Ltd')::int, 0,
  'a near-certain duplicate merges automatically (no second prospect)');
select is((select review_status from prospects where id = (select v from ids where k = 'dupcand')), 'needs_review'::review_status,
  'an uncertain duplicate is kept but flagged Needs Review');
select ok(exists (select 1 from merge_candidates where candidate_prospect_id = (select v from ids where k = 'dupcand')
                  and prospect_id = (select v from ids where k = 'sitabuldi') and status = 'pending'),
  'the duplicate warning links both records for a human decision');
select ok((select 'missing_phone' = any (review_flags) from prospects where id = (select v from ids where k = 'nophone')),
  'missing information is flagged');
select is((select review_status from prospects where id = (select v from ids where k = 'fresh')), 'pending'::review_status,
  'a clean new record waits in Pending Review');

-- Re-running normalisation never duplicates prospects
select normalize_campaign_records((select v from ids where k = 'campaign'));
select is((select count(*) from prospects where name in ('Fresh Kirana Mart', 'Sitabuldi Traders Nagpur'))::int, 2,
  're-running the pipeline creates no duplicate prospects');

-- Workers finish classification and research
select set_prospect_classification(v, 'spices', 'wholesaler', 0.9, null) from ids where k in ('fresh', 'dupcand', 'nophone');
select set_prospect_research(v, '{"summary": "Wholesaler in Itwari"}', '{"retail_network": 0.6}') from ids where k in ('fresh', 'dupcand', 'nophone');
select ok((select pipeline_step = 'done' and last_checked_at is not null and fit_score is not null from prospects
           where id = (select v from ids where k = 'fresh')), 'cleaned, researched and scored with a last-checked time');
select is((select status from campaigns where id = (select v from ids where k = 'campaign')), 'lead_review'::campaign_status,
  'the campaign waits in Lead Review, not internal QA');
select ok(exists (select 1 from notifications where kind = 'leads_awaiting_review'
                  and user_id = 'a0000000-0000-4000-8000-000000000002'),
  'the sales head with review permission is told prospects await review');
select is((select count(*) from notifications n join profiles p on p.user_id = n.user_id
           where p.role = 'system_admin' and n.kind in ('leads_awaiting_review', 'campaign_needs_sourcing'))::int, 0,
  'no Distrik staff member is involved in lead review');

-- ---------------------------------------------------------------------------
-- 2. Visibility and permissions
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001', 'owner', '11111111-1111-4111-8111-111111111111');
select ok((select count(*) from prospects where review_status in ('pending', 'needs_review'))::int > 0,
  'the manufacturer sees its own prospects awaiting review');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003', 'rep', '11111111-1111-4111-8111-111111111111');
select is((select count(*) from prospects where review_status in ('pending', 'needs_review'))::int, 0,
  'a rep cannot see unassigned prospects under review');
select throws_ok($$ select review_prospects(array[(select v from ids where k = 'fresh')], 'approve', null) $$,
  'P0001', 'forbidden', 'a rep cannot approve leads');
select throws_ok($$ select assign_prospects(array[(select v from ids where k = 'fresh')], 'a0000000-0000-4000-8000-000000000003') $$,
  'P0001', 'forbidden', 'a rep cannot assign leads');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000006', 'owner', '22222222-2222-4222-8222-222222222222');
select is((review_prospects(array[(select v from ids where k = 'fresh')], 'reject', 'not ours') ->> 'updated')::int, 0,
  'another manufacturer cannot decide this company''s prospects');
select is((select count(*) from prospect_reviews where prospect_id = (select v from ids where k = 'fresh'))::int, 0,
  'another manufacturer cannot read this company''s review history');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000004', 'system_admin', null);
select is((select count(*) from prospects)::int, 0, 'the system admin cannot read any manufacturer prospects');
select is((select count(*) from contacts)::int, 0, 'the system admin cannot read contacts');
select is((select count(*) from messages)::int, 0, 'the system admin cannot read conversations');
select ok((sysadmin_platform_health() ? 'failed_jobs'), 'the system admin still has aggregate platform health');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001', 'owner', '11111111-1111-4111-8111-111111111111');
select throws_ok($$ select sysadmin_platform_health() $$, 'P0001', 'forbidden', 'manufacturers cannot use system admin tools');

-- ---------------------------------------------------------------------------
-- 3. Review actions (sales head with delegated permissions)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002', 'sales_head', '11111111-1111-4111-8111-111111111111');
select throws_ok($$ select review_prospects(array[(select v from ids where k = 'nophone')], 'reject', null) $$,
  'P0001', 'reason_required', 'rejecting needs a reason');
select is((review_prospects(array[(select v from ids where k = 'dupcand')], 'approve', null) -> 'skipped' -> 0 ->> 'reason'),
  'unresolved_duplicate', 'a flagged duplicate cannot be approved before the duplicate is decided');
select is((review_prospects(array[(select v from ids where k = 'fresh')], 'approve', null) ->> 'updated')::int, 1,
  'an authorised sales head approves a prospect');
select is((review_prospects(array[(select v from ids where k = 'fresh')], 'approve', null) ->> 'updated')::int, 0,
  'approving twice changes nothing');
select is((review_prospects(array[(select v from ids where k = 'fresh')], 'reject', 'changed mind') -> 'skipped' -> 0 ->> 'reason'),
  'already_decided', 'changing a decision needs override permission');

-- Keep separate clears the warning; the record returns to Pending Review
select resolve_duplicate((select id from merge_candidates where candidate_prospect_id = (select v from ids where k = 'dupcand')),
  false, 'Different shop, same market');
select is((select review_status from prospects where id = (select v from ids where k = 'dupcand')), 'pending'::review_status,
  'keep separate resolves the warning');

-- Merge moves relationships to the kept record and preserves history
select pg_temp.as_service();
insert into contacts (manufacturer_id, prospect_id, name, phone_e164, is_primary)
select '11111111-1111-4111-8111-111111111111', v, 'Second number', '+919822031999', false from ids where k = 'dupcand';
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002', 'sales_head', '11111111-1111-4111-8111-111111111111');
select merge_prospect_records((select v from ids where k = 'sitabuldi'), (select v from ids where k = 'dupcand'), 'Same owner after all');
select is((select review_status from prospects where id = (select v from ids where k = 'dupcand')), 'merged'::review_status,
  'the merged record is closed');
select is((select count(*) from contacts where phone_e164 = '+919822031999'
           and prospect_id = (select v from ids where k = 'sitabuldi'))::int, 1,
  'contacts move to the kept record');
select ok(exists (select 1 from prospect_reviews where prospect_id = (select v from ids where k = 'sitabuldi') and action = 'merge'),
  'the merge is recorded in review history');

-- ---------------------------------------------------------------------------
-- 4. Outreach eligibility: approval gate plus independent consent gate
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
insert into conversations (manufacturer_id, prospect_id, contact_id, channel, window_expires_at)
select '11111111-1111-4111-8111-111111111111', p.id, c.id, 'whatsapp', now() + interval '1 hour'
from prospects p join contacts c on c.prospect_id = p.id where p.name = 'Wardha Road Distributors';
select set_consent((select c.id from contacts c join prospects p on p.id = c.prospect_id where p.name = 'Wardha Road Distributors'),
  'opted_in', 'existing_customer_order', '{"note": "test"}');
select throws_ok($$ select enqueue_outbound_message(
    (select cv.id from conversations cv join prospects p on p.id = cv.prospect_id where p.name = 'Wardha Road Distributors'),
    null, (select id from message_templates where name = 'outreach_opener')) $$,
  'P0001', 'prospect_not_approved', 'a pending prospect cannot be contacted, even with consent');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001', 'owner', '11111111-1111-4111-8111-111111111111');
select review_prospects(array[(select id from prospects where name = 'Wardha Road Distributors')], 'approve', null);
select pg_temp.as_service();
select lives_ok($$ select enqueue_outbound_message(
    (select cv.id from conversations cv join prospects p on p.id = cv.prospect_id where p.name = 'Wardha Road Distributors'),
    null, (select id from message_templates where name = 'outreach_opener')) $$,
  'once approved, outreach is allowed within consent rules');

select set_consent((select c.id from contacts c join prospects p on p.id = c.prospect_id where p.name = 'Wardha Road Distributors'),
  'opted_out', 'inbound_stop', '{"text": "STOP"}');
select throws_ok($$ select enqueue_outbound_message(
    (select cv.id from conversations cv join prospects p on p.id = cv.prospect_id where p.name = 'Wardha Road Distributors'),
    null, (select id from message_templates where name = 'outreach_opener')) $$,
  'P0001', 'consent_required', 'approval never overrides an opt out');

-- ---------------------------------------------------------------------------
-- 5. Launch with partial approval; permissions are delegable
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002', 'sales_head', '11111111-1111-4111-8111-111111111111');
select ok((launch_campaign((select v from ids where k = 'campaign'), 0) ->> 'rep_tasks')::int
          + (launch_campaign((select v from ids where k = 'campaign'), 0) ->> 'ai_openers')::int >= 0, 'launch runs');
select is((select status from campaigns where id = (select v from ids where k = 'campaign')), 'live'::campaign_status,
  'outreach goes live for approved prospects while others are still under review');
select is((select count(*) from prospects where campaign_id = (select v from ids where k = 'campaign')
           and outreach_approved and review_status <> 'approved')::int, 0,
  'only approved prospects are released for outreach');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001', 'owner', '11111111-1111-4111-8111-111111111111');
select set_member_permissions('a0000000-0000-4000-8000-000000000002', array['review_leads']);
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002', 'sales_head', '11111111-1111-4111-8111-111111111111');
select throws_ok($$ select launch_campaign((select v from ids where k = 'campaign'), 0) $$,
  'P0001', 'forbidden', 'without the delegated permission a sales head cannot launch outreach');

select * from finish();
rollback;
