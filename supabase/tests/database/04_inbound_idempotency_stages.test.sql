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

select plan(14);
select pg_temp.as_service();

-- Replaying the same webhook payload creates one message and one AI turn.
select is((ingest_inbound_message('sandbox-shakti-001', '919811122233', 'wamid.TEST-1', 'Rate kya hai?', now(), 'Test Buyer') ->> 'duplicate'),
  'false', 'first delivery is stored');
select is((ingest_inbound_message('sandbox-shakti-001', '919811122233', 'wamid.TEST-1', 'Rate kya hai?', now(), 'Test Buyer') ->> 'duplicate'),
  'true', 'replayed delivery is recognised as a duplicate');
select is((select count(*) from messages where provider_message_id = 'wamid.TEST-1')::int, 1, 'one message stored');
select is((select count(*) from ai_turns t join messages m on m.id = t.trigger_message_id
           where m.provider_message_id = 'wamid.TEST-1')::int, 1, 'one AI turn queued');
select is((select cs.status from consents cs join contacts c on c.id = cs.contact_id where c.phone_e164 = '+919811122233'),
  'engaged'::consent_status, 'a buyer who writes first is engaged');
select ok((select window_expires_at > now() + interval '23 hours' from conversations cv
           join contacts c on c.id = cv.contact_id where c.phone_e164 = '+919811122233'),
  'the 24 hour window opens');

select ingest_inbound_message('sandbox-shakti-001', '919811122233', 'wamid.TEST-2', 'STOP', now(), 'Test Buyer');
select is((select cs.status from consents cs join contacts c on c.id = cs.contact_id where c.phone_e164 = '+919811122233'),
  'opted_out'::consent_status, 'STOP opts the contact out immediately');
select is((select count(*) from ai_turns t join messages m on m.id = t.trigger_message_id
           where m.provider_message_id = 'wamid.TEST-2')::int, 0, 'no AI turn after an opt out');

-- Stage transitions
create temp table s as
select id from prospects where manufacturer_id = '11111111-1111-4111-8111-111111111111' and stage = 'new'
  and review_status = 'approved' and assigned_rep_id is null limit 1;
grant select on s to authenticated;

select pg_temp.as_user('a0000000-0000-4000-8000-000000000001', 'owner', '11111111-1111-4111-8111-111111111111');
select throws_ok($$ select set_stage((select id from s), 'first_order') $$, 'P0001', 'use_confirm_order',
  'a prospect cannot skip from New to First Order');
select throws_ok($$ select set_stage((select id from s), 'quoted') $$, 'P0001', 'invalid_transition',
  'transitions are validated against the transition table');
select is((set_stage((select id from s), 'contacted', 'called', now(), 'idem-stage-1') ->> 'changed'), 'true',
  'a valid transition succeeds');
select is((set_stage((select id from s), 'contacted', 'called', now(), 'idem-stage-1') ->> 'changed'), 'true',
  'replaying the same idempotency key returns the original result');
select is((select count(*) from prospect_events where prospect_id = (select id from s) and kind = 'stage_change')::int, 1,
  'the replay wrote no second event');

select pg_temp.as_user('a0000000-0000-4000-8000-000000000003', 'rep', '11111111-1111-4111-8111-111111111111');
select throws_ok($$ select set_stage((select id from s), 'engaged') $$, 'P0001', null,
  'a rep cannot move a prospect that is not assigned to them');

select * from finish();
rollback;
