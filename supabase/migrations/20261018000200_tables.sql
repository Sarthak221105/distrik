-- AI Sales OS: tables (PRD section 6). Every tenant table carries
-- manufacturer_id, money is bigint paise, timestamps are timestamptz (UTC).

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  state text not null,
  state_code text references public.india_states(code),
  city text,
  address text,
  phone text,
  email text,
  logo_path text,
  whatsapp_phone_number_id text unique,
  whatsapp_display_number text,
  quote_prefix text not null default 'Q',
  quote_seq integer not null default 0,
  order_seq integer not null default 0,
  fit_weights jsonb not null default '{
    "category_match": 25,
    "geographic_coverage": 20,
    "brands_carried": 15,
    "retail_network": 15,
    "logistics": 10,
    "territory_availability": 10,
    "company_size": 5
  }'::jsonb,
  fit_config_version integer not null default 1,
  settings jsonb not null default '{
    "daily_outbound_cap": 500,
    "approval_expiry_hours": 24,
    "reorder_lead_days": 5,
    "followup_cadence_days": [1, 3, 7],
    "quotation_validity_days": 15,
    "default_payment_terms": "30 days credit from invoice date",
    "shipping_note": "Ex-works. Freight as actuals.",
    "taxonomy": ["distributor", "super_stockist", "wholesaler", "dealer", "retailer", "modern_trade"],
    "industry": "FMCG"
  }'::jsonb,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  manufacturer_id uuid references public.manufacturers(id) on delete cascade,
  role public.app_role not null,
  full_name text,
  phone text,
  email text,
  -- null means no limit (owners); reps default to 0
  approval_limit_paise bigint check (approval_limit_paise is null or approval_limit_paise >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_tenant_required check (role = 'ops_admin' or manufacturer_id is not null)
);
create index on public.profiles (manufacturer_id);

-- ---------------------------------------------------------------------------
-- Company Brain
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  product_id uuid,
  storage_path text not null,
  title text,
  mime_type text,
  kind text not null default 'catalogue' check (kind in ('catalogue', 'certificate', 'price_list', 'brochure', 'other')),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'extracting', 'review', 'confirmed', 'indexing', 'indexed', 'failed')),
  extracted jsonb,
  error text,
  approved_for_sharing boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.documents (manufacturer_id, status);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  name text not null,
  sku text not null,
  category text,
  description text,
  specs jsonb not null default '{}'::jsonb,
  unit text not null default 'unit',
  mrp_paise bigint check (mrp_paise is null or mrp_paise >= 0),
  distributor_price_paise bigint check (distributor_price_paise is null or distributor_price_paise >= 0),
  cost_paise bigint check (cost_paise is null or cost_paise >= 0),
  moq integer not null default 1 check (moq >= 1),
  hsn_code text,
  gst_rate numeric(5, 2) not null default 18 check (gst_rate in (0, 0.25, 3, 5, 12, 18, 28, 40)),
  image_paths text[] not null default '{}',
  certifications text[] not null default '{}',
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  source_document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manufacturer_id, sku)
);
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

alter table public.documents
  add constraint documents_product_fk foreign key (product_id) references public.products(id) on delete set null;

-- Tiered by quantity. floor_price_paise is what the AI may offer on its own;
-- hard_minimum_paise is the lowest a human may approve.
create table public.discount_rules (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  qty_from integer not null check (qty_from >= 1),
  floor_price_paise bigint not null check (floor_price_paise > 0),
  hard_minimum_paise bigint not null check (hard_minimum_paise > 0),
  max_discount_pct numeric(5, 2) check (max_discount_pct is null or (max_discount_pct >= 0 and max_discount_pct <= 90)),
  payment_terms text,
  max_credit_paise bigint check (max_credit_paise is null or max_credit_paise >= 0),
  created_at timestamptz not null default now(),
  unique (product_id, qty_from),
  constraint hard_minimum_below_floor check (hard_minimum_paise <= floor_price_paise)
);

create table public.autonomy_policies (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  action_type text not null,
  tier public.autonomy_tier not null,
  threshold_paise bigint,
  description text,
  updated_at timestamptz not null default now(),
  unique (manufacturer_id, action_type)
);

