begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

select plan(11);
select pg_temp.as_service();

-- A discovered contact with no consent, given an open window to isolate the consent rule.
create temp table t as
select p.id as prospect_id, c.id as contact_id
from prospects p join contacts c on c.prospect_id = p.id and c.is_primary
join consents cs on cs.contact_id = c.id and cs.status = 'none'
where p.manufacturer_id = '11111111-1111-4111-8111-111111111111' and p.review_status = 'approved'
limit 1;
insert into conversations (manufacturer_id, prospect_id, contact_id, channel, window_expires_at)
select '11111111-1111-4111-8111-111111111111', prospect_id, contact_id, 'whatsapp', now() + interval '1 hour' from t;
alter table t add column conversation_id uuid;
update t set conversation_id = (select id from conversations where contact_id = t.contact_id);

select throws_ok($$ select enqueue_outbound_message((select conversation_id from t), 'Hello') $$,
  'P0001', 'consent_required', 'no consent: the database rejects the message');

select set_consent((select contact_id from t), 'engaged', 'inbound_message', '{}');
select lives_ok($$ select enqueue_outbound_message((select conversation_id from t), 'Hello inside the window') $$,
  'engaged inside the window: free form reply allowed');

update conversations set window_expires_at = now() - interval '1 minute' where id = (select conversation_id from t);
select throws_ok($$ select enqueue_outbound_message((select conversation_id from t), 'Hello again') $$,
  'P0001', 'window_closed', 'outside the window without a template is rejected');

select lives_ok($$ select enqueue_outbound_message((select conversation_id from t), null,
  (select id from message_templates where name = 'followup_nudge')) $$,
  'outside the window an approved template is allowed');

select throws_ok($$ select enqueue_outbound_message((select conversation_id from t), null,
  (select id from message_templates where name = 'festive_offer')) $$,
  'P0001', 'template_not_approved', 'a template still awaiting Meta approval is rejected');

-- Opt out cancels queued sends before they go out
select is((select count(*) from messages where conversation_id = (select conversation_id from t) and status = 'queued')::int, 2,
  'two messages queued');
select set_consent((select contact_id from t), 'opted_out', 'inbound_stop', '{"text":"STOP"}');
select is((select count(*) from messages where conversation_id = (select conversation_id from t) and status = 'queued')::int, 0,
  'opt out cancels every queued message for the contact');
select throws_ok($$ select enqueue_outbound_message((select conversation_id from t), null,
  (select id from message_templates where name = 'followup_nudge')) $$,
  'P0001', 'consent_required', 'nothing can be sent after an opt out');
select is(set_consent((select contact_id from t), 'engaged', 'inbound_message', '{}'), 'opted_out'::consent_status,
  'a later inbound message never silently revives an opt out');

-- AI cannot speak on a paused thread
select set_consent((select contact_id from t), 'opted_in', 'inbound_start', '{"text":"START"}');
update conversations set ai_paused = true, window_expires_at = now() + interval '1 hour' where id = (select conversation_id from t);
select throws_ok($$ select enqueue_outbound_message((select conversation_id from t), 'AI reply', null, 'ai') $$,
  'P0001', 'ai_paused', 'an escalated thread stays silent for the AI');

-- Daily cap
update conversations set ai_paused = false where id = (select conversation_id from t);
update manufacturers set settings = settings || '{"daily_outbound_cap": 0}' where id = '11111111-1111-4111-8111-111111111111';
select throws_ok($$ select enqueue_outbound_message((select conversation_id from t), 'One more') $$,
  'P0001', 'daily_cap_reached', 'the daily outbound cap is enforced');

select * from finish();
rollback;
