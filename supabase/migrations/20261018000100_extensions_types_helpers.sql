-- AI Sales OS: extensions, enums and auth/claim helpers.
-- Every rule that must never be bypassed lives in SQL (PRD sections 5, 6).

create extension if not exists pg_trgm with schema extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgmq;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('owner', 'sales_head', 'rep', 'ops_admin');
create type public.autonomy_tier as enum ('autonomous', 'approval', 'human_only');
create type public.consent_status as enum ('none', 'engaged', 'opted_in', 'opted_out');
create type public.channel as enum ('whatsapp', 'sms', 'email', 'voice');
create type public.message_direction as enum ('inbound', 'outbound');
create type public.message_status as enum ('queued', 'sent', 'delivered', 'read', 'failed', 'received', 'blocked', 'cancelled');
create type public.message_actor as enum ('buyer', 'ai', 'rep', 'owner', 'system');
create type public.review_status as enum ('pending', 'approved', 'rejected', 'merged');
create type public.prospect_stage as enum (
  'new', 'contacted', 'engaged', 'qualified', 'negotiating', 'quoted', 'first_order', 'repeat_order', 'lost'
);
create type public.campaign_status as enum (
  'draft', 'discovering', 'scoring', 'qa', 'ready', 'live', 'paused', 'completed', 'failed'
);
create type public.approval_status as enum ('pending', 'approved', 'rejected', 'countered', 'expired');
create type public.approval_kind as enum (
  'price_below_floor', 'payment_terms', 'credit', 'sample', 'custom_quotation', 'other'
);
create type public.negotiation_status as enum ('open', 'awaiting_approval', 'agreed', 'quoted', 'rejected', 'closed');
create type public.offer_decision as enum ('accept', 'needs_approval', 'reject', 'approved', 'countered', 'declined');
create type public.quotation_status as enum ('draft', 'generating', 'sent', 'superseded', 'accepted', 'expired');
create type public.po_match_status as enum ('pending', 'matched', 'mismatch', 'needs_review');
create type public.order_status as enum ('confirmed', 'dispatched', 'in_transit', 'delivered', 'cancelled');
create type public.shipment_status as enum ('pending', 'dispatched', 'in_transit', 'delivered');
create type public.payment_status as enum ('due', 'paid', 'overdue');
create type public.reorder_status as enum ('upcoming', 'due', 'overdue', 'ordered', 'dismissed');
create type public.followup_status as enum ('pending', 'processing', 'done', 'cancelled');
create type public.template_status as enum ('draft', 'submitted', 'approved', 'rejected', 'paused');

-- ---------------------------------------------------------------------------
-- Claim helpers. The Custom Access Token Hook puts manufacturer_id and
-- app_role in the JWT; the built in `role` claim stays `authenticated`.
-- ---------------------------------------------------------------------------
create or replace function public.jwt_claims()
returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function public.auth_mid()
returns uuid
language sql stable
as $$
  select nullif(public.jwt_claims() ->> 'manufacturer_id', '')::uuid
$$;

create or replace function public.auth_role()
returns text
language sql stable
as $$
  select coalesce(public.jwt_claims() ->> 'app_role', '')
$$;

create or replace function public.is_ops()
returns boolean
language sql stable
as $$
  select public.auth_role() = 'ops_admin'
$$;

-- True for Edge Functions (service role) and for in database jobs (pg_cron,
-- migrations) that run without any request claims. Never true for a browser.
create or replace function public.is_trusted()
returns boolean
language sql stable
as $$
  select (public.jwt_claims() ->> 'role') = 'service_role'
      or (public.jwt_claims() = '{}'::jsonb
          and session_user not in ('authenticator', 'anon', 'authenticated'))
$$;

-- One error shape for every RPC: message = code, detail = human message,
-- hint = field. The frontend maps it to { code, message, field }.
create or replace function public.app_error(p_code text, p_message text, p_field text default null)
returns void
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = p_message, hint = coalesce(p_field, '');
end
$$;