create table public.territories (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  name text not null,
  state text,
  cities text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'covered', 'exclusive')),
  distributor_prospect_id uuid,
  created_at timestamptz not null default now()
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  content text not null,
  embedding extensions.vector(384),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index knowledge_chunks_embedding_idx on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);
create index on public.knowledge_chunks (manufacturer_id, product_id);

create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  version integer not null,
  system_prompt text not null,
  model text,
  active boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique (agent, version)
);
create unique index prompt_versions_one_active on public.prompt_versions (agent) where active;

-- ---------------------------------------------------------------------------
-- Market
-- ---------------------------------------------------------------------------
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  adapter text not null,
  lawful_basis text,
  terms_note text,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  name text not null,
  product_ids uuid[] not null default '{}',
  objective_text text not null,
  parsed_intent jsonb not null default '{}'::jsonb,
  target_geo jsonb not null default '{}'::jsonb,
  target_city text,
  target_state text,
  target_category text,
  target_count integer not null default 75 check (target_count between 1 and 500),
  status public.campaign_status not null default 'draft',
  status_detail text,
  stalled_step text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  launched_at timestamptz
);
create index on public.campaigns (manufacturer_id, created_at desc);

-- One row per pipeline step and source, so a stalled campaign can report
-- exactly which step stalled.
create table public.campaign_jobs (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step text not null,
  source_id uuid references public.sources(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  records integer not null default 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, step, source_id)
);

create table public.raw_records (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_id uuid not null references public.sources(id),
  external_id text not null,
  payload jsonb not null,
  status text not null default 'new'
    check (status in ('new', 'normalized', 'merged', 'duplicate_review', 'rejected', 'error')),
  prospect_id uuid,
  error text,
  created_at timestamptz not null default now(),
  unique (campaign_id, source_id, external_id)
);
create index on public.raw_records (campaign_id, status);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  name text not null,
  normalized_name text,
  type text not null default 'distributor'
    check (type in ('distributor', 'super_stockist', 'wholesaler', 'dealer', 'retailer', 'modern_trade', 'other')),
  category text,
  category_confidence numeric(4, 3),
  address text,
  city text,
  state text,
  pincode text,
  geo extensions.geography(point, 4326),
  gstin text,
  website text,
  source_id uuid references public.sources(id) on delete set null,
  source_url text,
  confidence text not null default 'inferred' check (confidence in ('verified', 'inferred')),
  signals jsonb not null default '{}'::jsonb,
  fit_score numeric(5, 2),
  fit_breakdown jsonb not null default '[]'::jsonb,
  fit_config_version integer,
  research jsonb not null default '{}'::jsonb,
  qualification jsonb not null default '{}'::jsonb,
  pipeline_step text not null default 'classify'
    check (pipeline_step in ('classify', 'research', 'score', 'done')),
  needs_ops_attention text,
  review_status public.review_status not null default 'pending',
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  stage public.prospect_stage not null default 'new',
  stage_changed_at timestamptz not null default now(),
  assigned_rep_id uuid references auth.users(id) on delete set null,
  outreach_approved boolean not null default false,
  outreach_approved_at timestamptz,
  ref_code text unique default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  is_customer boolean not null default false,
  is_stale boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prospects_name_trgm on public.prospects using gin (normalized_name extensions.gin_trgm_ops);
create index prospects_geo_gist on public.prospects using gist (geo);
create index on public.prospects (manufacturer_id, review_status, stage);
create index on public.prospects (campaign_id);
create index on public.prospects (assigned_rep_id);
create trigger prospects_touch before update on public.prospects
  for each row execute function public.touch_updated_at();

alter table public.raw_records
  add constraint raw_records_prospect_fk foreign key (prospect_id) references public.prospects(id) on delete set null;
alter table public.territories
  add constraint territories_distributor_fk foreign key (distributor_prospect_id) references public.prospects(id) on delete set null;

