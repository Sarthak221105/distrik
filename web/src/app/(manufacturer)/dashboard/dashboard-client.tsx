"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BadgeCheck,
  ClipboardCheck,
  FileText,
  IndianRupee,
  Megaphone,
  MessageSquare,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatINRCompact, formatNumber, timeAgo } from "@/lib/format";
import { useRealtime } from "@/hooks/use-realtime";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { KpiCard } from "@/components/domain/kpi-card";
import { ApprovalCard, APPROVAL_SELECT, type ApprovalWithJoins } from "@/components/domain/approval-card";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader, Skeleton } from "@/components/domain/states";
import { StatusBadge } from "@/components/domain/badges";
import { FunnelBars, sumFunnel } from "@/components/manufacturer/charts";
import { unwrapList, useTrackScreen } from "@/components/manufacturer/hooks";
import { istDayStartISO, istMonthStartDate } from "@/components/manufacturer/time";
import { useAwaitingReviewCount } from "@/components/manufacturer/lead-shared";

type Kpis = {
  pending: number;
  live: number;
  conversationsToday: number;
  quotesAwaiting: number;
  revenueMonth: number;
  ordersMonth: number;
  reordersDue: number;
};

export function DashboardClient() {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  useTrackScreen("dashboard");
  const awaiting = useAwaitingReviewCount();

  const kpis = useQuery({
    queryKey: ["dashboard", "kpis"],
    queryFn: async (): Promise<Kpis> => {
      const today = istDayStartISO();
      const [pending, live, conv, quotes, revenue, reorders] = await Promise.all([
        supabase.from("human_approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "live"),
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .or(`last_inbound_at.gte.${today},last_outbound_at.gte.${today}`),
        supabase.from("quotations").select("id", { count: "exact", head: true }).eq("status", "sent"),
        supabase.from("v_revenue_monthly").select("revenue_paise, orders").eq("month", istMonthStartDate()),
        supabase
          .from("reorder_predictions")
          .select("id", { count: "exact", head: true })
          .in("status", ["due", "overdue"]),
      ]);
      for (const r of [pending, live, conv, quotes, revenue, reorders]) if (r.error) unwrap(r);
      const rev = (revenue.data ?? []).reduce(
        (s, r) => ({ revenue: s.revenue + Number(r.revenue_paise ?? 0), orders: s.orders + Number(r.orders ?? 0) }),
        { revenue: 0, orders: 0 },
      );
      return {
        pending: pending.count ?? 0,
        live: live.count ?? 0,
        conversationsToday: conv.count ?? 0,
        quotesAwaiting: quotes.count ?? 0,
        revenueMonth: rev.revenue,
        ordersMonth: rev.orders,
        reordersDue: reorders.count ?? 0,
      };
    },
  });

  const approvals = useQuery({
    queryKey: [...qk.approvals("pending"), "top3"],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("human_approvals")
          .select(APPROVAL_SELECT)
          .eq("status", "pending")
          .order("expires_at", { ascending: true })
          .limit(3),
      ) as unknown as ApprovalWithJoins[],
  });

  const campaigns = useQuery({
    queryKey: [...qk.campaigns(), "dashboard"],
    queryFn: async () => {
      const [c, f] = await Promise.all([
        supabase
          .from("campaigns")
          .select("id, name, status, status_detail, target_count, target_city, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("v_funnel").select("*"),
      ]);
      const list = unwrapList(c);
      const funnel = unwrapList(f);
      return { list, funnel };
    },
  });

  const escalations = useQuery({
    queryKey: ["dashboard", "escalations"],
    queryFn: async () =>
      unwrapList(
        await supabase
          .from("ai_actions")
          .select("id, created_at, input, output, outcome, prospect:prospects(id, name, city)")
          .eq("action_type", "escalate_to_human")
          .order("created_at", { ascending: false })
          .limit(5),
      ),
  });

  useRealtime({
    table: "human_approvals",
    invalidate: [qk.approvals("pending"), ["dashboard", "kpis"]],
  });
  useRealtime({
    table: "notifications",
    filter: `user_id=eq.${viewer.userId}`,
    invalidate: [["dashboard"], qk.campaigns()],
  });

  const funnelTotals = sumFunnel(campaigns.data?.funnel ?? []);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={`Namaste${viewer.fullName ? `, ${viewer.fullName.split(" ")[0]}` : ""}`}
        description="What needs you today, and how your markets are moving."
        actions={
          <Button asChild>
            <Link href="/campaigns/new">
              <Plus aria-hidden /> Start Sales
            </Link>
          </Button>
        }
      />

      {kpis.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : kpis.error ? (
        <ErrorState title="Could not load your numbers" error={kpis.error} onRetry={() => kpis.refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <KpiCard
            label="Pending approvals"
            value={formatNumber(kpis.data!.pending)}
            hint={kpis.data!.pending ? "Waiting for your decision" : "All clear"}
            icon={<BadgeCheck aria-hidden />}
            href="/approvals"
            tone={kpis.data!.pending ? "attention" : "default"}
          />
          <KpiCard
            label="Leads awaiting review"
            value={awaiting.isLoading ? "…" : awaiting.error ? "–" : formatNumber(awaiting.data ?? 0)}
            hint={awaiting.error ? "Could not load" : awaiting.data ? "Approve or reject in Lead Review" : "Nothing waiting"}
            icon={<ClipboardCheck aria-hidden />}
            href="/leads"
            tone={awaiting.data ? "attention" : "default"}
          />
          <KpiCard
            label="Live campaigns"
            value={formatNumber(kpis.data!.live)}
            icon={<Megaphone aria-hidden />}
            href="/campaigns"
          />
          <KpiCard
            label="Conversations today"
            value={formatNumber(kpis.data!.conversationsToday)}
            hint="With a message in or out today"
            icon={<MessageSquare aria-hidden />}
            href="/pipeline"
          />
          <KpiCard
            label="Quotes awaiting PO"
            value={formatNumber(kpis.data!.quotesAwaiting)}
            icon={<FileText aria-hidden />}
            href="/quotations"
          />
          <KpiCard
            label="Revenue this month"
            value={formatINRCompact(kpis.data!.revenueMonth)}
            hint={`${formatNumber(kpis.data!.ordersMonth)} orders`}
            icon={<IndianRupee aria-hidden />}
            href="/analytics"
          />
          <KpiCard
            label="Reorders due"
            value={formatNumber(kpis.data!.reordersDue)}
            hint="Due or overdue accounts"
            icon={<RefreshCcw aria-hidden />}
            href="/orders"
          />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="dash-approvals" className="grid content-start gap-3">
          <div className="flex items-center justify-between">
            <h2 id="dash-approvals" className="text-sm font-semibold">
              Approvals waiting
            </h2>
            <Button asChild variant="link" size="sm">
              <Link href="/approvals">View queue</Link>
            </Button>
          </div>
          {approvals.isLoading ? (
            <LoadingSkeleton rows={2} />
          ) : approvals.error ? (
            <ErrorState error={approvals.error} onRetry={() => approvals.refetch()} />
          ) : approvals.data!.length === 0 ? (
            <EmptyState
              icon={<BadgeCheck aria-hidden />}
              title="Nothing to approve"
              description="When a buyer asks for something outside your rules, it shows up here within seconds."
            />
          ) : (
            approvals.data!.map((a) => <ApprovalCard key={a.id} approval={a} compact />)
          )}
        </section>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Funnel snapshot</CardTitle>
              <CardDescription>All campaigns, prospects your team approved</CardDescription>
            </CardHeader>
            <CardContent>
              {campaigns.isLoading ? (
                <LoadingSkeleton rows={3} />
              ) : campaigns.error ? (
                <ErrorState error={campaigns.error} onRetry={() => campaigns.refetch()} />
              ) : funnelTotals.identified === 0 ? (
                <p className="text-sm text-muted-foreground">No prospects yet. Start a campaign to fill the funnel.</p>
              ) : (
                <FunnelBars counts={funnelTotals} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Campaign progress</CardTitle>
            </CardHeader>
            <CardContent>
              {campaigns.isLoading ? (
                <LoadingSkeleton rows={3} />
              ) : campaigns.error ? null : campaigns.data!.list.length === 0 ? (
                <EmptyState
                  title="No campaigns yet"
                  description="Tell the AI which market to sell into. It finds and scores buyers; your team approves them in Lead Review."
                  action={
                    <Button asChild size="sm">
                      <Link href="/campaigns/new">Start Sales</Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="grid gap-4">
                  {campaigns.data!.list.map((c) => {
                    const f = sumFunnel(campaigns.data!.funnel.filter((r) => r.campaign_id === c.id));
                    const pct = c.target_count ? Math.min(100, (f.identified / c.target_count) * 100) : 0;
                    return (
                      <li key={c.id} className="grid gap-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Link href={`/campaigns/${c.id}`} className="text-sm font-medium hover:underline">
                            {c.name}
                          </Link>
                          <StatusBadge status={c.status} />
                        </div>
                        <Progress value={pct} label={`${c.name}: ${f.identified} of ${c.target_count} prospects approved`} />
                        <p className="text-xs text-muted-foreground tabular">
                          {f.identified}/{c.target_count} approved · {f.contacted} contacted · {f.ordered} ordered
                          {c.status_detail ? ` · ${c.status_detail}` : ""}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent AI escalations</CardTitle>
              <CardDescription>Threads the AI handed to a person</CardDescription>
            </CardHeader>
            <CardContent>
              {escalations.isLoading ? (
                <LoadingSkeleton rows={2} />
              ) : escalations.error ? (
                <ErrorState error={escalations.error} onRetry={() => escalations.refetch()} />
              ) : escalations.data!.length === 0 ? (
                <p className="text-sm text-muted-foreground">No escalations. The AI is handling conversations inside your rules.</p>
              ) : (
                <ul className="grid gap-3">
                  {escalations.data!.map((e) => {
                    const prospect = e.prospect as { id: string; name: string; city: string | null } | null;
                    const input = (e.input ?? {}) as Record<string, unknown>;
                    return (
                      <li key={e.id} className="flex gap-2 text-sm">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                        <div className="min-w-0">
                          {prospect ? (
                            <Link href={`/prospects/${prospect.id}`} className="font-medium hover:underline">
                              {prospect.name}
                            </Link>
                          ) : (
                            <span className="font-medium">Buyer</span>
                          )}
                          <p className="text-muted-foreground">
                            {String(input.reason ?? e.outcome ?? "Escalated to a person")} · {timeAgo(e.created_at)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
