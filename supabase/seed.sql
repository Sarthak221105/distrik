-- Local development seed. Runs after migrations on `supabase db reset`.
-- Test credentials (local only, never used outside this database):
--   every demo user signs in with password  Password123!
--   or phone OTP 123456 (numbers in supabase/config.toml [auth.sms.test_otp])
--
--   owner@shakti.test   owner       Shakti Foods (Indore)
--   head@shakti.test    sales_head  approval limit ₹5,00,000
--   rep@shakti.test     rep
--   rep2@shakti.test    rep
--   admin@platform.test system_admin (technical platform maintenance only; no buyer data)
--   owner@kaveri.test   owner       Kaveri Home Care (second tenant, isolation tests)

select setseed(0.42);

-- ---------------------------------------------------------------------------
-- Vault: how pg_cron reaches Edge Functions inside the local Docker network.
-- ---------------------------------------------------------------------------
select vault.create_secret('http://supabase_kong_distrik:8000', 'project_url', 'Local API gateway for pg_net');
select vault.create_secret('local-dev-worker-secret-change-me', 'worker_secret', 'Shared secret for pg_cron workers');

-- Enable the synthetic directory locally so campaigns find buyers end to end.
update public.sources set enabled = true where adapter = 'demo_directory';

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------
insert into public.manufacturers (id, name, legal_name, gstin, state, city, address, phone, email,
  whatsapp_phone_number_id, whatsapp_display_number, quote_prefix)
values
  ('11111111-1111-4111-8111-111111111111', 'Shakti Foods', 'Shakti Masala & Foods Pvt Ltd', '23AABCS1234F1Z5',
   'Madhya Pradesh', 'Indore', 'Plot 14, Sector F, Sanwer Road Industrial Area, Indore 452015', '+919826000000',
   'sales@shakti.test', 'sandbox-shakti-001', '+91 98260 00000', 'SF'),
  ('22222222-2222-4222-8222-222222222222', 'Kaveri Home Care', 'Kaveri Home Care LLP', '29AAKFK5678L1Z2',
   'Karnataka', 'Bengaluru', 'Peenya Industrial Area, Bengaluru 560058', '+918040000000',
   'sales@kaveri.test', 'sandbox-kaveri-001', '+91 80400 00000', 'KH');

-- ---------------------------------------------------------------------------
-- Users (auth.users + identities) and profiles
-- ---------------------------------------------------------------------------
do $$
declare
  u record;
begin
  for u in select * from (values
    ('a0000000-0000-4000-8000-000000000001'::uuid, 'owner@shakti.test', '919800000001', 'Anita Sharma'),
    ('a0000000-0000-4000-8000-000000000002'::uuid, 'head@shakti.test', '919800000002', 'Vikram Joshi'),
    ('a0000000-0000-4000-8000-000000000003'::uuid, 'rep@shakti.test', '919800000003', 'Ravi Patel'),
    ('a0000000-0000-4000-8000-000000000004'::uuid, 'admin@platform.test', '919800000004', 'Meera Iyer'),
    ('a0000000-0000-4000-8000-000000000005'::uuid, 'rep2@shakti.test', null, 'Sunil Yadav'),
    ('a0000000-0000-4000-8000-000000000006'::uuid, 'owner@kaveri.test', null, 'Kiran Rao')
  ) as t(id, email, phone, full_name)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, phone,
      phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), u.phone,
      case when u.phone is not null then now() end,
      '{"provider":"email","providers":["email","phone"]}', jsonb_build_object('full_name', u.full_name),
      now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now());
    if u.phone is not null then
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), u.id, u.phone,
        jsonb_build_object('sub', u.id::text, 'phone', u.phone, 'phone_verified', true), 'phone', now(), now(), now());
    end if;
  end loop;
end
$$;