-- Gray zone dedupe matches (similarity 0.6 to 0.85) wait here for ops.
create table public.merge_candidates (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  raw_record_id uuid not null references public.raw_records(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  similarity numeric(4, 3) not null,
  status text not null default 'pending' check (status in ('pending', 'merged', 'distinct')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (raw_record_id, prospect_id)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  name text,
  role text,
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text,
  is_primary boolean not null default false,
  erased_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.contacts (prospect_id);
create unique index contacts_tenant_phone on public.contacts (manufacturer_id, phone_e164) where phone_e164 is not null;

create table public.prospect_events (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  kind text not null check (kind in ('stage_change', 'note', 'call_log', 'assignment', 'system', 'review')),
  from_stage public.prospect_stage,
  to_stage public.prospect_stage,
  body text,
  data jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  client_ts timestamptz,
  created_at timestamptz not null default now()
);
create index on public.prospect_events (prospect_id, created_at desc);

-- Allowed pipeline transitions (set_stage validates against this).
create table public.stage_transitions (
  from_stage public.prospect_stage not null,
  to_stage public.prospect_stage not null,
  primary key (from_stage, to_stage)
);
insert into public.stage_transitions (from_stage, to_stage) values
  ('new', 'contacted'), ('new', 'engaged'), ('new', 'lost'),
  ('contacted', 'engaged'), ('contacted', 'lost'),
  ('engaged', 'qualified'), ('engaged', 'contacted'), ('engaged', 'lost'),
  ('qualified', 'negotiating'), ('qualified', 'quoted'), ('qualified', 'engaged'), ('qualified', 'lost'),
  ('negotiating', 'quoted'), ('negotiating', 'qualified'), ('negotiating', 'lost'),
  ('quoted', 'first_order'), ('quoted', 'negotiating'), ('quoted', 'lost'),
  ('first_order', 'repeat_order'), ('first_order', 'lost'),
  ('repeat_order', 'lost'),
  ('lost', 'contacted'), ('lost', 'engaged');

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel public.channel not null default 'whatsapp',
  status public.consent_status not null default 'none',
  source text,
  evidence jsonb not null default '{}'::jsonb,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  unique (contact_id, channel)
);

-- Append only history of every consent change (DPDP evidence trail).
create table public.consent_events (
  id bigint generated always as identity primary key,
  manufacturer_id uuid not null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel public.channel not null,
  from_status public.consent_status,
  to_status public.consent_status not null,
  source text,
  evidence jsonb,
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel public.channel not null default 'whatsapp',
  window_expires_at timestamptz,
  ai_paused boolean not null default false,
  paused_reason text,
  paused_by uuid references auth.users(id) on delete set null,
  paused_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_message_preview text,
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (contact_id, channel)
);
create index on public.conversations (manufacturer_id, last_inbound_at desc);
create index on public.conversations (prospect_id);

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid references public.manufacturers(id) on delete cascade,
  name text not null,
  language text not null default 'en',
  category text not null default 'utility' check (category in ('marketing', 'utility', 'authentication')),
  body text not null,
  variables text[] not null default '{}',
  purpose text,
  meta_status public.template_status not null default 'draft',
  meta_template_id text,
  rejection_reason text,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (manufacturer_id, name, language)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction public.message_direction not null,
  body text,
  media_path text,
  media_type text check (media_type is null or media_type in ('image', 'document', 'audio', 'video')),
  media_mime text,
  media_filename text,
  template_id uuid references public.message_templates(id) on delete set null,
  template_params jsonb,
  provider_message_id text unique,
  status public.message_status not null,
  actor public.message_actor not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  ai_action_id uuid,
  turn_id uuid,
  idempotency_key text unique,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz
);
create index on public.messages (conversation_id, created_at);
create index on public.messages (manufacturer_id, direction, created_at);

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  due_at timestamptz not null,
  reason text not null,
  attempt integer not null default 1,
  status public.followup_status not null default 'pending',
  created_by text not null default 'ai' check (created_by in ('ai', 'rep', 'system')),
  created_at timestamptz not null default now()
);
create index followups_due on public.followups (due_at) where status = 'pending';

