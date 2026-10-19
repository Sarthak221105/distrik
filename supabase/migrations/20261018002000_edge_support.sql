-- Edge Function support (PRD 5, 9, 12).
--
-- 1. The service role (used only inside Edge Functions) needs table access
--    through PostgREST. New tables are no longer auto exposed, so grant it
--    explicitly. Browsers (anon, authenticated) are unaffected.
-- 2. Knowledge retrieval for the sales agent: pgvector search with a keyword
--    (pg_trgm / ilike) fallback for chunks that have no embedding yet.
-- 3. An atomic AI turn claim so a retried queue message never runs a finished
--    turn twice.

-- ---------------------------------------------------------------------------
-- 1. Service role privileges
-- ---------------------------------------------------------------------------
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- ---------------------------------------------------------------------------
-- 2. Knowledge retrieval
-- ---------------------------------------------------------------------------
create index if not exists knowledge_chunks_content_trgm
  on public.knowledge_chunks using gin (content extensions.gin_trgm_ops);

-- Vector search. Chunks for the given product rank first, then general
-- manufacturer knowledge (product_id null). Never crosses tenants.
create or replace function public.match_knowledge(
  p_manufacturer uuid,
  p_query_embedding extensions.vector(384),
  p_product uuid default null,
  p_count integer default 5
)
returns table (
  id uuid,
  product_id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql stable security definer
set search_path = public, extensions
as $$
  select k.id, k.product_id, k.document_id, k.content, k.metadata,
         1 - (k.embedding <=> p_query_embedding) as similarity
  from public.knowledge_chunks k
  where k.manufacturer_id = p_manufacturer
    and k.embedding is not null
    and (p_product is null or k.product_id = p_product or k.product_id is null)
  order by (k.product_id is not distinct from p_product) desc nulls last,
           k.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_count, 5), 20))
$$;

-- Keyword fallback when embeddings are unavailable (or not yet computed).
create or replace function public.search_knowledge(
  p_manufacturer uuid,
  p_query text,
  p_product uuid default null,
  p_count integer default 5
)
returns table (
  id uuid,
  product_id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity double precision
)
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  v_q text := lower(left(coalesce(p_query, ''), 300));
  v_words text[];
begin
  select coalesce(array_agg(w), '{}') into v_words
  from (select distinct w from regexp_split_to_table(v_q, '[^a-z0-9]+') w where length(w) >= 3) t;

  return query
  select k.id, k.product_id, k.document_id, k.content, k.metadata,
         (greatest(word_similarity(v_q, lower(k.content)), 0)
          + coalesce((select count(*) from unnest(v_words) w where lower(k.content) like '%' || w || '%'), 0) * 0.1
          + case when p_product is not null and k.product_id = p_product then 0.5 else 0 end)::double precision as score
  from public.knowledge_chunks k
  where k.manufacturer_id = p_manufacturer
    and (p_product is null or k.product_id = p_product or k.product_id is null)
  order by score desc, k.created_at
  limit greatest(1, least(coalesce(p_count, 5), 20));
end
$$;

-- ---------------------------------------------------------------------------
-- 3. AI turn claim: returns the turn row when it can run now, null when it is
--    finished, skipped, or out of attempts.
-- ---------------------------------------------------------------------------
create or replace function public.claim_ai_turn(p_turn uuid, p_max_attempts integer default 5)
returns public.ai_turns
language plpgsql security definer
set search_path = public
as $$
declare
  v_turn public.ai_turns%rowtype;
begin
  if not public.is_trusted() then
    perform public.app_error('forbidden', 'Workers only', null);
  end if;
  update public.ai_turns
  set status = 'running', attempts = attempts + 1, error = null
  where id = p_turn and status in ('queued', 'running', 'failed') and attempts < p_max_attempts
  returning * into v_turn;
  if not found then
    return null;
  end if;
  return v_turn;
end
$$;

create or replace function public.finish_ai_turn(p_turn uuid, p_status text, p_error text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_trusted() then
    perform public.app_error('forbidden', 'Workers only', null);
  end if;
  if p_status not in ('done', 'failed', 'skipped', 'queued') then
    perform public.app_error('invalid_status', 'Unknown turn status', 'status');
  end if;
  update public.ai_turns
  set status = p_status,
      error = left(p_error, 1000),
      completed_at = case when p_status in ('done', 'skipped') then now() else completed_at end
  where id = p_turn;
end
$$;

revoke execute on function public.match_knowledge(uuid, extensions.vector, uuid, integer) from public, anon, authenticated;
revoke execute on function public.search_knowledge(uuid, text, uuid, integer) from public, anon, authenticated;
revoke execute on function public.claim_ai_turn(uuid, integer) from public, anon, authenticated;
revoke execute on function public.finish_ai_turn(uuid, text, text) from public, anon, authenticated;
grant execute on function public.match_knowledge(uuid, extensions.vector, uuid, integer) to service_role;
grant execute on function public.search_knowledge(uuid, text, uuid, integer) to service_role;
grant execute on function public.claim_ai_turn(uuid, integer) to service_role;
grant execute on function public.finish_ai_turn(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. register_purchase_order: restated verbatim from 20261018000500 so a local
--    database created before that file was corrected accepts the documented
--    "<bucket>/<manufacturer_id>/..." path convention (whatsapp-media and
--    purchase-orders). Identical on a fresh reset.
-- ---------------------------------------------------------------------------
create or replace function public.register_purchase_order(
  p_prospect uuid, p_file_path text, p_mime text default null, p_message uuid default null, p_quotation uuid default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_prospect public.prospects%rowtype;
  v_quote uuid := p_quotation;
  v_id uuid;
begin
  select * into v_prospect from public.prospects where id = p_prospect;
  if not found then
    perform public.app_error('not_found', 'Prospect not found', 'prospect_id');
  end if;
  if not public.is_trusted() and (v_prospect.manufacturer_id is distinct from public.auth_mid()
     or not public.rep_can_see(p_prospect)) then
    perform public.app_error('forbidden', 'Not allowed', 'prospect_id');
  end if;
  -- file paths are "<bucket>/<manufacturer_id>/..." (PO uploads or WhatsApp media)
  if split_part(p_file_path, '/', 1) not in ('purchase-orders', 'whatsapp-media')
     or split_part(p_file_path, '/', 2) <> v_prospect.manufacturer_id::text then
    perform public.app_error('invalid_path', 'File must live in the manufacturer folder', 'file_path');
  end if;
  if v_quote is null then
    select id into v_quote from public.quotations
    where prospect_id = p_prospect and status in ('sent', 'accepted')
    order by created_at desc limit 1;
  end if;
  insert into public.purchase_orders (manufacturer_id, quotation_id, prospect_id, message_id, file_path, mime_type, uploaded_by)
  values (v_prospect.manufacturer_id, v_quote, p_prospect, p_message, p_file_path, p_mime, auth.uid())
  on conflict (message_id) do nothing
  returning id into v_id;
  if v_id is not null then
    perform pgmq.send('po_parse', jsonb_build_object('po_id', v_id));
  end if;
  return v_id;
end
$$;

revoke execute on function public.register_purchase_order(uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.register_purchase_order(uuid, text, text, uuid, uuid) to authenticated, service_role;