insert into public.profiles (user_id, manufacturer_id, role, full_name, phone, email, approval_limit_paise) values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'owner', 'Anita Sharma', '+919800000001', 'owner@shakti.test', null),
  ('a0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'sales_head', 'Vikram Joshi', '+919800000002', 'head@shakti.test', 50000000),
  ('a0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'rep', 'Ravi Patel', '+919800000003', 'rep@shakti.test', 0),
  ('a0000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'rep', 'Sunil Yadav', null, 'rep2@shakti.test', 0),
  ('a0000000-0000-4000-8000-000000000004', null, 'system_admin', 'Meera Iyer', '+919800000004', 'admin@platform.test', null),
  ('a0000000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222', 'owner', 'Kiran Rao', null, 'owner@kaveri.test', null);

-- ---------------------------------------------------------------------------
-- Company Brain: products, tiers, territories, templates, documents
-- ---------------------------------------------------------------------------
insert into public.products (id, manufacturer_id, name, sku, category, description, specs, unit, mrp_paise,
  distributor_price_paise, cost_paise, moq, hsn_code, gst_rate, certifications) values
  ('b0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'Kachi Ghani Mustard Oil 5 L Jar', 'SKO-5L', 'edible_oil',
   'Cold pressed kachi ghani mustard oil with strong pungency, packed in a 5 litre HDPE jar.',
   '{"pack_size": "5 L", "packaging": "HDPE jar", "shelf_life_months": 9, "pungency": "high", "fssai_grade": "Agmark Grade 1"}',
   'jar', 89900, 62000, 49500, 20, '1514', 5, '{"FSSAI","Agmark"}'),
  ('b0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'Kachi Ghani Mustard Oil 1 L Bottle', 'SKO-1L', 'edible_oil',
   'Kachi ghani mustard oil in a 1 litre PET bottle, carton of 12.',
   '{"pack_size": "1 L", "packaging": "PET bottle", "units_per_carton": 12, "shelf_life_months": 9}',
   'carton of 12', 228000, 168000, 138000, 10, '1514', 5, '{"FSSAI","Agmark"}'),
  ('b0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'Garam Masala 100 g', 'SGM-100', 'spices',
   'Blend of 13 whole spices, stone ground. Carton of 60 packs.',
   '{"pack_size": "100 g", "units_per_carton": 60, "shelf_life_months": 12}',
   'carton of 60', 510000, 360000, 270000, 5, '0910', 5, '{"FSSAI"}'),
  ('b0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111',
   'Turmeric Powder 500 g', 'STP-500', 'spices',
   'Salem turmeric, curcumin above 3 percent. Carton of 24 packs.',
   '{"pack_size": "500 g", "units_per_carton": 24, "curcumin_pct": "3.2", "shelf_life_months": 12}',
   'carton of 24', 288000, 204000, 160000, 5, '0910', 5, '{"FSSAI"}'),
  ('b0000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111',
   'Kashmiri Chilli Powder 200 g', 'SCP-200', 'spices',
   'Mild heat, deep red colour. Carton of 50 packs.',
   '{"pack_size": "200 g", "units_per_carton": 50, "asta_colour": "120", "shelf_life_months": 12}',
   'carton of 50', 350000, 250000, 190000, 5, '0910', 5, '{"FSSAI"}'),
  ('b0000000-0000-4000-8000-000000000010', '22222222-2222-4222-8222-222222222222',
   'Floor Cleaner 5 L Can', 'KFC-5L', 'home_care', 'Pine floor cleaner.', '{}',
   'can', 75000, 48000, 36000, 10, '3402', 18, '{}');

insert into public.discount_rules (manufacturer_id, product_id, qty_from, floor_price_paise, hard_minimum_paise,
  max_discount_pct, payment_terms, max_credit_paise) values
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001', 20, 60000, 58000, 5, 'Advance payment', 0),
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001', 50, 55800, 54000, 12, '15 days credit from invoice date', 5000000),
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001', 200, 54500, 53000, 14, '30 days credit from invoice date', 15000000),
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000002', 10, 162000, 156000, 5, 'Advance payment', 0),
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000002', 50, 156000, 150000, 11, '15 days credit from invoice date', 5000000),
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000003', 5, 345000, 335000, 5, 'Advance payment', 0),
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000003', 25, 335000, 320000, 12, '15 days credit from invoice date', 3000000),
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000004', 5, 196000, 190000, 5, 'Advance payment', 0),
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000004', 25, 190000, 182000, 11, '15 days credit from invoice date', 3000000),
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000005', 5, 240000, 232000, 8, 'Advance payment', 0),
  ('22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000010', 10, 45000, 43000, 10, 'Advance payment', 0);

insert into public.territories (manufacturer_id, name, state, cities, status) values
  ('11111111-1111-4111-8111-111111111111', 'Indore city', 'Madhya Pradesh', '{Indore}', 'covered'),
  ('11111111-1111-4111-8111-111111111111', 'Jabalpur', 'Madhya Pradesh', '{Jabalpur}', 'exclusive'),
  ('11111111-1111-4111-8111-111111111111', 'Bhopal', 'Madhya Pradesh', '{Bhopal}', 'open'),
  ('11111111-1111-4111-8111-111111111111', 'Nagpur', 'Maharashtra', '{Nagpur}', 'open');

insert into public.message_templates (manufacturer_id, name, language, category, body, variables, purpose, meta_status, usage_count) values
  ('11111111-1111-4111-8111-111111111111', 'outreach_opener', 'en', 'marketing',
   'Namaste {{1}}, this is {{2}}. As a valued trade partner we would like to share our new {{3}} range. Reply YES for the catalogue or STOP to opt out.',
   '{name,manufacturer,product}', 'outreach_opener', 'approved', 3),
  ('11111111-1111-4111-8111-111111111111', 'followup_nudge', 'en', 'marketing',
   'Hello {{1}}, following up on {{2}} from {{3}}. Shall I share the latest price list? Reply STOP to opt out.',
   '{name,product,manufacturer}', 'followup', 'approved', 12),
  ('11111111-1111-4111-8111-111111111111', 'approval_update', 'en', 'utility',
   'Hello {{1}}, we have an update on your price request for {{2}}. Please reply to continue.',
   '{name,product}', 'approval_update', 'approved', 2),
  ('11111111-1111-4111-8111-111111111111', 'quotation_ready', 'en', 'utility',
   'Hello {{1}}, your quotation {{2}} is ready. Reply to this message to receive it.',
   '{name,quotation_number}', 'quotation', 'approved', 4),
  ('11111111-1111-4111-8111-111111111111', 'reorder_reminder', 'hi', 'utility',
   'Namaste {{1}}, aapka pichhla {{2}} order {{3}} ko aaya tha. Kya naya order book karein? Reply YES.',
   '{name,product,date}', 'reorder', 'approved', 7),
  ('11111111-1111-4111-8111-111111111111', 'festive_offer', 'en', 'marketing',
   'Diwali stock-up: special schemes on {{1}} for orders above {{2}} cartons.', '{product,qty}', 'campaign', 'submitted', 0),
  ('11111111-1111-4111-8111-111111111111', 'price_drop_alert', 'en', 'marketing',
   'Prices dropped! Buy now!!!', '{}', 'campaign', 'rejected', 0);
update public.message_templates set rejection_reason = 'Promotional content without opt out' where name = 'price_drop_alert';

insert into public.documents (id, manufacturer_id, storage_path, title, mime_type, kind, status, approved_for_sharing, extracted) values
  ('d0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111/catalogue/shakti-trade-catalogue-2026.pdf', 'Shakti trade catalogue 2026',
   'application/pdf', 'catalogue', 'indexed', true, '{"products_found": 5}'),
  ('d0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111/catalogue/fssai-licence.pdf', 'FSSAI licence', 'application/pdf',
   'certificate', 'confirmed', true, null);

insert into public.knowledge_chunks (manufacturer_id, product_id, document_id, content, metadata) values
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Kachi Ghani Mustard Oil 5 L: cold pressed from Rajasthan and MP mustard seeds, Agmark Grade 1, high pungency, 9 month shelf life, packed in tamper proof HDPE jars. Cartons are not used for 5 L jars; jars ship on pallets of 120.', '{"section":"products"}'),
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001',
   'Mustard Oil 1 L PET bottles ship in cartons of 12. Minimum order 10 cartons. Retail shelf ready shrink sleeves available for modern trade.', '{"section":"products"}'),
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001',
   'Garam Masala 100 g: blend of 13 whole spices including black cardamom, cinnamon, clove and shahi jeera, stone ground in small batches. Carton of 60. No added colour or preservatives.', '{"section":"products"}'),
  ('11111111-1111-4111-8111-111111111111', null, 'd0000000-0000-4000-8000-000000000001',
   'Delivery: dispatch within 3 working days of order confirmation from the Indore plant. Freight is charged at actuals; orders above ₹2 lakh within Madhya Pradesh ship freight free.', '{"section":"logistics"}'),
  ('11111111-1111-4111-8111-111111111111', null, 'd0000000-0000-4000-8000-000000000001',
   'Distributor support: monthly retailer schemes, POS material, and a dedicated area sales officer for distributors above 500 jars per month. Damaged stock is replaced against photos within 7 days of delivery.', '{"section":"support"}'),
  ('11111111-1111-4111-8111-111111111111', null, 'd0000000-0000-4000-8000-000000000002',
   'Shakti Masala & Foods holds FSSAI central licence 10019043001234, ISO 22000:2018 certification, and Agmark certification for mustard oil.', '{"section":"certifications"}');
select pgmq.send('embeddings', jsonb_build_object('manufacturer_id', '11111111-1111-4111-8111-111111111111', 'mode', 'missing'));

-- ---------------------------------------------------------------------------
-- Campaigns and prospects
-- ---------------------------------------------------------------------------
insert into public.campaigns (id, manufacturer_id, name, product_ids, objective_text, parsed_intent, target_geo,
  target_city, target_state, target_category, target_count, status, status_detail, created_by, created_at, ready_at, launched_at)
values
  ('c0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Bhopal · Sep 2026',
   '{b0000000-0000-4000-8000-000000000001,b0000000-0000-4000-8000-000000000002,b0000000-0000-4000-8000-000000000003}',
   'Find 75 FMCG distributors and super stockists in Bhopal who can carry our mustard oil and spices',
   '{"city":"Bhopal","state":"Madhya Pradesh","category":"edible_oil","target_count":75,"buyer_types":["distributor","super_stockist"]}',
   '{"city":"Bhopal","state":"Madhya Pradesh"}', 'Bhopal', 'Madhya Pradesh', 'edible_oil', 75, 'live',
   'Outreach running', 'a0000000-0000-4000-8000-000000000001', now() - interval '40 days', now() - interval '35 days', now() - interval '34 days'),
  ('c0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Nagpur · Oct 2026',
   '{b0000000-0000-4000-8000-000000000003,b0000000-0000-4000-8000-000000000004,b0000000-0000-4000-8000-000000000005}',
   'Get spice distributors and wholesalers in Nagpur, around 60 accounts',
   '{"city":"Nagpur","state":"Maharashtra","category":"spices","target_count":60,"buyer_types":["distributor","wholesaler"]}',
   '{"city":"Nagpur","state":"Maharashtra"}', 'Nagpur', 'Maharashtra', 'spices', 60, 'lead_review',
   'Awaiting your review', 'a0000000-0000-4000-8000-000000000001', now() - interval '3 days', null, null);

insert into public.campaign_jobs (manufacturer_id, campaign_id, step, source_id, status, records, started_at, finished_at)
select '11111111-1111-4111-8111-111111111111', c, 'ingest', (select id from public.sources where adapter = 'csv_upload'),
       'done', n, now() - interval '3 days', now() - interval '3 days'
from (values ('c0000000-0000-4000-8000-000000000001'::uuid, 26), ('c0000000-0000-4000-8000-000000000002'::uuid, 10)) v(c, n);

do $$
declare
  v_mid constant uuid := '11111111-1111-4111-8111-111111111111';
  v_src uuid := (select id from public.sources where adapter = 'csv_upload');
  v_rep1 constant uuid := 'a0000000-0000-4000-8000-000000000003';
  v_rep2 constant uuid := 'a0000000-0000-4000-8000-000000000005';
  v_names text[] := array[
    'Shree Balaji Distributors', 'Agrawal Trading Company', 'Maa Narmada Enterprises', 'Gupta Brothers FMCG',
    'Rathore Agencies', 'Jain Provision Suppliers', 'Sai Krupa Traders', 'Bhopal Super Stockist',
    'Malwa Consumer Distributors', 'Shiv Shakti Agencies', 'Kohinoor Trading Co', 'Raj Laxmi Distributors',
    'Patidar Wholesale Mart', 'New Bharat Agencies', 'Om Sai Marketing', 'Chouhan Distributors',
    'Rajdhani FMCG Point', 'Shubh Laabh Traders', 'Verma Provision Wholesale', 'Narmada Valley Foods Distribution',
    'Kushwah Brothers', 'Upper Lake Traders', 'Sharma Kirana Wholesale', 'Taj Distributors'];
  v_types text[] := array['distributor', 'distributor', 'super_stockist', 'distributor', 'wholesaler', 'wholesaler',
    'distributor', 'super_stockist', 'distributor', 'dealer', 'wholesaler', 'distributor', 'wholesaler', 'dealer',
    'distributor', 'distributor', 'retailer', 'wholesaler', 'wholesaler', 'distributor', 'dealer', 'retailer',
    'wholesaler', 'distributor'];
  v_areas text[] := array['MP Nagar', 'Hamidia Road', 'Bairagarh', 'Kolar Road', 'Ashoka Garden', 'Govindpura',
    'Arera Colony', 'Jahangirabad', 'Shahpura', 'Mandideep', 'Itwara', 'Peer Gate'];
  v_contacts text[] := array['Ramesh Agrawal', 'Sunil Gupta', 'Deepak Jain', 'Mahesh Rathore', 'Sanjay Verma',
    'Anil Chouhan', 'Rajesh Patidar', 'Vinod Sharma', 'Pradeep Kushwah', 'Ashok Malviya', 'Imran Khan', 'Naveen Soni'];
  v_brands text[] := array['Fortune, Patanjali', 'Engine, Dhara', 'MDH, Everest', 'Catch, Tata Sampann',
    'Saffola, Sundrop', 'Everest, Badshah', 'Fortune, Tata Sampann', 'Dhara, MDH'];
  i integer;
  v_id uuid;
  v_contact uuid;
  v_stage public.prospect_stage;
  v_stages public.prospect_stage[] := array['negotiating', 'quoted', 'first_order', 'repeat_order', 'quoted', 'engaged',
    'first_order', 'qualified', 'contacted', 'engaged', 'new', 'contacted', 'new', 'qualified', 'new', 'contacted',
    'new', 'new', 'lost', 'new', 'new', 'new', 'contacted', 'new']::public.prospect_stage[];
  v_rep uuid;
  v_consent public.consent_status;
begin
  for i in 1 .. array_length(v_names, 1) loop
    v_stage := v_stages[i];
    v_rep := case when i % 2 = 0 then v_rep2 else v_rep1 end;
    insert into public.prospects (manufacturer_id, campaign_id, name, normalized_name, type, category, category_confidence,
      address, city, state, pincode, geo, source_id, source_url, confidence, signals, research, qualification,
      pipeline_step, review_status, reviewed_at, stage, stage_changed_at, assigned_rep_id, outreach_approved,
      outreach_approved_at, created_at)
    values (v_mid, 'c0000000-0000-4000-8000-000000000001', v_names[i], public.normalize_business_name(v_names[i]),
      v_types[i], case when i % 3 = 0 then 'spices' else 'edible_oil' end, round((0.72 + random() * 0.27)::numeric, 3),
      (10 + i)::text || ', ' || v_areas[1 + i % 12] || ', Bhopal', 'Bhopal', 'Madhya Pradesh', '4620' || lpad((10 + i)::text, 2, '0'),
      extensions.st_setsrid(extensions.st_makepoint(77.4126 + (random() - 0.5) * 0.18, 23.2599 + (random() - 0.5) * 0.14), 4326)::extensions.geography,
      v_src, case when i % 4 <> 0 then 'https://example.com/listings/bhopal/' || i end,
      case when i % 4 <> 0 then 'verified' else 'inferred' end,
      jsonb_build_object(
        'geographic_coverage', round(random()::numeric, 2),
        'brands_carried', round((0.3 + random() * 0.7)::numeric, 2),
        'retail_network', round(random()::numeric, 2),
        'logistics', round((0.2 + random() * 0.8)::numeric, 2),
        'company_size', case when i % 5 = 0 then null else round(random()::numeric, 2) end),
      jsonb_build_object(
        'summary', v_names[i] || ' distributes packaged foods to kirana stores across ' || v_areas[1 + i % 12] || ' and nearby areas.',
        'brands_carried', v_brands[1 + i % 8],
        'estimated_scale', (array['₹2-5 Cr turnover', '₹5-10 Cr turnover', '₹10-25 Cr turnover', 'Under ₹2 Cr turnover'])[1 + i % 4],
        'retail_reach', (150 + (i * 37) % 600)::text || ' outlets',
        'decision_makers', jsonb_build_array(jsonb_build_object('name', v_contacts[1 + i % 12], 'role', 'Proprietor')),
        'reason_to_switch', 'Carries ' || split_part(v_brands[1 + i % 8], ',', 1) || ' and has asked for a regional mustard oil brand with better margins.',
        'sources', case when i % 4 <> 0 then jsonb_build_array(jsonb_build_object('url', 'https://example.com/listings/bhopal/' || i, 'label', 'Business listing')) else '[]'::jsonb end,
        'inferred', i % 4 = 0),
      case when v_stage in ('qualified', 'negotiating', 'quoted', 'first_order', 'repeat_order') then
        jsonb_build_object(
          'current_suppliers', jsonb_build_object('value', split_part(v_brands[1 + i % 8], ',', 1), 'at', now() - interval '20 days'),
          'monthly_volume', jsonb_build_object('value', (40 + i * 10)::text || ' jars', 'at', now() - interval '20 days'),
          'decision_maker', jsonb_build_object('value', v_contacts[1 + i % 12] || ' (proprietor)', 'at', now() - interval '20 days'))
        else '{}'::jsonb end,
      'done', 'approved', now() - interval '34 days', v_stage, now() - make_interval(days => (i % 9) + 1),
      case when v_stage <> 'new' or i % 3 = 0 then v_rep end,
      v_stage <> 'new' or i % 3 = 0, case when v_stage <> 'new' or i % 3 = 0 then now() - interval '34 days' end,
      now() - interval '38 days')
    returning id into v_id;

    insert into public.contacts (manufacturer_id, prospect_id, name, role, phone_e164, is_primary)
    values (v_mid, v_id, v_contacts[1 + i % 12], 'Proprietor', '+9198270' || lpad((10000 + i)::text, 5, '0'), true)
    returning id into v_contact;

    v_consent := case when v_stage in ('first_order', 'repeat_order') then 'opted_in'
                      when v_stage in ('engaged', 'qualified', 'negotiating', 'quoted') then 'engaged'
                      when v_stage = 'lost' then 'opted_out'
                      else 'none' end;
    insert into public.consents (manufacturer_id, contact_id, channel, status, source, evidence)
    values (v_mid, v_contact, 'whatsapp', v_consent,
            case v_consent when 'opted_in' then 'existing_customer_order' when 'engaged' then 'inbound_message'
                           when 'opted_out' then 'inbound_stop' else 'discovered' end,
            case when v_consent = 'none' then '{}'::jsonb else jsonb_build_object('seed', true) end);

    if v_stage <> 'new' then
      insert into public.prospect_events (manufacturer_id, prospect_id, kind, from_stage, to_stage, body, created_at)
      values (v_mid, v_id, 'stage_change', 'new', v_stage, 'Seeded history', now() - make_interval(days => (i % 9) + 1));
    end if;
    perform public.score_prospect(v_id);
  end loop;

  -- QA queue: Nagpur prospects pending review, one low confidence
  for i in 1 .. 8 loop
    insert into public.prospects (manufacturer_id, campaign_id, name, normalized_name, type, category, category_confidence,
      address, city, state, geo, source_id, confidence, signals, research, pipeline_step, review_status, attention_reason, review_flags, created_at)
    values (v_mid, 'c0000000-0000-4000-8000-000000000002',
      (array['Orange City Spices', 'Vidarbha Masala Distributors', 'Sitabuldi Traders', 'Itwari Wholesale Spices',
             'Deshmukh Agencies', 'Nagpur Food Links', 'Wardha Road Distributors', 'Mahal Kirana Supply'])[i],
      public.normalize_business_name((array['Orange City Spices', 'Vidarbha Masala Distributors', 'Sitabuldi Traders', 'Itwari Wholesale Spices',
             'Deshmukh Agencies', 'Nagpur Food Links', 'Wardha Road Distributors', 'Mahal Kirana Supply'])[i]),
      (array['distributor', 'distributor', 'wholesaler', 'wholesaler', 'dealer', 'distributor', 'distributor', 'retailer'])[i],
      'spices', case when i = 8 then 0.55 else round((0.75 + random() * 0.2)::numeric, 3) end,
      (20 + i)::text || ', Itwari, Nagpur', 'Nagpur', 'Maharashtra',
      extensions.st_setsrid(extensions.st_makepoint(79.0882 + (random() - 0.5) * 0.16, 21.1458 + (random() - 0.5) * 0.12), 4326)::extensions.geography,
      v_src, case when i % 3 = 0 then 'inferred' else 'verified' end,
      jsonb_build_object('geographic_coverage', round(random()::numeric, 2), 'brands_carried', round(random()::numeric, 2),
                         'retail_network', round(random()::numeric, 2), 'logistics', round(random()::numeric, 2)),
      jsonb_build_object('summary', 'Spice wholesaler in Nagpur serving Vidarbha retailers.', 'brands_carried', 'MDH, Everest',
                         'inferred', i % 3 = 0),
      'done', case when i = 8 then 'needs_review' else 'pending' end::public.review_status,
      case when i = 8 then 'Low classification confidence (0.55): may be a retailer, not a distributor' end,
      case when i = 8 then array['low_classification_confidence'] else '{}'::text[] end,
      now() - interval '2 days')
    returning id into v_id;
    insert into public.contacts (manufacturer_id, prospect_id, name, role, phone_e164, is_primary)
    values (v_mid, v_id, (array['Prakash Deshmukh', 'Nitin Wankhede', 'Sachin Bawane', 'Amol Thakre'])[1 + i % 4], 'Owner',
            '+9198220' || lpad((20000 + i)::text, 5, '0'), true)
    returning id into v_contact;
    insert into public.consents (manufacturer_id, contact_id, channel, status, source) values (v_mid, v_contact, 'whatsapp', 'none', 'discovered');
    perform public.score_prospect(v_id);
  end loop;
end
$$;

-- A gray zone duplicate flagged for the manufacturer's own Lead Review.
insert into public.raw_records (id, manufacturer_id, campaign_id, source_id, external_id, payload, status)
values ('e0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000002',
  (select id from public.sources where adapter = 'csv_upload'), 'nagpur-dup-1',
  '{"name": "Orange City Spice Co", "phone": "98220 99999", "address": "21, Itwari Main Road, Nagpur", "city": "Nagpur", "state": "Maharashtra", "type": "distributor", "category_hint": "spices", "signals": {"geographic_coverage": 0.6, "brands_carried": 0.5}}',
  'new');
do $$
declare
  v_new uuid := public.create_prospect_from_raw('e0000000-0000-4000-8000-000000000001');
  v_existing uuid := (select id from public.prospects where name = 'Orange City Spices');
begin
  update public.prospects
  set review_flags = array['possible_duplicate'], review_status = 'needs_review',
      attention_reason = 'Possible duplicate of Orange City Spices (74% similar)', category = 'spices',
      category_confidence = 0.8, research = research || '{"summary": "Spice wholesaler near Itwari market.", "inferred": true}'
  where id = v_new;
  perform public.score_prospect(v_new);
  insert into public.merge_candidates (manufacturer_id, campaign_id, raw_record_id, prospect_id, candidate_prospect_id, similarity)
  values ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000002',
          'e0000000-0000-4000-8000-000000000001', v_existing, v_new, 0.74);