-- One row per AI turn; the unique trigger message makes a replayed webhook
-- create exactly one turn.
create table public.ai_turns (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  trigger_message_id uuid unique references public.messages(id) on delete set null,
  reason text not null default 'inbound_message',
  context jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'skipped')),
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index on public.ai_turns (conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------
create table public.negotiations (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  product_id uuid not null references public.products(id),
  qty integer not null check (qty >= 1),
  status public.negotiation_status not null default 'open',
  agreed_price_paise bigint,
  last_floor_paise bigint,
  payment_terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.negotiations (prospect_id);
create trigger negotiations_touch before update on public.negotiations
  for each row execute function public.touch_updated_at();

create table public.negotiation_offers (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  negotiation_id uuid not null references public.negotiations(id) on delete cascade,
  by_party text not null check (by_party in ('buyer', 'ai', 'manufacturer')),
  price_paise bigint not null,
  qty integer not null,
  decision public.offer_decision not null,
  counter_paise bigint,
  rule_snapshot jsonb not null default '{}'::jsonb,
  turn_id uuid,
  created_at timestamptz not null default now()
);
create index on public.negotiation_offers (negotiation_id, created_at);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  negotiation_id uuid references public.negotiations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  number text not null,
  version integer not null default 1,
  lines jsonb not null,
  subtotal_paise bigint not null,
  tax_paise bigint not null,
  shipping_paise bigint not null default 0,
  total_paise bigint not null,
  tax_mode text not null check (tax_mode in ('intra', 'inter')),
  payment_terms text,
  notes text,
  valid_until date not null,
  pdf_path text,
  status public.quotation_status not null default 'draft',
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (manufacturer_id, number, version)
);
create index on public.quotations (prospect_id, created_at desc);

create table public.human_approvals (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  negotiation_id uuid references public.negotiations(id) on delete cascade,
  quotation_id uuid references public.quotations(id) on delete set null,
  prospect_id uuid references public.prospects(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  kind public.approval_kind not null,
  requested_paise bigint,
  permitted_paise bigint,
  hard_minimum_paise bigint,
  qty integer,
  deal_value_paise bigint,
  approved_price_paise bigint,
  counter_paise bigint,
  ai_recommendation text,
  summary text,
  context jsonb not null default '{}'::jsonb,
  status public.approval_status not null default 'pending',
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  expires_at timestamptz not null,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index human_approvals_pending on public.human_approvals (manufacturer_id, expires_at) where status = 'pending';
create unique index human_approvals_one_pending_price on public.human_approvals (negotiation_id)
  where status = 'pending' and kind = 'price_below_floor';

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  quotation_id uuid references public.quotations(id) on delete set null,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  file_path text not null,
  mime_type text,
  parsed jsonb,
  field_confidence jsonb,
  confidence numeric(4, 3),
  match_status public.po_match_status not null default 'pending',
  diffs jsonb not null default '[]'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'parsing', 'parsed', 'failed', 'confirmed', 'rejected')),
  error text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (message_id)
);
create index on public.purchase_orders (manufacturer_id, match_status);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  quotation_id uuid references public.quotations(id) on delete set null,
  po_id uuid unique references public.purchase_orders(id) on delete set null,
  number text not null,
  status public.order_status not null default 'confirmed',
  total_paise bigint not null,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  override_reason text,
  ordered_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (manufacturer_id, number)
);
create index on public.orders (prospect_id, ordered_on);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty integer not null check (qty > 0),
  unit_price_paise bigint not null,
  tax_paise bigint not null default 0,
  line_total_paise bigint not null
);
create index on public.order_items (order_id);
create index on public.order_items (product_id);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.shipment_status not null default 'pending',
  carrier text,
  tracking_ref text,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.payment_status not null default 'due',
  amount_paise bigint not null,
  due_date date,
  paid_at timestamptz,
  reference text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.reorder_predictions (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  order_count integer not null,
  last_order_date date not null,
  avg_gap_days numeric(8, 2) not null,
  predicted_date date not null,
  confidence numeric(4, 3) not null,
  status public.reorder_status not null default 'upcoming',
  notified_for date,
  updated_at timestamptz not null default now(),
  unique (prospect_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------
create table public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid references public.manufacturers(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  prospect_id uuid references public.prospects(id) on delete set null,
  turn_id uuid,
  agent text not null,
  action_type text not null,
  input jsonb,
  output jsonb,
  rule_checked text,
  outcome text,
  model text,
  prompt_version integer,
  latency_ms integer,
  flagged boolean not null default false,
  flag_reason text,
  flagged_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.ai_actions (conversation_id, created_at);
create index on public.ai_actions (manufacturer_id, created_at desc);
create index on public.ai_actions (turn_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid references public.manufacturers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  data jsonb not null default '{}'::jsonb,
  channels text[] not null default '{in_app}',
  dedupe_key text,
  read_at timestamptz,
  pushed_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index on public.notifications (user_id, created_at desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  manufacturer_id uuid,
  actor_id uuid,
  actor_role text,
  action text not null,
  entity text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log (manufacturer_id, created_at desc);

create table public.product_events (
  id bigint generated always as identity primary key,
  manufacturer_id uuid references public.manufacturers(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Retry safety for client mutations (offline rep queue).
create table public.idempotency_keys (
  key text primary key,
  user_id uuid,
  rpc text not null,
  result jsonb,
  created_at timestamptz not null default now()
);

-- Phase 2: created empty, unused in MVP.
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  transcript text,
  extracted_fields jsonb,
  recording_path text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- Messages are an immutable log: only delivery fields may change, except
-- during an audited DPDP erasure.
create or replace function public.messages_immutable()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.erasing', true), '') = 'on' then
    return new;
  end if;
  if new.body is distinct from old.body
     or new.direction is distinct from old.direction
     or new.conversation_id is distinct from old.conversation_id
     or new.actor is distinct from old.actor
     or new.media_path is distinct from old.media_path
     or new.template_id is distinct from old.template_id
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'P0001', message = 'message_immutable',
      detail = 'Messages cannot be edited once stored';
  end if;
  return new;
end
$$;
create trigger messages_immutable before update on public.messages
  for each row execute function public.messages_immutable();

create or replace function public.messages_no_delete()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.erasing', true), '') = 'on' then
    return old;
  end if;
  raise exception using errcode = 'P0001', message = 'message_immutable', detail = 'Messages cannot be deleted';
end
$$;
create trigger messages_no_delete before delete on public.messages
  for each row execute function public.messages_no_delete();

-- Consent history
create or replace function public.consents_history()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.consent_events (manufacturer_id, contact_id, channel, from_status, to_status, source, evidence)
    values (new.manufacturer_id, new.contact_id, new.channel,
            case when tg_op = 'UPDATE' then old.status end, new.status, new.source, new.evidence);
  end if;
  return new;
end
$$;
create trigger consents_history after insert or update on public.consents
  for each row execute function public.consents_history();

-- Child rows must belong to the same tenant as their parent prospect.
create or replace function public.enforce_prospect_tenant()
returns trigger
language plpgsql
as $$
declare
  v_mid uuid;
begin
  select manufacturer_id into v_mid from public.prospects where id = new.prospect_id;
  if v_mid is distinct from new.manufacturer_id then
    raise exception using errcode = 'P0001', message = 'tenant_mismatch',
      detail = 'Row tenant does not match prospect tenant';
  end if;
  return new;
end
$$;
create trigger contacts_tenant before insert or update of prospect_id, manufacturer_id on public.contacts
  for each row execute function public.enforce_prospect_tenant();
create trigger conversations_tenant before insert or update of prospect_id, manufacturer_id on public.conversations
  for each row execute function public.enforce_prospect_tenant();
create trigger negotiations_tenant before insert or update of prospect_id, manufacturer_id on public.negotiations
  for each row execute function public.enforce_prospect_tenant();
create trigger quotations_tenant before insert or update of prospect_id, manufacturer_id on public.quotations
  for each row execute function public.enforce_prospect_tenant();
create trigger orders_tenant before insert or update of prospect_id, manufacturer_id on public.orders
  for each row execute function public.enforce_prospect_tenant();

create or replace function public.discount_rules_tenant()
returns trigger
language plpgsql
as $$
declare
  v_mid uuid;
begin
  select manufacturer_id into v_mid from public.products where id = new.product_id;
  if v_mid is distinct from new.manufacturer_id then
    raise exception using errcode = 'P0001', message = 'tenant_mismatch', detail = 'Rule tenant does not match product';
  end if;
  return new;
end
$$;
create trigger discount_rules_tenant before insert or update on public.discount_rules
  for each row execute function public.discount_rules_tenant();
