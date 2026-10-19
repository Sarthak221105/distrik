-- The analytics views were created after the blanket select grant in 0300,
-- so authenticated could not read them. They are security_invoker, so RLS
-- on the underlying tables still applies.
grant select on public.v_funnel, public.v_city_conversion, public.v_revenue_monthly,
  public.v_reorder_rate, public.v_ai_health, public.v_source_health to authenticated;