end
$$;

-- ---------------------------------------------------------------------------
-- Conversations, negotiation, approvals, quotation, PO, orders
-- ---------------------------------------------------------------------------
do $$
declare
  v_mid constant uuid := '11111111-1111-4111-8111-111111111111';
  v_oil5 constant uuid := 'b0000000-0000-4000-8000-000000000001';
  v_oil1 constant uuid := 'b0000000-0000-4000-8000-000000000002';
  v_masala constant uuid := 'b0000000-0000-4000-8000-000000000003';
  v_turmeric constant uuid := 'b0000000-0000-4000-8000-000000000004';
  p record;
  v_conv uuid;
  v_neg uuid;
  v_turn uuid;
  v_quote uuid;
  v_po uuid;
  v_order uuid;
  v_res record;
  v_msgs jsonb;
  m jsonb;
  v_n integer := 0;
  v_days integer;
  v_d date;
  k integer;
begin
  for p in
    select pr.*, c.id as contact_id from public.prospects pr
    join public.contacts c on c.prospect_id = pr.id and c.is_primary
    where pr.manufacturer_id = v_mid and pr.campaign_id = 'c0000000-0000-4000-8000-000000000001'
      and pr.stage in ('engaged', 'qualified', 'negotiating', 'quoted', 'first_order', 'repeat_order')
    order by pr.created_at, pr.name
  loop
    v_n := v_n + 1;
    insert into public.conversations (manufacturer_id, prospect_id, contact_id, channel, window_expires_at,
      last_inbound_at, last_outbound_at, unread_count)
    values (v_mid, p.id, p.contact_id, 'whatsapp',
      case when p.stage in ('negotiating', 'quoted', 'engaged') then now() + interval '20 hours' else now() - interval '2 days' end,
      now() - interval '4 hours', now() - interval '3 hours', case when p.stage = 'negotiating' then 1 else 0 end)
    returning id into v_conv;

    v_msgs := case p.name
      when 'Shree Balaji Distributors' then '[
        ["buyer","Namaste, aapke mustard oil ka rate kya hai 5 litre jar ka?", 300],
        ["ai","Namaste Ji! Kachi Ghani Mustard Oil 5 L jar hamara best seller hai. Kitne jar chahiye aapko? Quantity ke hisaab se best rate bataunga.", 295],
        ["buyer","100 jar chahiye har mahine. Fortune wale 540 me de rahe hain", 240],
        ["ai","Samajh gaya. 100 jar ke liye abhi hamara best price ₹558 per jar hai. ₹540 ke liye main team se check karta hoon, thodi der me confirm karta hoon.", 238]
      ]'::jsonb
      when 'Agrawal Trading Company' then '[
        ["buyer","Hello, please share price for mustard oil 5L, 60 jars", 2900],
        ["ai","Hello! For 60 jars of Kachi Ghani Mustard Oil 5 L our price is ₹558 per jar with 15 days credit. Shall I send the quotation?", 2895],
        ["buyer","Ok send quotation", 2880],
        ["ai","Done! Quotation SF/2026/0001 is on its way as a PDF. Please send your PO once you are ready.", 2878],
        ["buyer","PO attached", 300]
      ]'::jsonb
      when 'Jain Provision Suppliers' then '[
        ["buyer","Hum 60 din ka credit chahte hain, aur pichhli baar delivery late thi", 400],
        ["ai","Aapki baat samajh gaya. Credit terms aur delivery issue ke liye hamare sales head aapse seedha baat karenge.", 398]
      ]'::jsonb
      else '[
        ["buyer","Catalogue bhejiye", 4000],
        ["ai","Ji zaroor! Hamara trade catalogue bhej raha hoon. Aap kaun se products rakhte hain abhi?", 3995],
        ["buyer","Engine aur Dhara rakhte hain, garam masala bhi chahiye", 3900],
        ["ai","Badhiya! Hamara Garam Masala 13 whole spices se stone ground hai. Aapka monthly volume kitna rehta hai?", 3895]
      ]'::jsonb end;

    for m in select * from jsonb_array_elements(v_msgs) loop
      insert into public.messages (manufacturer_id, conversation_id, direction, body, provider_message_id, status, actor,
                                   created_at, sent_at, delivered_at, read_at)
      values (v_mid, v_conv,
        case when m ->> 0 = 'buyer' then 'inbound' else 'outbound' end::public.message_direction,
        m ->> 1, 'seed-' || v_conv || '-' || (m ->> 2),
        case when m ->> 0 = 'buyer' then 'received' else 'read' end::public.message_status,
        (m ->> 0)::public.message_actor,
        now() - make_interval(mins => (m ->> 2)::integer),
        case when m ->> 0 = 'ai' then now() - make_interval(mins => (m ->> 2)::integer) end,
        case when m ->> 0 = 'ai' then now() - make_interval(mins => (m ->> 2)::integer - 1) end,
        case when m ->> 0 = 'ai' then now() - make_interval(mins => (m ->> 2)::integer - 2) end);
    end loop;
    update public.conversations c set last_message_preview = (
      select left(body, 140) from public.messages where conversation_id = c.id order by created_at desc limit 1)
    where c.id = v_conv;

    -- AI audit trail for each AI turn
    insert into public.ai_turns (manufacturer_id, conversation_id, reason, status, attempts, created_at, completed_at)
    values (v_mid, v_conv, 'inbound_message', 'done', 1, now() - interval '4 hours', now() - interval '4 hours')
    returning id into v_turn;
    insert into public.ai_actions (manufacturer_id, conversation_id, prospect_id, turn_id, agent, action_type, input, output,
                                   rule_checked, outcome, model, prompt_version, latency_ms, created_at)
    values
      (v_mid, v_conv, p.id, v_turn, 'sales_agent', 'get_product_facts', '{"product_sku":"SKO-5L"}',
       '{"found":true}', null, 'ok', 'claude-sonnet-5-5', 1, 820, now() - interval '4 hours'),
      (v_mid, v_conv, p.id, v_turn, 'sales_agent', 'reply', '{}', '{"validated":true}', 'price_validator', 'sent',
       'claude-sonnet-5-5', 1, 2400, now() - interval '4 hours');

    if p.name = 'Shree Balaji Distributors' then
      v_neg := public.open_negotiation(v_conv, v_oil5, 100);
      select * into v_res from public.negotiate_offer(v_neg, 54000, 100, 'buyer', v_turn);
      insert into public.ai_actions (manufacturer_id, conversation_id, prospect_id, turn_id, agent, action_type, input, output,
                                     rule_checked, outcome, model, prompt_version)
      values (v_mid, v_conv, p.id, v_turn, 'sales_agent', 'propose_price',
              jsonb_build_object('product_sku', 'SKO-5L', 'qty', 100, 'requested_price', 540),
              jsonb_build_object('decision', v_res.decision, 'floor_paise', v_res.floor_paise, 'approval_id', v_res.approval_id),
              'evaluate_offer', v_res.decision, 'claude-sonnet-5-5', 1),
             (v_mid, v_conv, p.id, v_turn, 'sales_agent', 'request_approval', jsonb_build_object('approval_id', v_res.approval_id),
              '{}', 'autonomy_policy:price_below_floor', 'pending', 'claude-sonnet-5-5', 1);
      update public.human_approvals set ai_recommendation =
        'Approve at ₹540: 100 jars a month is 2× our average Bhopal account, the buyer currently stocks Fortune, and margin stays at 8.3%. Alternatively counter at ₹550.'
      where id = v_res.approval_id;
    elsif p.name = 'Agrawal Trading Company' then
      v_neg := public.open_negotiation(v_conv, v_oil5, 60);
      select * into v_res from public.negotiate_offer(v_neg, 55800, 60, 'buyer', v_turn);
      v_quote := (public.settle_negotiation(v_neg, 55800, 60, v_turn) ->> 'quotation_id')::uuid;
      update public.quotations set status = 'sent', sent_at = now() - interval '2 days',
        pdf_path = v_mid || '/' || replace(number, '/', '-') || '-v1.pdf'
      where id = v_quote;
      insert into public.purchase_orders (manufacturer_id, quotation_id, prospect_id, file_path, mime_type, parsed,
        field_confidence, confidence, status)
      values (v_mid, v_quote, p.id, 'purchase-orders/' || v_mid || '/agrawal-po-4471.pdf', 'application/pdf',
        jsonb_build_object('po_number', 'ATC/PO/4471', 'po_date', to_char(now() - interval '5 hours', 'YYYY-MM-DD'),
          'buyer_name', 'Agrawal Trading Company', 'buyer_gstin', '23AAKPA1234B1Z9',
          'delivery_address', '12, Hamidia Road, Bhopal 462001',
          'lines', jsonb_build_array(jsonb_build_object('sku', 'SKO-5L', 'description', 'Kachi Ghani Mustard Oil 5 L Jar',
            'qty', 60, 'unit_price_paise', 55800)),
          'subtotal_paise', 3348000, 'tax_paise', 167400, 'total_paise', 3515400),
        '{"po_number":0.98,"lines":0.95,"qty":0.97,"unit_price":0.96,"total":0.94}', 0.95, 'parsed')
      returning id into v_po;
      perform public.match_purchase_order(v_po);
    elsif p.name = 'Rathore Agencies' then
      v_neg := public.open_negotiation(v_conv, v_masala, 30);
      v_quote := (public.settle_negotiation(v_neg, 335000, 30, v_turn) ->> 'quotation_id')::uuid;
      update public.quotations set status = 'sent', sent_at = now() - interval '3 days',
        pdf_path = v_mid || '/' || replace(number, '/', '-') || '-v1.pdf'
      where id = v_quote;
      insert into public.purchase_orders (manufacturer_id, quotation_id, prospect_id, file_path, mime_type, parsed,
        field_confidence, confidence, status)
      values (v_mid, v_quote, p.id, 'purchase-orders/' || v_mid || '/rathore-po-0912.pdf', 'application/pdf',
        jsonb_build_object('po_number', 'RA-0912', 'po_date', to_char(now() - interval '1 day', 'YYYY-MM-DD'),
          'buyer_name', 'Rathore Agencies', 'delivery_address', 'Govindpura, Bhopal',
          'lines', jsonb_build_array(jsonb_build_object('sku', 'SGM-100', 'description', 'Garam Masala 100g carton',
            'qty', 36, 'unit_price_paise', 320000)),
          'total_paise', 12096000),
        '{"po_number":0.93,"lines":0.9,"qty":0.92,"unit_price":0.9,"total":0.88}', 0.9, 'parsed')
      returning id into v_po;
      perform public.match_purchase_order(v_po);
    elsif p.name = 'Jain Provision Suppliers' then
      update public.conversations set ai_paused = true, paused_reason = 'Buyer asked for 60 day credit and raised a delivery complaint',
        paused_at = now() - interval '6 hours' where id = v_conv;
      insert into public.ai_actions (manufacturer_id, conversation_id, prospect_id, turn_id, agent, action_type, input, output,
                                     rule_checked, outcome, model, prompt_version)
      values (v_mid, v_conv, p.id, v_turn, 'sales_agent', 'escalate_to_human',
              '{"reason":"Credit beyond policy and delivery complaint"}', '{}', 'forced_escalation', 'escalated', 'claude-sonnet-5-5', 1);
      perform public.notify_users(v_mid, array[p.assigned_rep_id], 'escalation', 'AI escalated: ' || p.name,
        'Buyer asked for 60 day credit and raised a delivery complaint', '/rep/leads/' || p.id, 'seed-escalation-' || p.id, '{in_app}');
    end if;

    -- Order history for customers drives reorder predictions and revenue.
    if p.stage in ('first_order', 'repeat_order') then
      v_days := case p.name when 'Maa Narmada Enterprises' then 30 when 'Gupta Brothers FMCG' then 45 else 25 end;
      for k in reverse 3 .. 1 loop
        v_d := (now() at time zone 'Asia/Kolkata')::date - (v_days * k - 2 - (k % 2) * 3);
        insert into public.orders (manufacturer_id, prospect_id, number, status, total_paise, confirmed_by, confirmed_at, ordered_on, created_at)
        values (v_mid, p.id, 'SO/2026/' || lpad((100 + v_n * 3 + k)::text, 4, '0'), 'delivered',
                case when k = 1 then 0 else 0 end, 'a0000000-0000-4000-8000-000000000001', v_d, v_d, v_d)
        returning id into v_order;
        insert into public.order_items (manufacturer_id, order_id, product_id, qty, unit_price_paise, tax_paise, line_total_paise)
        values (v_mid, v_order, v_oil5, 60 + k * 10, 55800, round((60 + k * 10) * 55800 * 0.05), round((60 + k * 10) * 55800 * 1.05)),
               (v_mid, v_order, v_turmeric, 10, 190000, 95000, 1995000);
        update public.orders set total_paise = (select sum(line_total_paise) from public.order_items where order_id = v_order)
        where id = v_order;
        insert into public.shipments (manufacturer_id, order_id, status, carrier, tracking_ref, dispatched_at, delivered_at)
        values (v_mid, v_order, 'delivered', 'VRL Logistics', 'VRL' || (482000 + v_n * 10 + k), v_d + 1, v_d + 3);
        insert into public.payments (manufacturer_id, order_id, status, amount_paise, due_date, paid_at)
        values (v_mid, v_order, (case when k = 1 and p.name = 'Gupta Brothers FMCG' then 'due' else 'paid' end)::public.payment_status,
                (select total_paise from public.orders where id = v_order), v_d + 15,
                case when not (k = 1 and p.name = 'Gupta Brothers FMCG') then v_d + 12 end);
      end loop;
      update public.prospects set is_customer = true where id = p.id;
    end if;
  end loop;

  -- Historic decided approvals for analytics (approval turnaround, rates).
  insert into public.human_approvals (manufacturer_id, prospect_id, kind, requested_paise, permitted_paise,
    hard_minimum_paise, qty, deal_value_paise, approved_price_paise, status, decided_by, decided_at, summary, expires_at, created_at)
  select v_mid, pr.id, 'price_below_floor', 54500, 55800, 54000, 80, 54500 * 80,
         case when g % 3 = 0 then null else 54500 end,
         case when g % 3 = 0 then 'rejected' else 'approved' end::public.approval_status,
         'a0000000-0000-4000-8000-000000000001', now() - make_interval(days => g * 3) + make_interval(mins => 40 + g * 25),
         pr.name || ' asked ₹545 for 80 jars', now() - make_interval(days => g * 3) + interval '24 hours',
         now() - make_interval(days => g * 3)
  from generate_series(1, 6) g
  join lateral (select id, name from public.prospects where manufacturer_id = v_mid and is_customer offset (g % 3) limit 1) pr on true;
