-- Messaging ingestion, worker helpers, pgmq queues and pg_cron schedules
-- (PRD 8, 12). Edge Functions are stateless; they claim small batches, do one
-- bounded unit of work, and delete or retry the queue message.

-- ---------------------------------------------------------------------------
-- Queues
-- ---------------------------------------------------------------------------
select pgmq.create(q) from unnest(array[
  'ingest', 'classify', 'research', 'score', 'outbound_messages', 'ai_turns',
  'quotation_jobs', 'po_parse', 'notifications', 'embeddings'
]) as q;

-- Service role wrappers (pgmq schema itself is not exposed to the API).
create or replace function public.queue_send(p_queue text, p_msg jsonb, p_delay integer default 0)
returns bigint
language sql security definer
set search_path = public
as $$
  select pgmq.send(p_queue, p_msg, p_delay)
$$;

create or replace function public.queue_read(p_queue text, p_vt integer default 60, p_qty integer default 5)
returns table (msg_id bigint, read_ct integer, enqueued_at timestamptz, message jsonb)
language sql security definer
set search_path = public
as $$
  select msg_id, read_ct, enqueued_at, message from pgmq.read(p_queue, p_vt, p_qty)
$$;

create or replace function public.queue_delete(p_queue text, p_msg_id bigint)
returns boolean
language sql security definer
set search_path = public
as $$
  select pgmq.delete(p_queue, p_msg_id)
$$;

-- Retry with exponential backoff; past the limit the message is archived and
-- shows up in the dead letter view, and ops are alerted.
create or replace function public.queue_retry(p_queue text, p_msg_id bigint, p_read_ct integer, p_error text default null,
                                              p_max_attempts integer default 5)
returns text
language plpgsql security definer
set search_path = public
as $$
begin
  if p_read_ct >= p_max_attempts then
    perform pgmq.archive(p_queue, p_msg_id);
    perform public.notify_users(null, public.ops_users(), 'dead_letter', 'Dead letter in ' || p_queue,
      left(coalesce(p_error, 'Retries exhausted'), 300), '/ops/jobs', 'dead:' || p_queue || ':' || p_msg_id, '{in_app,email}');
    return 'archived';
  end if;
  perform pgmq.set_vt(p_queue, p_msg_id, least(3600, (power(2, p_read_ct) * 15)::integer));
  return 'retrying';
end
$$;

revoke execute on function public.queue_send(text, jsonb, integer) from public, anon, authenticated;
revoke execute on function public.queue_read(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.queue_delete(text, bigint) from public, anon, authenticated;
revoke execute on function public.queue_retry(text, bigint, integer, text, integer) from public, anon, authenticated;
grant execute on function public.queue_send(text, jsonb, integer) to service_role;
grant execute on function public.queue_read(text, integer, integer) to service_role;
grant execute on function public.queue_delete(text, bigint) to service_role;
grant execute on function public.queue_retry(text, bigint, integer, text, integer) to service_role;

-- Ops views over queue health and dead letters.
create or replace function public.ops_queue_metrics()
returns table (queue_name text, queue_length bigint, oldest_msg_age_sec integer, total_messages bigint, dead_letters bigint)
language plpgsql security definer
set search_path = public
as $$
declare
  m record;
  v_dead bigint;
begin
  if not (public.is_ops() or public.is_trusted()) then
    perform public.app_error('forbidden', 'Ops only', null);
  end if;
  for m in select * from pgmq.metrics_all() loop
    execute format('select count(*) from pgmq.%I', 'a_' || m.queue_name) into v_dead;
    queue_name := m.queue_name;
    queue_length := m.queue_length;
    oldest_msg_age_sec := m.oldest_msg_age_sec;
    total_messages := m.total_messages;
    dead_letters := v_dead;
    return next;
  end loop;
end
$$;

create or replace function public.ops_dead_letters(p_limit integer default 100)
returns table (queue_name text, msg_id bigint, read_ct integer, enqueued_at timestamptz, archived_at timestamptz, message jsonb)
language plpgsql security definer
set search_path = public
as $$
declare
  q record;
begin
  if not public.is_ops() then
    perform public.app_error('forbidden', 'Ops only', null);
  end if;
  for q in select queue_name as name from pgmq.list_queues() loop
    return query execute format(
      'select %L::text, msg_id, read_ct, enqueued_at, archived_at, message from pgmq.%I order by archived_at desc limit %s',
      q.name, 'a_' || q.name, p_limit);
  end loop;
end
$$;

create or replace function public.ops_retry_dead_letter(p_queue text, p_msg_id bigint)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_msg jsonb;
  v_new bigint;
begin
  if not public.is_ops() then
    perform public.app_error('forbidden', 'Ops only', null);
  end if;
  execute format('delete from pgmq.%I where msg_id = $1 returning message', 'a_' || p_queue) into v_msg using p_msg_id;
  if v_msg is null then
    perform public.app_error('not_found', 'Dead letter not found', 'msg_id');
  end if;
  v_new := pgmq.send(p_queue, v_msg);
  perform public.write_audit(null, 'ops_retry_dead_letter', 'queue', null,
    jsonb_build_object('queue', p_queue, 'msg_id', p_msg_id, 'new_msg_id', v_new));
  return v_new;
end
$$;

-- ---------------------------------------------------------------------------
-- Waking Edge Functions from pg_cron through pg_net. The project URL and the
-- worker secret live in Supabase Vault, never in a table.
-- ---------------------------------------------------------------------------
create or replace function public.invoke_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'worker_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret),
    body := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 30000
  );
