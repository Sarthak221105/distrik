-- Discovery, scoring and the prospect pipeline (PRD 7).

-- ---------------------------------------------------------------------------
-- create_campaign: stores the confirmed objective and enqueues one ingest
-- job per enabled source that has a recorded lawful basis.
-- ---------------------------------------------------------------------------
create or replace function public.create_campaign(
  p_objective text,
  p_product_ids uuid[],
  p_city text,
  p_state text,
  p_category text default null,
  p_target_count integer default 75,
  p_parsed jsonb default '{}'::jsonb,
  p_name text default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_mid uuid := public.auth_mid();
  v_id uuid;
  v_source record;
  v_jobs integer := 0;
  v_job uuid;
begin
  if not public.is_manager() then
    perform public.app_error('forbidden', 'Only an owner or sales head can start a campaign', null);
  end if;
  if coalesce(trim(p_objective), '') = '' then
    perform public.app_error('objective_required', 'Describe the market you want to sell into', 'objective');
  end if;
  if coalesce(trim(p_city), '') = '' then
    perform public.app_error('city_required', 'Pick a city for this campaign', 'city');
  end if;
  if p_product_ids is null or cardinality(p_product_ids) = 0 then
    perform public.app_error('products_required', 'Pick at least one product', 'product_ids');
  end if;
  if exists (select 1 from unnest(p_product_ids) pid
             where not exists (select 1 from public.products where id = pid and manufacturer_id = v_mid and status = 'active')) then
    perform public.app_error('invalid_product', 'A selected product is not active in your catalogue', 'product_ids');
  end if;
  if p_target_count is null or p_target_count < 1 or p_target_count > 500 then
    perform public.app_error('invalid_target', 'Target count must be between 1 and 500', 'target_count');
  end if;

  insert into public.campaigns (manufacturer_id, name, product_ids, objective_text, parsed_intent, target_geo,
    target_city, target_state, target_category, target_count, status, status_detail, created_by)
  values (v_mid, coalesce(nullif(trim(p_name), ''), initcap(p_city) || ' · ' || to_char(now() at time zone 'Asia/Kolkata', 'Mon YYYY')),
    p_product_ids, p_objective, coalesce(p_parsed, '{}'::jsonb),
    jsonb_build_object('city', p_city, 'state', p_state), initcap(trim(p_city)), p_state, p_category, p_target_count,
    'discovering', 'Finding buyers', auth.uid())
  returning id into v_id;

  for v_source in
    select * from public.sources
    where enabled and coalesce(trim(lawful_basis), '') <> '' and adapter <> 'csv_upload'
  loop
    insert into public.campaign_jobs (manufacturer_id, campaign_id, step, source_id)
    values (v_mid, v_id, 'ingest', v_source.id)
    returning id into v_job;
    perform pgmq.send('ingest', jsonb_build_object('campaign_job_id', v_job));
    v_jobs := v_jobs + 1;
  end loop;

  if v_jobs = 0 then
    update public.campaigns
    set status_detail = 'Waiting for ops to upload prospects (no automatic source enabled)', stalled_step = 'ingest'
    where id = v_id;
    perform public.notify_users(null, public.ops_users(), 'campaign_needs_sourcing', 'Campaign needs manual sourcing',
      p_objective, '/ops/qa?campaign=' || v_id, 'campaign_sourcing:' || v_id, '{in_app,email}');
  end if;

  insert into public.product_events (manufacturer_id, user_id, name, properties)
  values (v_mid, auth.uid(), 'campaign_started', jsonb_build_object('campaign_id', v_id, 'sources', v_jobs));
  return v_id;
end
$$;

-- Ops CSV upload for a campaign: rows land as raw records through the same
-- pipeline (adapter csv_upload).
create or replace function public.ops_import_raw_records(p_campaign uuid, p_rows jsonb)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_source uuid;
  v_row jsonb;
  v_count integer := 0;
  v_job uuid;
begin
  if not (public.is_ops() or public.is_trusted()) then
    perform public.app_error('forbidden', 'Only ops can import prospects', null);
  end if;
  select * into v_campaign from public.campaigns where id = p_campaign;
  if not found then
    perform public.app_error('not_found', 'Campaign not found', 'campaign_id');
  end if;
  select id into v_source from public.sources where adapter = 'csv_upload' and enabled
    and coalesce(trim(lawful_basis), '') <> '' limit 1;
  if v_source is null then
    perform public.app_error('source_disabled', 'The CSV source is disabled or has no lawful basis', null);
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    insert into public.raw_records (manufacturer_id, campaign_id, source_id, external_id, payload)
    values (v_campaign.manufacturer_id, p_campaign, v_source,
            coalesce(v_row ->> 'external_id', md5(coalesce(v_row ->> 'name', '') || coalesce(v_row ->> 'phone', '') || coalesce(v_row ->> 'address', ''))),
            v_row)
    on conflict (campaign_id, source_id, external_id) do nothing;
    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  insert into public.campaign_jobs (manufacturer_id, campaign_id, step, source_id, status, records, started_at, finished_at)
  values (v_campaign.manufacturer_id, p_campaign, 'ingest', v_source, 'done', v_count, now(), now())
  on conflict (campaign_id, step, source_id) do update
    set records = public.campaign_jobs.records + excluded.records, status = 'done', finished_at = now()
  returning id into v_job;

  update public.campaigns set stalled_step = null, status = 'discovering', status_detail = 'Normalising uploaded records'
  where id = p_campaign and status in ('draft', 'discovering', 'failed');

  perform public.normalize_campaign_records(p_campaign);
  perform public.write_audit(v_campaign.manufacturer_id, 'ops_import_raw_records', 'campaign', p_campaign,
    jsonb_build_object('rows', v_count));
  return v_count;
end
$$;

-- ---------------------------------------------------------------------------
-- Normalise and deduplicate. Payload is the canonical adapter shape:
-- { name, phone, email, address, city, state, pincode, lat, lng, type,
--   category_hint, website, source_url, contact_name, contact_role,
--   brands, signals: {...}, verified: bool }
-- Above 0.85 similarity (or an exact phone match) records merge; 0.6 to 0.85
-- go to the ops merge queue. Matching runs inside the campaign and against
-- the manufacturer's existing prospects. Idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_campaign_records(p_campaign uuid)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_campaign public.campaigns%rowtype;
  r public.raw_records%rowtype;
  p jsonb;
  v_name text;
  v_norm text;
  v_phone text;
  v_city text;
  v_match uuid;
  v_sim numeric;
  v_prospect uuid;
  v_contact uuid;
  v_created integer := 0;
  v_merged integer := 0;
  v_review integer := 0;
  v_rejected integer := 0;
  v_conf text;
begin
  select * into v_campaign from public.campaigns where id = p_campaign;
  if not found then
    perform public.app_error('not_found', 'Campaign not found', 'campaign_id');
  end if;
  if not (public.is_trusted() or public.is_ops()) then
    perform public.app_error('forbidden', 'Not allowed', null);
  end if;

  for r in select * from public.raw_records where campaign_id = p_campaign and status = 'new' for update skip locked loop
    p := r.payload;
    v_name := nullif(trim(p ->> 'name'), '');
    v_norm := public.normalize_business_name(v_name);
    v_phone := public.normalize_phone_e164(p ->> 'phone');
    v_city := initcap(trim(coalesce(p ->> 'city', v_campaign.target_city)));
    v_conf := case when coalesce((p ->> 'verified')::boolean, false) or coalesce(p ->> 'source_url', '') <> '' then 'verified' else 'inferred' end;

    if v_norm is null then
      update public.raw_records set status = 'rejected', error = 'missing name' where id = r.id;
      v_rejected := v_rejected + 1;
      continue;
    end if;

    -- exact phone match first
    v_match := null;
    v_sim := null;
    if v_phone is not null then
      select c.prospect_id into v_match from public.contacts c
      where c.manufacturer_id = r.manufacturer_id and c.phone_e164 = v_phone limit 1;
      if v_match is not null then
        v_sim := 1;
      end if;
    end if;
    if v_match is null then
      select id, similarity(normalized_name, v_norm) into v_match, v_sim
      from public.prospects
      where manufacturer_id = r.manufacturer_id
        and normalized_name % v_norm
        and (city is null or v_city is null or lower(city) = lower(v_city))
      order by similarity(normalized_name, v_norm) desc
      limit 1;
    end if;

    if v_match is not null and v_sim > 0.85 then
      -- auto merge, keeping the highest confidence source
      update public.prospects pr set
        confidence = case when v_conf = 'verified' then 'verified' else pr.confidence end,
        source_url = coalesce(pr.source_url, p ->> 'source_url'),
        address = coalesce(pr.address, p ->> 'address'),
        pincode = coalesce(pr.pincode, p ->> 'pincode'),
        website = coalesce(pr.website, p ->> 'website'),
        signals = coalesce(p -> 'signals', '{}'::jsonb) || pr.signals
      where pr.id = v_match;
      update public.raw_records set status = 'merged', prospect_id = v_match where id = r.id;
      v_merged := v_merged + 1;
    elsif v_match is not null and v_sim >= 0.6 then
      insert into public.merge_candidates (manufacturer_id, campaign_id, raw_record_id, prospect_id, similarity)
      values (r.manufacturer_id, p_campaign, r.id, v_match, round(v_sim, 3))
      on conflict do nothing;
      update public.raw_records set status = 'duplicate_review' where id = r.id;
      v_review := v_review + 1;
    else
      v_prospect := public.create_prospect_from_raw(r.id);
      v_created := v_created + 1;
    end if;
  end loop;

  update public.campaign_jobs set status = 'done', finished_at = now(), records = v_created
  where campaign_id = p_campaign and step = 'normalize';
  if not found then
    insert into public.campaign_jobs (manufacturer_id, campaign_id, step, status, records, started_at, finished_at)
    values (v_campaign.manufacturer_id, p_campaign, 'normalize', 'done', v_created, now(), now())
    on conflict do nothing;
  end if;

  perform public.advance_campaign(p_campaign);
  return jsonb_build_object('created', v_created, 'merged', v_merged, 'review', v_review, 'rejected', v_rejected);
end
$$;

create or replace function public.create_prospect_from_raw(p_raw uuid)
returns uuid
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  r public.raw_records%rowtype;
  v_campaign public.campaigns%rowtype;
  p jsonb;
  v_prospect uuid;
  v_contact uuid;
  v_phone text;
  v_type text;
begin
  select * into r from public.raw_records where id = p_raw;
  select * into v_campaign from public.campaigns where id = r.campaign_id;
  p := r.payload;
  v_phone := public.normalize_phone_e164(p ->> 'phone');
  v_type := lower(coalesce(p ->> 'type', 'distributor'));
  if v_type not in ('distributor', 'super_stockist', 'wholesaler', 'dealer', 'retailer', 'modern_trade', 'other') then
    v_type := 'other';
  end if;

  insert into public.prospects (manufacturer_id, campaign_id, name, normalized_name, type, category, address, city, state,
    pincode, geo, gstin, website, source_id, source_url, confidence, signals, research, pipeline_step, review_status)
  values (r.manufacturer_id, r.campaign_id, trim(p ->> 'name'), public.normalize_business_name(p ->> 'name'), v_type,
    p ->> 'category_hint', p ->> 'address', initcap(trim(coalesce(p ->> 'city', v_campaign.target_city))),
    coalesce(p ->> 'state', v_campaign.target_state), p ->> 'pincode',
    case when p ? 'lat' and p ? 'lng' and (p ->> 'lat') is not null
         then extensions.st_setsrid(extensions.st_makepoint((p ->> 'lng')::float8, (p ->> 'lat')::float8), 4326)::extensions.geography end,
    p ->> 'gstin', p ->> 'website', r.source_id, p ->> 'source_url',
    case when coalesce((p ->> 'verified')::boolean, false) or coalesce(p ->> 'source_url', '') <> '' then 'verified' else 'inferred' end,
    coalesce(p -> 'signals', '{}'::jsonb),
    jsonb_strip_nulls(jsonb_build_object('brands_carried', p -> 'brands', 'raw_description', p ->> 'description')),
    'classify', 'pending')
  returning id into v_prospect;

  if v_phone is not null or coalesce(p ->> 'contact_name', '') <> '' or coalesce(p ->> 'email', '') <> '' then
    insert into public.contacts (manufacturer_id, prospect_id, name, role, phone_e164, email, is_primary)
    values (r.manufacturer_id, v_prospect, p ->> 'contact_name', p ->> 'contact_role', v_phone, p ->> 'email', true)
    on conflict (manufacturer_id, phone_e164) where phone_e164 is not null do nothing
    returning id into v_contact;
    if v_contact is not null then
      insert into public.consents (manufacturer_id, contact_id, channel, status, source)
      values (r.manufacturer_id, v_contact, 'whatsapp', 'none', 'discovered')
      on conflict do nothing;
    end if;
  end if;

  update public.raw_records set status = 'normalized', prospect_id = v_prospect where id = p_raw;
  perform pgmq.send('classify', jsonb_build_object('prospect_id', v_prospect));
  return v_prospect;
end
$$;

-- Ops resolves a gray zone match.
create or replace function public.resolve_merge_candidate(p_id uuid, p_merge boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_mc public.merge_candidates%rowtype;
begin
  if not public.is_ops() then
    perform public.app_error('forbidden', 'Only ops can resolve duplicates', null);
  end if;
  select * into v_mc from public.merge_candidates where id = p_id for update;
  if not found or v_mc.status <> 'pending' then
    perform public.app_error('not_found', 'Candidate not found or already resolved', 'id');
  end if;
  if p_merge then
    update public.raw_records set status = 'merged', prospect_id = v_mc.prospect_id where id = v_mc.raw_record_id;
    update public.merge_candidates set status = 'merged', resolved_by = auth.uid(), resolved_at = now() where id = p_id;
  else
    update public.merge_candidates set status = 'distinct', resolved_by = auth.uid(), resolved_at = now() where id = p_id;
    perform public.create_prospect_from_raw(v_mc.raw_record_id);
  end if;
  perform public.write_audit(v_mc.manufacturer_id, 'resolve_merge_candidate', 'merge_candidate', p_id,
    jsonb_build_object('merge', p_merge));
  if v_mc.campaign_id is not null then
    perform public.advance_campaign(v_mc.campaign_id);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Classification and research results (written by Edge Functions)
-- ---------------------------------------------------------------------------
create or replace function public.set_prospect_classification(
  p_prospect uuid, p_category text, p_type text, p_confidence numeric, p_reason text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_trusted() then
    perform public.app_error('forbidden', 'Workers only', null);
  end if;
  update public.prospects set
    category = coalesce(p_category, category),
    type = case when p_type in ('distributor', 'super_stockist', 'wholesaler', 'dealer', 'retailer', 'modern_trade', 'other')
                then p_type else type end,
    category_confidence = p_confidence,
    needs_ops_attention = case when p_confidence < 0.7
                               then 'Low classification confidence (' || round(p_confidence, 2) || '): ' || coalesce(p_reason, '')
                               else needs_ops_attention end,
    pipeline_step = 'research'
  where id = p_prospect;
  perform pgmq.send('research', jsonb_build_object('prospect_id', p_prospect));
end
$$;

create or replace function public.set_prospect_research(p_prospect uuid, p_research jsonb, p_signals jsonb)
returns numeric
language plpgsql security definer
set search_path = public
as $$
declare
  v_score numeric;
  v_campaign uuid;
begin
  if not public.is_trusted() then
    perform public.app_error('forbidden', 'Workers only', null);
  end if;
  update public.prospects set
    research = research || coalesce(p_research, '{}'::jsonb),
    signals = signals || coalesce(p_signals, '{}'::jsonb),
    pipeline_step = 'score'
  where id = p_prospect
  returning campaign_id into v_campaign;
  v_score := public.score_prospect(p_prospect);
  if v_campaign is not null then
    perform public.advance_campaign(v_campaign);
  end if;
  return v_score;
end
$$;

-- ---------------------------------------------------------------------------
-- score_prospect: sum of weight × signal over seven configurable criteria.
-- A missing signal takes a neutral 0.5 and is flagged in the breakdown,
-- never silently counted as zero.
-- ---------------------------------------------------------------------------
create or replace function public.score_prospect(p_prospect uuid)
returns numeric
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_p public.prospects%rowtype;
  v_mfr public.manufacturers%rowtype;
  v_campaign public.campaigns%rowtype;
  v_signals jsonb;
  v_key text;
  v_weight numeric;
  v_signal numeric;
  v_missing boolean;
  v_source text;
  v_breakdown jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_weights numeric := 0;
  v_territory text;
  v_product_categories text[];
begin
  select * into v_p from public.prospects where id = p_prospect;
  if not found then
    return null;
  end if;
  select * into v_mfr from public.manufacturers where id = v_p.manufacturer_id;
  select * into v_campaign from public.campaigns where id = v_p.campaign_id;
  v_signals := coalesce(v_p.signals, '{}'::jsonb);

  -- Derived signals the database knows better than any worker.
  if not v_signals ? 'category_match' and v_p.category is not null then
    select array_agg(distinct lower(category)) into v_product_categories
    from public.products where id = any (coalesce(v_campaign.product_ids, '{}'));
    v_signals := v_signals || jsonb_build_object('category_match',
      case when lower(v_p.category) = any (coalesce(v_product_categories, '{}'))
             or lower(v_p.category) = lower(coalesce(v_campaign.target_category, '')) then 1.0
           when v_p.type in ('distributor', 'super_stockist', 'wholesaler') then 0.6
           else 0.3 end);
  end if;
  if not v_signals ? 'territory_availability' then
    select status into v_territory from public.territories
    where manufacturer_id = v_p.manufacturer_id and lower(v_p.city) = any (select lower(c) from unnest(cities) c)
    order by case status when 'exclusive' then 0 when 'covered' then 1 else 2 end limit 1;
    if v_territory is not null then
      v_signals := v_signals || jsonb_build_object('territory_availability',
        case v_territory when 'exclusive' then 0.0 when 'covered' then 0.3 else 1.0 end);
    end if;
  end if;

  for v_key, v_weight in
    select key, value::numeric from jsonb_each_text(v_mfr.fit_weights)
  loop
    v_missing := not (v_signals ? v_key) or jsonb_typeof(v_signals -> v_key) = 'null';
    v_signal := case when v_missing then 0.5 else least(1, greatest(0, (v_signals ->> v_key)::numeric)) end;
    v_source := case when v_key in ('category_match', 'territory_availability') and not (v_p.signals ? v_key) then 'derived'
                     when v_missing then 'missing'
                     else coalesce(v_p.research -> 'signal_sources' ->> v_key, 'research') end;
    v_breakdown := v_breakdown || jsonb_build_object(
      'criterion', v_key, 'weight', v_weight, 'signal', v_signal, 'missing', v_missing,
      'contribution', round(v_weight * v_signal, 2), 'source', v_source);
    v_total := v_total + v_weight * v_signal;
    v_weights := v_weights + v_weight;
  end loop;

  update public.prospects
  set fit_score = case when v_weights > 0 then round(100 * v_total / v_weights, 2) else null end,
      fit_breakdown = v_breakdown,
      fit_config_version = v_mfr.fit_config_version,
      pipeline_step = 'done'
  where id = p_prospect;
  return case when v_weights > 0 then round(100 * v_total / v_weights, 2) end;
end
$$;

create or replace function public.update_fit_weights(p_weights jsonb)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_mid uuid := public.auth_mid();
  v_version integer;
  v_key text;
  v_id uuid;
  v_n integer := 0;
begin
  if public.auth_role() <> 'owner' then
    perform public.app_error('forbidden', 'Only an owner can change scoring weights', null);
  end if;
  for v_key in select jsonb_object_keys(p_weights) loop
    if v_key not in ('category_match', 'geographic_coverage', 'brands_carried', 'retail_network', 'logistics',
                     'territory_availability', 'company_size') then
      perform public.app_error('invalid_criterion', 'Unknown criterion ' || v_key, 'weights');
    end if;
    if (p_weights ->> v_key)::numeric < 0 or (p_weights ->> v_key)::numeric > 100 then
      perform public.app_error('invalid_weight', 'Weights must be between 0 and 100', v_key);
    end if;
  end loop;
  update public.manufacturers
  set fit_weights = p_weights, fit_config_version = fit_config_version + 1
  where id = v_mid returning fit_config_version into v_version;

  for v_id in select id from public.prospects where manufacturer_id = v_mid and pipeline_step = 'done' loop
    perform public.score_prospect(v_id);
    v_n := v_n + 1;
  end loop;
  perform public.write_audit(v_mid, 'update_fit_weights', 'manufacturer', v_mid,
    jsonb_build_object('weights', p_weights, 'version', v_version, 'rescored', v_n));
  return v_version;
end
$$;

-- ---------------------------------------------------------------------------
-- Campaign state machine
-- ---------------------------------------------------------------------------
create or replace function public.advance_campaign(p_campaign uuid)
returns public.campaign_status
language plpgsql security definer
set search_path = public
as $$
declare
  v_c public.campaigns%rowtype;
  v_ingest_open integer;
  v_ingest_failed integer;
  v_in_pipeline integer;
  v_pending_review integer;
  v_approved integer;
  v_total integer;
  v_dupes integer;
  v_status public.campaign_status;
  v_detail text;
  v_stalled text;
begin
  select * into v_c from public.campaigns where id = p_campaign for update;
  if not found or v_c.status in ('live', 'paused', 'completed') then
    return v_c.status;
  end if;

  select count(*) filter (where status in ('queued', 'running')), count(*) filter (where status = 'failed')
  into v_ingest_open, v_ingest_failed
  from public.campaign_jobs where campaign_id = p_campaign and step = 'ingest';

  select count(*) filter (where pipeline_step <> 'done'),
         count(*) filter (where pipeline_step = 'done' and review_status = 'pending'),
         count(*) filter (where review_status = 'approved'),
         count(*)
  into v_in_pipeline, v_pending_review, v_approved, v_total
  from public.prospects where campaign_id = p_campaign;

  select count(*) into v_dupes from public.merge_candidates where campaign_id = p_campaign and status = 'pending';

  if v_ingest_open > 0 then
    v_status := 'discovering';
    v_detail := format('Finding buyers (%s found so far)', v_total);
  elsif v_total = 0 then
    v_status := case when v_ingest_failed > 0 then 'failed' else 'discovering' end;
    v_detail := case when v_ingest_failed > 0 then 'Every source failed' else 'Waiting for prospect records' end;
    v_stalled := 'ingest';
  elsif v_in_pipeline > 0 then
    v_status := 'scoring';
    v_detail := format('Researching and scoring %s of %s', v_total - v_in_pipeline, v_total);
  elsif v_pending_review > 0 or v_dupes > 0 then
    v_status := 'qa';
    v_detail := format('Ops reviewing %s prospects, %s possible duplicates', v_pending_review, v_dupes);
  else
    v_status := 'ready';
    v_detail := format('%s approved prospects ready for outreach', v_approved);
    if v_approved < least(50, v_c.target_count) then
      v_detail := v_detail || format(' (below the target of %s)', v_c.target_count);
    end if;
  end if;

  update public.campaigns
  set status = v_status, status_detail = v_detail, stalled_step = v_stalled,
      ready_at = case when v_status = 'ready' and ready_at is null then now() else ready_at end
  where id = p_campaign;

  if v_status = 'ready' and v_c.status <> 'ready' then
    perform public.notify_users(v_c.manufacturer_id, public.tenant_users(v_c.manufacturer_id, '{owner,sales_head}'),
      'campaign_ready', 'Campaign ready: ' || v_c.name, v_detail, '/campaigns/' || p_campaign,
      'campaign_ready:' || p_campaign, '{in_app,push,email}');
  end if;
  return v_status;
end
$$;

-- Ops QA gate: approve, reject or edit prospects in batches.
create or replace function public.approve_prospects(p_ids uuid[], p_decision text, p_note text default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_n integer;
  v_campaign uuid;
begin
  if p_decision not in ('approve', 'reject') then
    perform public.app_error('invalid_decision', 'Decision must be approve or reject', 'decision');
  end if;
  if public.is_ops() then
    update public.prospects
    set review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end::public.review_status,
        review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now(), needs_ops_attention = null
    where id = any (p_ids) and pipeline_step = 'done';
    get diagnostics v_n = row_count;
    insert into public.audit_log (manufacturer_id, actor_id, actor_role, action, entity, entity_id, details)
    select distinct manufacturer_id, auth.uid(), 'ops_admin', 'ops_review_prospects', 'campaign', campaign_id,
           jsonb_build_object('decision', p_decision, 'count', v_n)
    from public.prospects where id = any (p_ids);
  elsif public.is_manager() then
    -- Manufacturers can only reject (hide) prospects that passed QA.
    if p_decision <> 'reject' then
      perform public.app_error('forbidden', 'Prospects are approved by ops QA', 'decision');
    end if;
    update public.prospects
    set review_status = 'rejected', review_note = coalesce(p_note, 'Rejected by manufacturer'),
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = any (p_ids) and manufacturer_id = public.auth_mid();
    get diagnostics v_n = row_count;
  else
    perform public.app_error('forbidden', 'Not allowed', null);
  end if;

  for v_campaign in select distinct campaign_id from public.prospects where id = any (p_ids) and campaign_id is not null loop
    perform public.advance_campaign(v_campaign);
  end loop;
  return v_n;
end
$$;

-- Ops edits normalised fields during QA.
create or replace function public.ops_update_prospect(p_id uuid, p_fields jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_mid uuid;
begin
  if not public.is_ops() then
    perform public.app_error('forbidden', 'Only ops can edit prospects during QA', null);
  end if;
  update public.prospects set
    name = coalesce(p_fields ->> 'name', name),
    normalized_name = coalesce(public.normalize_business_name(p_fields ->> 'name'), normalized_name),
    type = coalesce(p_fields ->> 'type', type),
    category = coalesce(p_fields ->> 'category', category),
    address = coalesce(p_fields ->> 'address', address),
    city = coalesce(p_fields ->> 'city', city),
    state = coalesce(p_fields ->> 'state', state),
    pincode = coalesce(p_fields ->> 'pincode', pincode)
  where id = p_id
  returning manufacturer_id into v_mid;
  if p_fields ? 'phone' then
    update public.contacts set phone_e164 = public.normalize_phone_e164(p_fields ->> 'phone')
    where prospect_id = p_id and is_primary;
  end if;
  perform public.write_audit(v_mid, 'ops_update_prospect', 'prospect', p_id, p_fields);
end
$$;

-- Manufacturer releases prospects for outreach. Contacts with no consent go
-- to a rep (call plus click to chat link); opted in contacts get an AI
-- opener through an approved template. No cold WhatsApp broadcasts.
create or replace function public.approve_outreach(p_prospect_ids uuid[], p_rep uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_mid uuid := public.auth_mid();
  v_p public.prospects%rowtype;
  v_contact public.contacts%rowtype;
  v_rep uuid;
  v_conv uuid;
  v_ai integer := 0;
  v_rep_tasks integer := 0;
  v_campaign uuid;
begin
  if not public.is_manager() then
    perform public.app_error('forbidden', 'Only an owner or sales head can approve outreach', null);
  end if;
  if p_rep is not null and not exists (select 1 from public.profiles where user_id = p_rep and manufacturer_id = v_mid and role = 'rep' and active) then
    perform public.app_error('invalid_rep', 'Rep not found in your team', 'rep');
  end if;

  for v_p in
    select * from public.prospects
    where id = any (p_prospect_ids) and manufacturer_id = v_mid and review_status = 'approved' and not outreach_approved
    for update
  loop
    v_rep := coalesce(p_rep, v_p.assigned_rep_id, public.pick_rep(v_mid));
    update public.prospects set outreach_approved = true, outreach_approved_at = now(), assigned_rep_id = v_rep
    where id = v_p.id;
    v_campaign := coalesce(v_campaign, v_p.campaign_id);

    select * into v_contact from public.contacts where prospect_id = v_p.id and is_primary and phone_e164 is not null limit 1;
    if v_contact.id is not null and public.consent_status_for(v_contact.id) = 'opted_in' then
      insert into public.conversations (manufacturer_id, prospect_id, contact_id, channel)
      values (v_mid, v_p.id, v_contact.id, 'whatsapp')
      on conflict (contact_id, channel) do update set prospect_id = excluded.prospect_id
      returning id into v_conv;
      perform public.enqueue_ai_turn(v_conv, 'outreach_opener', null, jsonb_build_object('campaign_id', v_p.campaign_id));
      v_ai := v_ai + 1;
    else
      v_rep_tasks := v_rep_tasks + 1;
    end if;
    if v_rep is not null then
      perform public.notify_users(v_mid, array[v_rep], 'lead_assigned', 'New lead: ' || v_p.name,
        coalesce(v_p.city, '') || ' · fit ' || coalesce(round(v_p.fit_score)::text, '–'),
        '/rep/leads/' || v_p.id, 'assigned:' || v_p.id || ':' || v_rep, '{in_app}');
    end if;
    insert into public.prospect_events (manufacturer_id, prospect_id, kind, body, actor_id, data)
    values (v_mid, v_p.id, 'assignment', 'Released for outreach', auth.uid(), jsonb_build_object('rep', v_rep));
    v_contact := null;
  end loop;

  if v_campaign is not null then
    update public.campaigns set status = 'live', launched_at = coalesce(launched_at, now())
    where id = v_campaign and status = 'ready';
  end if;
  return jsonb_build_object('ai_openers', v_ai, 'rep_tasks', v_rep_tasks);
end
$$;

-- Bulk release for a campaign (manufacturer one tap).
create or replace function public.launch_campaign(p_campaign uuid, p_min_fit numeric default 0)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.prospects
  where campaign_id = p_campaign and manufacturer_id = public.auth_mid()
    and review_status = 'approved' and not outreach_approved and coalesce(fit_score, 0) >= p_min_fit;
  if v_ids is null then
    return jsonb_build_object('ai_openers', 0, 'rep_tasks', 0);
  end if;
  return public.approve_outreach(v_ids, null);
end
$$;
