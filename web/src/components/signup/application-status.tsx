"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, CreditCard, Mail, XCircle } from "lucide-react";
import { publicApi } from "@/lib/plans";
import { formatDateTime, formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState, Skeleton } from "@/components/domain/states";

/**
 * Public status page for an application, reached by the private link shown
 * after submitting (and in the confirmation email). Polls until active.
 */
export function ApplicationStatusView({ token }: { token: string }) {
  const q = useQuery({
    queryKey: ["application-status", token],
    queryFn: () => publicApi.status(token),
    refetchInterval: (query) => (query.state.data?.status === "active" || query.state.data?.status === "rejected" ? false : 15_000),
  });

  if (q.isLoading) {
    return (
      <div className="mx-auto grid max-w-3xl gap-4 px-4 py-12">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <ErrorState title="We could not find this application" error={q.error} onRetry={() => q.refetch()} />
      </div>
    );
  }

  const a = q.data;
  const active = a.status === "active";
  const rejected = a.status === "rejected" || a.status === "cancelled";

  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-12">
      <div>
        <p className="text-sm font-semibold text-primary">Application received</p>
        <h1 className="mt-2 text-[34px] leading-[1.15] font-medium tracking-tight sm:text-[40px]">
          {active ? "Your workspace is ready" : rejected ? "Your application was not approved" : `Thank you, ${a.owner_name.split(" ")[0]}`}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {a.company_name} · submitted {formatDateTime(a.created_at)}
        </p>
      </div>

      {active ? (
        <Card className="flex gap-3 border-success/40 bg-success-soft p-5">
          <Mail className="mt-0.5 size-5 text-success" aria-hidden />
          <div>
            <p className="font-medium">Check your email</p>
            <p className="text-sm text-muted-foreground">
              We sent a sign in link to {a.owner_email}. Open it to set your password and enter your workspace.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link href="/login">Go to sign in</Link>
            </Button>
          </div>
        </Card>
      ) : rejected ? (
        <Card className="flex gap-3 border-danger/30 bg-danger-soft p-5">
          <XCircle className="mt-0.5 size-5 text-danger" aria-hidden />
          <p className="text-sm">Please write to hello@distrik.test and we will help.</p>
        </Card>
      ) : (
        <Card className="grid gap-1 p-5 text-center">
          <p className="text-sm text-muted-foreground">You are</p>
          <p className="tabular font-display text-h1 font-medium text-primary">#{a.waitlist_position}</p>
          <p className="text-sm text-muted-foreground">
            on the waitlist of {a.waitlist_count.toLocaleString("en-IN")} manufacturers. We will email a sign in link to {a.owner_email} as soon
            as your workspace is ready.
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Order summary</p>
          <p className="mt-2 font-display text-h4 font-medium">{a.plan_name} plan</p>
          <p className="text-sm text-muted-foreground capitalize">{a.billing_cycle} billing</p>
          <p className="tabular mt-3 font-display text-h3 font-medium">
            {formatINR(a.amount_paise, { whole: true })}
            <span className="text-sm font-normal text-muted-foreground"> + GST</span>
          </p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment</p>
            <Badge tone={a.payment_status === "paid" ? "success" : "warning"}>
              {a.payment_status === "paid" ? <CheckCircle2 aria-hidden /> : <Clock aria-hidden />}
              {a.payment_status === "paid" ? "Paid" : "Coming soon"}
            </Badge>
          </div>
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            <CreditCard className="size-5 shrink-0" aria-hidden />
            {a.payment_status === "paid"
              ? "Payment received. Thank you."
              : "Online payment (UPI, cards, net banking) is coming soon. You do not need to do anything now."}
          </div>
          <Button className="mt-3 w-full" disabled>
            Pay {formatINR(a.amount_paise, { whole: true })}
          </Button>
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Keep this page link to check your status. Questions? <Link href="/policies" className="underline">Read our policies</Link>.
      </p>
    </div>
  );
}