end
$$;

select public.compute_reorders();

-- A few notifications so the badge has something to show.
select public.notify_users('11111111-1111-4111-8111-111111111111',
  array['a0000000-0000-4000-8000-000000000001'::uuid], 'campaign_ready', 'Campaign ready: Nagpur · Oct 2026',
  'Ops is reviewing 8 prospects', '/campaigns/c0000000-0000-4000-8000-000000000002', 'seed-campaign-nagpur', '{in_app}');

-- Second tenant: a prospect that Shakti users must never see.
do $$
declare
  v_id uuid;
begin
  insert into public.prospects (manufacturer_id, name, normalized_name, type, city, state, pipeline_step, review_status, stage)
  values ('22222222-2222-4222-8222-222222222222', 'Kaveri Secret Distributor', 'kaveri secret distributor', 'distributor',
          'Bengaluru', 'Karnataka', 'done', 'approved', 'engaged')
  returning id into v_id;
  insert into public.contacts (manufacturer_id, prospect_id, name, phone_e164, is_primary)
  values ('22222222-2222-4222-8222-222222222222', v_id, 'Hidden Contact', '+919845000001', true);
end
$$;

-- Self-serve signup: Shakti is on Growth (monthly), a few people joined the
-- waitlist from the landing page, and one application waits for payment.
-- Its status page is /signup/status/demo-application-token.
insert into public.subscriptions (manufacturer_id, plan_code, billing_cycle, status, amount_paise, current_period_start, current_period_end)
values ('11111111-1111-4111-8111-111111111111', 'growth', 'monthly', 'active', 900000,
        current_date - 10, (current_date - 10 + interval '1 month')::date);