-- Generic updated_at trigger
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Indian phone numbers to E.164. Accepts 10 digit mobiles, 0 prefixed,
-- 91 prefixed, +91 and formatting characters. Returns null when invalid.
create or replace function public.normalize_phone_e164(p_raw text)
returns text
language plpgsql immutable
as $$
declare
  d text;
begin
  if p_raw is null then
    return null;
  end if;
  d := regexp_replace(p_raw, '[^0-9]', '', 'g');
  if length(d) = 12 and left(d, 2) = '91' then
    d := right(d, 10);
  elsif length(d) = 11 and left(d, 1) = '0' then
    d := right(d, 10);
  elsif length(d) = 13 and left(d, 3) = '091' then
    d := right(d, 10);
  end if;
  if length(d) <> 10 then
    return null;
  end if;
  return '+91' || d;
end
$$;

create or replace function public.normalize_business_name(p_raw text)
returns text
language sql immutable
as $$
  select nullif(trim(regexp_replace(
    regexp_replace(lower(coalesce(p_raw, '')), '\m(m/s|messrs|pvt|private|ltd|limited|llp|co|and|&)\M\.?', ' ', 'g'),
    '[^a-z0-9 ]+', ' ', 'g')), '')
$$;

-- Indian states and GST state codes, used for CGST/SGST vs IGST on quotations.
create table public.india_states (
  code text primary key,
  name text not null unique,
  alt_names text[] not null default '{}'
);

insert into public.india_states (code, name, alt_names) values
  ('01', 'Jammu and Kashmir', '{"J&K","Jammu & Kashmir"}'),
  ('02', 'Himachal Pradesh', '{"HP"}'),
  ('03', 'Punjab', '{}'),
  ('04', 'Chandigarh', '{}'),
  ('05', 'Uttarakhand', '{"Uttaranchal"}'),
  ('06', 'Haryana', '{}'),
  ('07', 'Delhi', '{"New Delhi","NCT of Delhi"}'),
  ('08', 'Rajasthan', '{}'),
  ('09', 'Uttar Pradesh', '{"UP"}'),
  ('10', 'Bihar', '{}'),
  ('11', 'Sikkim', '{}'),
  ('12', 'Arunachal Pradesh', '{}'),
  ('13', 'Nagaland', '{}'),
  ('14', 'Manipur', '{}'),
  ('15', 'Mizoram', '{}'),
  ('16', 'Tripura', '{}'),
  ('17', 'Meghalaya', '{}'),
  ('18', 'Assam', '{}'),
  ('19', 'West Bengal', '{"WB"}'),
  ('20', 'Jharkhand', '{}'),
  ('21', 'Odisha', '{"Orissa"}'),
  ('22', 'Chhattisgarh', '{}'),
  ('23', 'Madhya Pradesh', '{"MP"}'),
  ('24', 'Gujarat', '{}'),
  ('26', 'Dadra and Nagar Haveli and Daman and Diu', '{"Daman and Diu","Dadra and Nagar Haveli"}'),
  ('27', 'Maharashtra', '{"MH"}'),
  ('29', 'Karnataka', '{}'),
  ('30', 'Goa', '{}'),
  ('31', 'Lakshadweep', '{}'),
  ('32', 'Kerala', '{}'),
  ('33', 'Tamil Nadu', '{"TN"}'),
  ('34', 'Puducherry', '{"Pondicherry"}'),
  ('35', 'Andaman and Nicobar Islands', '{}'),
  ('36', 'Telangana', '{}'),
  ('37', 'Andhra Pradesh', '{"AP"}'),
  ('38', 'Ladakh', '{}');

create or replace function public.gst_state_code(p_state text)
returns text
language sql stable
as $$
  select code from public.india_states
  where lower(name) = lower(trim(p_state))
     or lower(trim(p_state)) = any (select lower(a) from unnest(alt_names) a)
  limit 1
$$;
