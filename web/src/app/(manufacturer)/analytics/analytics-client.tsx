"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Clock, LineChart, Repeat, ShieldAlert, UserCheck } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import { formatDate, formatINR, formatINRCompact, formatNumber } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, NativeSelect } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { KpiCard } from "@/components/domain/kpi-card";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/domain/states";
import { CityChart, FUNNEL_STEPS, FunnelChart, RevenueChart, sumFunnel, type RevenuePoint } from "@/components/manufacturer/charts";
import { unwrapList, useTrackScreen } from "@/components/manufacturer/hooks";
import { LeadReviewSection } from "@/components/manufacturer/lead-review-analytics";

function fmtPct(v: number | null | undefined) {
  return v === null || v === undefined ? "–" : `${Number(v).toFixed(1)}%`;
}

function fmtMinutes(v: number | null | undefined) {
  if (v === null || v === undefined) return "–";
  const m = Number(v);
  if (m < 60) return `${Math.round(m)} min`;
  return `${(m / 60).toFixed(1)} h`;
}

export function AnalyticsClient() {
  const supabase = getSupabaseBrowser();
  useTrackScreen("analytics");
  const [campaign, setCampaign] = useState("");

  const data = useQuery({
    queryKey: qk.analytics("all"),
    queryFn: async () => {
      const [funnel, city, revenue, reorder, ai, campaigns] = await Promise.all([
        supabase.from("v_funnel").select("*"),
        supabase.from("v_city_conversion").select("*").order("prospects", { ascending: false }),
        supabase.from("v_revenue_monthly").select("*").order("month", { ascending: true }),
        supabase.from("v_reorder_rate").select("*"),
        supabase.from("v_ai_health").select("*"),
        supabase.from("campaigns").select("id, name").order("created_at", { ascending: false }),
      ]);
      return {
        funnel: unwrapList(funnel),
        city: unwrapList(city),
        revenue: unwrapList(revenue),
        reorder: unwrapList(reorder)[0] ?? null,
        ai: unwrapList(ai)[0] ?? null,
        campaigns: unwrapList(campaigns),
      };
    },
    staleTime: 60_000,
  });

  const funnel = useMemo(
    () => sumFunnel((data.data?.funnel ?? []).filter((r) => !campaign || r.campaign_id === campaign)),
    [data.data, campaign],
  );
  const revenue: RevenuePoint[] = useMemo(
    () =>
      (data.data?.revenue ?? []).map((r) => ({
        month: r.month ?? "",
        label: r.month ? formatDate(r.month, "MMM yy") : "",
        revenue_paise: Number(r.revenue_paise ?? 0),
        orders: Number(r.orders ?? 0),
        accounts: Number(r.accounts ?? 0),
      })),
    [data.data],
  );
  const cities = useMemo(
    () =>
      (data.data?.city ?? []).map((c) => ({
        city: c.city ?? "Unknown",
        prospects: Number(c.prospects ?? 0),
        contacted: Number(c.contacted ?? 0),
        qualified: Number(c.qualified ?? 0),
        customers: Number(c.customers ?? 0),
        revenue_paise: Number(c.revenue_paise ?? 0),
      })),
    [data.data],
  );

  if (data.isLoading)
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading analytics">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  if (data.error) return <ErrorState error={data.error} onRetry={() => data.refetch()} />;
  const d = data.data!;
  const totalRevenue = revenue.reduce((s, r) => s + r.revenue_paise, 0);
  const totalOrders = revenue.reduce((s, r) => s + r.orders, 0);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Analytics"
        description="Every number is read from the same rows you see elsewhere, with row level security applied."
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor="an-campaign" className="text-xs text-muted-foreground">Funnel and review for</Label>
            <NativeSelect id="an-campaign" className="w-56" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
              <option value="">All campaigns</option>
              {d.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </div>
        }
      />

      <LeadReviewSection campaignId={campaign || undefined} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Funnel</CardTitle>
            <CardDescription>Prospects your team approved, by furthest step reached</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {funnel.identified === 0 ? (
              <EmptyState icon={<LineChart aria-hidden />} title="No prospects yet" description="The funnel fills as your team approves prospects in Lead Review." />
            ) : (
              <>
                <FunnelChart counts={funnel} />
                <Table>
                  <caption className="sr-only">Funnel numbers</caption>
                  <THead><TR>{FUNNEL_STEPS.map((s) => <TH key={s.key} scope="col" className="text-right">{s.label}</TH>)}</TR></THead>
                  <TBody><TR>{FUNNEL_STEPS.map((s) => <TD key={s.key} className="text-right tabular">{formatNumber(funnel[s.key])}</TD>)}</TR></TBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue over time</CardTitle>
            <CardDescription>
              {formatINR(totalRevenue, { whole: true })} from {formatNumber(totalOrders)} orders (cancelled orders excluded)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {revenue.length === 0 ? (
              <EmptyState title="No revenue yet" description="Revenue appears once you confirm the first order." />
            ) : (
              <RevenueChart data={revenue} />
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Conversion by city</CardTitle>
            <CardDescription>All campaigns</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {cities.length === 0 ? (
              <EmptyState title="No cities yet" />
            ) : (
              <>
                <CityChart data={cities.slice(0, 12)} />
                <Table>
                  <caption className="sr-only">Conversion by city</caption>
                  <THead>
                    <TR>
                      <TH scope="col">City</TH>
                      <TH scope="col" className="text-right">Prospects</TH>
                      <TH scope="col" className="text-right">Contacted</TH>
                      <TH scope="col" className="text-right">Qualified</TH>
                      <TH scope="col" className="text-right">Customers</TH>
                      <TH scope="col" className="text-right">Conversion</TH>
                      <TH scope="col" className="text-right">Revenue</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {cities.map((c) => (
                      <TR key={c.city}>
                        <TD className="font-medium">{c.city}</TD>
                        <TD className="text-right tabular">{formatNumber(c.prospects)}</TD>
                        <TD className="text-right tabular">{formatNumber(c.contacted)}</TD>
                        <TD className="text-right tabular">{formatNumber(c.qualified)}</TD>
                        <TD className="text-right tabular">{formatNumber(c.customers)}</TD>
                        <TD className="text-right tabular">{c.prospects ? fmtPct((100 * c.customers) / c.prospects) : "–"}</TD>
                        <TD className="text-right tabular">{formatINRCompact(c.revenue_paise)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="reorder-h" className="grid gap-3">
        <h2 id="reorder-h" className="text-sm font-semibold">Reorders</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard label="Reorder rate" value={fmtPct(d.reorder?.reorder_rate_pct)} hint="Customers with 2 or more orders" icon={<Repeat aria-hidden />} />
          <KpiCard label="Customers" value={formatNumber(d.reorder?.customers ?? 0)} />
          <KpiCard label="Repeat customers" value={formatNumber(d.reorder?.repeat_customers ?? 0)} />
        </div>
      </section>

      <section aria-labelledby="ai-h" className="grid gap-3">
        <div>
          <h2 id="ai-h" className="text-sm font-semibold">AI health · last 30 days</h2>
          <p className="text-xs text-muted-foreground">{formatNumber(d.ai?.turns ?? 0)} completed AI turns</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Autonomy rate" value={fmtPct(d.ai?.autonomy_rate_pct)} hint="Turns with no approval or escalation" icon={<Bot aria-hidden />} />
          <KpiCard label="Approval rate" value={fmtPct(d.ai?.approval_rate_pct)} hint="Turns that needed a human decision" icon={<UserCheck aria-hidden />} />
          <KpiCard label="Escalation rate" value={fmtPct(d.ai?.escalation_rate_pct)} hint="Turns handed to a person" icon={<ShieldAlert aria-hidden />} />
          <KpiCard label="Validator blocks" value={formatNumber(d.ai?.validator_blocks ?? 0)} hint="Replies blocked for an unapproved price" />
          <KpiCard
            label="Median approval turnaround"
            value={fmtMinutes(d.ai?.median_approval_turnaround_min)}
            hint={`${formatNumber(d.ai?.approvals ?? 0)} approvals · target under 4 h`}
            icon={<Clock aria-hidden />}
          />
        </div>
      </section>
    </div>
  );
}