insert into public.subscription_payments (manufacturer_id, provider, provider_ref, amount_paise, status, paid_at, created_at)
values ('11111111-1111-4111-8111-111111111111', 'manual', 'UTR 402611223344', 900000, 'paid', now() - interval '10 days', now() - interval '10 days');

insert into public.waitlist_entries (email, name, company, source, created_at) values
  ('anita@narmadasnacks.test', 'Anita Joshi', 'Narmada Snacks', 'landing', now() - interval '6 days'),
  ('vikram@malwapulses.test', 'Vikram Rathore', 'Malwa Pulses', 'landing', now() - interval '4 days'),
  ('fatima@deccanspices.test', null, null, 'landing', now() - interval '2 days');

do $$
declare
  v_app uuid;
begin
  insert into public.tenant_applications (
    status, plan_code, billing_cycle, amount_paise, company_name, legal_name, gstin, state, state_code, city,
    owner_name, owner_email, owner_phone, terms_version, accepted_terms_at, status_token_hash, created_at
  ) values (
    'pending_payment', 'basic', 'monthly', 500000, 'Satpura Agro Foods', 'Satpura Agro Foods Pvt Ltd', '23AAJCS4321K1Z9',
    'Madhya Pradesh', '23', 'Jabalpur', 'Meena Patel', 'meena@satpuraagro.test', '+919800000099', '2026-10-20',
    now() - interval '1 day', encode(extensions.digest('demo-application-token', 'sha256'), 'hex'), now() - interval '1 day'
  ) returning id into v_app;
  insert into public.subscription_payments (application_id, provider, amount_paise, status, created_at)
  values (v_app, 'placeholder', 500000, 'pending', now() - interval '1 day');
  insert into public.waitlist_entries (email, name, company, source, application_id, created_at)
  values ('meena@satpuraagro.test', 'Meena Patel', 'Satpura Agro Foods', 'signup', v_app, now() - interval '1 day');
end
$$;

-- Clear queue jobs the seed itself produced (quotation PDFs for seeded
-- quotations are generated by scripts/setup-local, not re-sent).
select pgmq.purge_queue('quotation_jobs');
select pgmq.purge_queue('notifications');
select pgmq.purge_queue('classify');
