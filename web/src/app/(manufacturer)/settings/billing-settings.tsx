"use client";

import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatDate, formatINR } from "@/lib/format";
import { limitLabel, type PublicPlan } from "@/lib/plans";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/domain/states";

type Subscription = {
  plan_code: string;
  billing_cycle: "monthly" | "yearly";
  status: "active" | "past_due" | "cancelled" | "trialing";
  amount_paise: number;
  current_period_start: string;
  current_period_end: string;
  plans: Pick<PublicPlan, "name" | "tagline" | "features" | "limits"> | null;
};

type Payment = { id: string; provider: string; provider_ref: string | null; amount_paise: number; status: string; created_at: string; paid_at: string | null };

const STATUS_TONE: Record<string, BadgeTone> = { active: "success", trialing: "info", past_due: "warning", cancelled: "neutral", paid: "success", pending: "warning", failed: "danger", refunded: "neutral" };

/** Read-only: plan limits are shown for information and are not enforced. */
export function BillingSettings() {
  const supabase = getSupabaseBrowser();
  const q = useQuery({
    queryKey: qk.billing(),
    queryFn: async () => {
      const [sub, payments] = await Promise.all([
        supabase.from("subscriptions").select("plan_code, billing_cycle, status, amount_paise, current_period_start, current_period_end, plans(name, tagline, features, limits)").maybeSingle(),
        supabase.from("subscription_payments").select("id, provider, provider_ref, amount_paise, status, created_at, paid_at").order("created_at", { ascending: false }),
      ]);
      return { sub: unwrap(sub) as unknown as Subscription | null, payments: (unwrap(payments) ?? []) as Payment[] };
    },
  });

  if (q.isLoading) return <LoadingSkeleton variant="detail" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { sub, payments } = q.data!;
  if (!sub) {
    return (
      <EmptyState
        icon={<CreditCard aria-hidden />}
        title="No plan on record"
        description="This workspace was set up before self-serve plans. Write to hello@distrik.test to choose one."
      />
    );
  }

  const limits = sub.plans?.limits;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{sub.plans?.name ?? sub.plan_code} plan</CardTitle>
            <Badge tone={STATUS_TONE[sub.status] ?? "neutral"} className="capitalize">{sub.status.replace("_", " ")}</Badge>
          </div>
          {sub.plans?.tagline && <CardDescription>{sub.plans.tagline}</CardDescription>}
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="tabular text-2xl font-semibold">
            {formatINR(sub.amount_paise, { whole: true })}
            <span className="text-sm font-normal text-muted-foreground"> / {sub.billing_cycle === "yearly" ? "year" : "month"} + GST</span>
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Current period</dt>
            <dd>{formatDate(sub.current_period_start)} – {formatDate(sub.current_period_end)}</dd>
            <dt className="text-muted-foreground">Renews on</dt>
            <dd>{formatDate(sub.current_period_end)}</dd>
          </dl>
          {limits && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Included</p>
              <ul className="mt-1 grid gap-1">
                <li>{limitLabel(limits.seats, "team seats")}</li>
                <li>{limitLabel(limits.active_campaigns, "active campaigns")}</li>
                <li>{limitLabel(limits.prospects_per_month, "prospects a month")}</li>
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground">To change plan or billing cycle, write to hello@distrik.test.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>Online payment is coming soon; payments are recorded by the Distrik team for now.</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Reference</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {payments.map((p) => (
                  <TR key={p.id}>
                    <TD className="text-xs">{formatDate(p.paid_at ?? p.created_at)}</TD>
                    <TD className="text-xs">{p.provider_ref ?? p.provider}</TD>
                    <TD className="text-right tabular">{formatINR(p.amount_paise, { whole: true })}</TD>
                    <TD><Badge tone={STATUS_TONE[p.status] ?? "neutral"} className="capitalize">{p.status}</Badge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
