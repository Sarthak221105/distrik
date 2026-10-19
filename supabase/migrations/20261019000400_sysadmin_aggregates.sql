-- Manufacturer-owned lead review, part 4: aggregate-only views for the
-- restricted system administrator. The system admin cannot read manufacturer
-- prospects, contacts or messages; these functions return counts and
-- configuration only, for platform maintenance.

create or replace function public.sysadmin_source_health()
returns table (
  id uuid, name text, adapter text, enabled boolean, lawful_basis text, terms_note text, last_run_at timestamptz,
  records_30d bigint, yield_pct numeric, failed_jobs_30d bigint, jobs_30d bigint
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not (public.is_system_admin() or public.is_trusted()) then
    perform public.app_error('forbidden', 'System administrators only', null);
  end if;
  return query
  select s.id, s.name, s.adapter, s.enabled, s.lawful_basis, s.terms_note, s.last_run_at,
         count(r.id) filter (where r.created_at > now() - interval '30 days'),
         round(100.0 * count(r.id) filter (where r.status in ('normalized', 'merged')) / nullif(count(r.id), 0), 1),
         (select count(*) from public.campaign_jobs j where j.source_id = s.id and j.status = 'failed'
            and j.created_at > now() - interval '30 days'),
         (select count(*) from public.campaign_jobs j where j.source_id = s.id and j.created_at > now() - interval '30 days')
  from public.sources s
  left join public.raw_records r on r.source_id = s.id
  group by s.id
  order by s.name;
end
$$;

create or replace function public.sysadmin_tenants()
returns table (
  id uuid, name text, legal_name text, city text, state text, gstin text,
  whatsapp_phone_number_id text, whatsapp_display_number text, created_at timestamptz,
  users bigint, products bigint, campaigns bigint
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not (public.is_system_admin() or public.is_trusted()) then
    perform public.app_error('forbidden', 'System administrators only', null);
  end if;
  return query
  select m.id, m.name, m.legal_name, m.city, m.state, m.gstin, m.whatsapp_phone_number_id, m.whatsapp_display_number,
         m.created_at,
         (select count(*) from public.profiles p where p.manufacturer_id = m.id and p.active),
         (select count(*) from public.products p where p.manufacturer_id = m.id),
         (select count(*) from public.campaigns c where c.manufacturer_id = m.id)
  from public.manufacturers m
  order by m.name;
end
$$;

-- The security-invoker source view is no longer meaningful for anyone:
-- manufacturers never needed it and the system admin uses the function above.
drop view if exists public.v_source_health;

grant execute on function public.sysadmin_source_health(), public.sysadmin_tenants() to authenticated;