end
$$;

-- Only invoke a worker when its queue has visible messages.
create or replace function public.wake_worker(p_function text, p_queue text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_has boolean;
begin
  execute format('select exists (select 1 from pgmq.%I where vt <= now())', 'q_' || p_queue) into v_has;
  if v_has then
    perform public.invoke_edge_function(p_function, jsonb_build_object('queue', p_queue));
  end if;
  return v_has;
end
$$;

revoke execute on function public.invoke_edge_function(text, jsonb) from public, anon, authenticated;
revoke execute on function public.wake_worker(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Inbound WhatsApp ingestion (called by whatsapp-webhook). Stores the
-- message once, updates consent and the 24 hour window, cancels pending
-- follow ups, and queues one AI turn.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_inbound_message(
  p_phone_number_id text,
  p_from text,
  p_provider_message_id text,
  p_body text,
  p_sent_at timestamptz default now(),
  p_profile_name text default null,
  p_media_path text default null,
  p_media_type text default null,
  p_media_mime text default null,
  p_media_filename text default null,
  p_channel public.channel default 'whatsapp'
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_mid uuid;
  v_phone text;
  v_contact public.contacts%rowtype;
  v_prospect public.prospects%rowtype;
  v_conv public.conversations%rowtype;
  v_msg uuid;
  v_turn uuid;
  v_ref text;
  v_lower text := lower(coalesce(p_body, ''));
  v_consent public.consent_status;
  v_po uuid;
  v_new_prospect boolean := false;
begin
  if not public.is_trusted() then
    perform public.app_error('forbidden', 'Webhook only', null);
  end if;

  -- duplicate delivery: harmless
  select id into v_msg from public.messages where provider_message_id = p_provider_message_id;
  if v_msg is not null then
    return jsonb_build_object('duplicate', true, 'message_id', v_msg);
  end if;

  select id into v_mid from public.manufacturers where whatsapp_phone_number_id = p_phone_number_id;
  if v_mid is null then
    perform public.app_error('unknown_business_number', 'No manufacturer for this business number', 'phone_number_id');
  end if;

  v_phone := coalesce(public.normalize_phone_e164(p_from),
                      case when p_from ~ '^\+?[1-9][0-9]{7,14}$' then '+' || ltrim(p_from, '+') end);

  select * into v_contact from public.contacts where manufacturer_id = v_mid and phone_e164 = v_phone;

  if v_contact.id is null then
    -- A click to chat ref code ties the chat to a known prospect.
    v_ref := substring(v_lower from 'ref[:\s#-]*([a-f0-9]{8})');
    if v_ref is not null then
      select * into v_prospect from public.prospects where manufacturer_id = v_mid and ref_code = v_ref;
    end if;
    if v_prospect.id is null then
      insert into public.prospects (manufacturer_id, name, normalized_name, type, confidence, pipeline_step,
                                    review_status, stage, research)
      values (v_mid, coalesce(nullif(trim(p_profile_name), ''), 'WhatsApp ' || right(v_phone, 4)),
              public.normalize_business_name(coalesce(p_profile_name, v_phone)), 'other', 'verified', 'done',
              'approved', 'engaged', jsonb_build_object('origin', 'inbound_whatsapp'))
      returning * into v_prospect;
      v_new_prospect := true;
    end if;
    insert into public.contacts (manufacturer_id, prospect_id, name, phone_e164, is_primary)
    values (v_mid, v_prospect.id, p_profile_name, v_phone,
            not exists (select 1 from public.contacts where prospect_id = v_prospect.id and is_primary))
    returning * into v_contact;
  else
    select * into v_prospect from public.prospects where id = v_contact.prospect_id;
  end if;

  -- Consent: STOP applies immediately; a chat from the contact is engagement.
  if v_lower ~ '^\s*(stop|unsubscribe|band karo|बंद करो|मत भेजो|opt out|optout)\s*[.!]*\s*$' then
    v_consent := public.set_consent(v_contact.id, 'opted_out', 'inbound_stop',
      jsonb_build_object('provider_message_id', p_provider_message_id, 'text', left(p_body, 100)), p_channel);
  elsif v_lower ~ '^\s*(start|subscribe|yes|haan|हाँ)\s*[.!]*\s*$'
        and public.consent_status_for(v_contact.id, p_channel) = 'opted_out' then
    v_consent := public.set_consent(v_contact.id, 'opted_in', 'inbound_start',
      jsonb_build_object('provider_message_id', p_provider_message_id, 'text', left(p_body, 100)), p_channel);
  else
    v_consent := public.set_consent(v_contact.id, 'engaged', 'inbound_message',
      jsonb_build_object('provider_message_id', p_provider_message_id), p_channel);
  end if;

  insert into public.conversations (manufacturer_id, prospect_id, contact_id, channel)
  values (v_mid, v_prospect.id, v_contact.id, p_channel)
  on conflict (contact_id, channel) do nothing;
  select * into v_conv from public.conversations where contact_id = v_contact.id and channel = p_channel for update;

  insert into public.messages (manufacturer_id, conversation_id, direction, body, media_path, media_type, media_mime,
                               media_filename, provider_message_id, status, actor, created_at)
  values (v_mid, v_conv.id, 'inbound', p_body, p_media_path, p_media_type, p_media_mime, p_media_filename,
          p_provider_message_id, 'received', 'buyer', coalesce(p_sent_at, now()))
  on conflict (provider_message_id) do nothing
  returning id into v_msg;
  if v_msg is null then
    return jsonb_build_object('duplicate', true);
  end if;

  update public.conversations
  set window_expires_at = greatest(coalesce(window_expires_at, '-infinity'), coalesce(p_sent_at, now()) + interval '24 hours'),
      last_inbound_at = coalesce(p_sent_at, now()),
      last_message_preview = left(coalesce(p_body, '[' || coalesce(p_media_type, 'attachment') || ']'), 140),
      unread_count = unread_count + 1
  where id = v_conv.id;

  update public.followups set status = 'cancelled' where conversation_id = v_conv.id and status = 'pending';
  update public.prospects set is_stale = false where id = v_prospect.id and is_stale;

  if v_prospect.stage in ('new', 'contacted', 'lost') then
    perform public.set_stage_internal(v_prospect.id, 'engaged', 'Buyer replied on WhatsApp', null);
  end if;

  -- A document or image after a sent quotation is treated as a PO candidate.
  if p_media_path is not null and p_media_type in ('document', 'image')
     and exists (select 1 from public.quotations where prospect_id = v_prospect.id and status in ('sent', 'accepted')) then
    v_po := public.register_purchase_order(v_prospect.id, p_media_path, p_media_mime, v_msg, null);
  end if;

  if v_consent <> 'opted_out' then
    if v_conv.ai_paused then
      perform public.notify_users(v_mid, coalesce(array_remove(array[v_prospect.assigned_rep_id], null), '{}'::uuid[])
          || case when v_prospect.assigned_rep_id is null then public.tenant_users(v_mid, '{owner,sales_head}') else '{}'::uuid[] end,
        'buyer_replied', v_prospect.name || ' replied', left(coalesce(p_body, '[attachment]'), 140),
        '/rep/leads/' || v_prospect.id, 'reply:' || v_msg, '{in_app,push}');
    else
      v_turn := public.enqueue_ai_turn(v_conv.id, 'inbound_message', v_msg, jsonb_build_object('po_id', v_po));
    end if;
  end if;

  return jsonb_build_object('duplicate', false, 'message_id', v_msg, 'conversation_id', v_conv.id,
                            'prospect_id', v_prospect.id, 'turn_id', v_turn, 'consent', v_consent,
                            'po_id', v_po, 'new_prospect', v_new_prospect);
end
$$;

-- Delivery callbacks. Status only moves forward.
create or replace function public.update_message_status(
  p_provider_message_id text, p_status text, p_at timestamptz default now(), p_error text default null
)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_rank_new integer;
  v_rank_old integer;
  v_msg public.messages%rowtype;
begin
  if not public.is_trusted() then
    perform public.app_error('forbidden', 'Webhook only', null);
  end if;
  select * into v_msg from public.messages where provider_message_id = p_provider_message_id for update;
  if not found then
    return false;
  end if;
  v_rank_new := case p_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else 0 end;
  v_rank_old := case v_msg.status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else 0 end;
  if v_rank_new <= v_rank_old then
    return false;
  end if;
  update public.messages set
    status = p_status::public.message_status,
    sent_at = coalesce(sent_at, case when v_rank_new >= 1 and p_status <> 'failed' then p_at end),
    delivered_at = case when p_status in ('delivered', 'read') then coalesce(delivered_at, p_at) else delivered_at end,
    read_at = case when p_status = 'read' then p_at else read_at end,
    failed_at = case when p_status = 'failed' then p_at else failed_at end,
    error = coalesce(p_error, error)
  where id = v_msg.id;
  return true;
end
$$;

-- Outbound sender: re-checks consent at send time (an opt out after
-- queueing still wins), and returns what the channel adapter needs.
create or replace function public.claim_outbound_message(p_message uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_msg public.messages%rowtype;
  v_conv public.conversations%rowtype;
  v_contact public.contacts%rowtype;
  v_mfr public.manufacturers%rowtype;
  v_tpl public.message_templates%rowtype;
  v_consent public.consent_status;
begin
  if not public.is_trusted() then
    perform public.app_error('forbidden', 'Workers only', null);
  end if;
  select * into v_msg from public.messages where id = p_message for update;
  if not found or v_msg.status <> 'queued' then
    return null;
  end if;
  select * into v_conv from public.conversations where id = v_msg.conversation_id;
  select * into v_contact from public.contacts where id = v_conv.contact_id;
  select * into v_mfr from public.manufacturers where id = v_msg.manufacturer_id;
  v_consent := public.consent_status_for(v_contact.id, v_conv.channel);

  if v_consent not in ('engaged', 'opted_in') or v_contact.phone_e164 is null then
    update public.messages set status = 'blocked', error = 'consent_' || v_consent where id = p_message;
    return null;
  end if;
  if v_msg.template_id is null and (v_conv.window_expires_at is null or now() >= v_conv.window_expires_at) then
    update public.messages set status = 'blocked', error = 'window_closed_before_send' where id = p_message;
    return null;
  end if;
  if v_msg.template_id is not null then
    select * into v_tpl from public.message_templates where id = v_msg.template_id;
  end if;

  update public.messages set attempts = attempts + 1 where id = p_message;
  return jsonb_build_object(
    'message_id', v_msg.id,
    'manufacturer_id', v_msg.manufacturer_id,
    'channel', v_conv.channel,
    'to', v_contact.phone_e164,
    'phone_number_id', v_mfr.whatsapp_phone_number_id,
    'body', v_msg.body,
    'media_path', v_msg.media_path,
    'media_type', v_msg.media_type,
    'media_filename', v_msg.media_filename,
    'template', case when v_tpl.id is not null then jsonb_build_object(
      'name', v_tpl.name, 'language', v_tpl.language, 'params', coalesce(v_msg.template_params, '[]'::jsonb)) end,
    'attempts', v_msg.attempts + 1
  );
end
$$;

create or replace function public.mark_message_sent(p_message uuid, p_provider_message_id text)
returns void
language sql security definer
set search_path = public
as $$
  update public.messages
  set status = 'sent', provider_message_id = p_provider_message_id, sent_at = now(), error = null
  where id = p_message and public.is_trusted();
$$;

create or replace function public.mark_message_failed(p_message uuid, p_error text, p_final boolean)
returns void
language sql security definer
set search_path = public
as $$
  update public.messages
  set status = case when p_final then 'failed'::public.message_status else status end,
      failed_at = case when p_final then now() end,
      error = left(p_error, 500)
  where id = p_message and public.is_trusted();
$$;

-- ---------------------------------------------------------------------------
-- DPDP erasure: delete or anonymise a person across contacts, consents,
-- messages and analytics. Ops only, audited.
-- ---------------------------------------------------------------------------
create or replace function public.erase_contact(p_contact uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_contact public.contacts%rowtype;
  v_media text[];
  v_msgs integer;
begin
  if not (public.is_ops() or public.is_trusted()) then
    perform public.app_error('forbidden', 'Ops only', null);
  end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then
    perform public.app_error('reason_required', 'Record the erasure request reference', 'reason');
  end if;
  select * into v_contact from public.contacts where id = p_contact for update;
  if not found then
    perform public.app_error('not_found', 'Contact not found', 'contact_id');
  end if;

  select coalesce(array_agg(m.media_path) filter (where m.media_path is not null), '{}') into v_media
  from public.messages m join public.conversations c on c.id = m.conversation_id
  where c.contact_id = p_contact;

  perform set_config('app.erasing', 'on', true);
  update public.messages m set body = '[erased]', media_path = null, template_params = null
  from public.conversations c
  where c.id = m.conversation_id and c.contact_id = p_contact;
  get diagnostics v_msgs = row_count;
  perform set_config('app.erasing', 'off', true);

  update public.conversations set last_message_preview = '[erased]' where contact_id = p_contact;
  delete from public.consents where contact_id = p_contact;
  update public.consent_events set evidence = null where contact_id = p_contact;
  update public.contacts set name = null, email = null, phone_e164 = null, role = null, erased_at = now()
  where id = p_contact;

  perform public.write_audit(v_contact.manufacturer_id, 'erase_contact', 'contact', p_contact,
    jsonb_build_object('reason', p_reason, 'messages', v_msgs));
  return jsonb_build_object('ok', true, 'messages_erased', v_msgs, 'media_paths', to_jsonb(v_media));
end
$$;

-- ---------------------------------------------------------------------------
-- Schedules. Conversational queues every few seconds, batch queues every
-- minute, reorders nightly at 02:00 IST.
-- ---------------------------------------------------------------------------
select cron.schedule('wake-outbound-sender', '5 seconds', $$ select public.wake_worker('outbound-sender', 'outbound_messages') $$);
select cron.schedule('wake-ai-reply', '5 seconds', $$ select public.wake_worker('ai-reply', 'ai_turns') $$);
select cron.schedule('wake-notify', '10 seconds', $$ select public.wake_worker('notify', 'notifications') $$);
select cron.schedule('wake-quotation-pdf', '10 seconds', $$ select public.wake_worker('quotation-pdf', 'quotation_jobs') $$);
select cron.schedule('wake-po-parse', '15 seconds', $$ select public.wake_worker('po-parse', 'po_parse') $$);
select cron.schedule('wake-ingest', '30 seconds', $$ select public.wake_worker('ingest-worker', 'ingest') $$);
select cron.schedule('wake-classify', '20 seconds', $$ select public.wake_worker('classify-worker', 'classify') $$);
select cron.schedule('wake-research', '20 seconds', $$ select public.wake_worker('research-worker', 'research') $$);
select cron.schedule('wake-embeddings', '* * * * *', $$ select public.wake_worker('embeddings-index', 'embeddings') $$);
select cron.schedule('process-followups', '* * * * *', $$ select public.process_due_followups() $$);
select cron.schedule('approval-timers', '* * * * *', $$ select public.process_approval_timers() $$);
select cron.schedule('compute-reorders', '30 20 * * *', $$ select public.compute_reorders() $$);
select cron.schedule('purge-idempotency-keys', '0 21 * * *', $$ delete from public.idempotency_keys where created_at < now() - interval '14 days' $$);
