"use client";

import Link from "next/link";
import { CheckCircle2, ClipboardCheck, Clock, GitMerge, Send, XCircle } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { KpiCard } from "@/components/domain/kpi-card";
import { EmptyState, ErrorState, Skeleton } from "@/components/domain/states";
import { useReviewStats } from "@/components/manufacturer/review-stats";

function fmtHours(v: number | null) {
  if (v === null) return "–";
  if (v < 1) return `${Math.round(v * 60)} min`;
  if (v < 48) return `${v.toFixed(1)} h`;
  return `${(v / 24).toFixed(1)} days`;
}

/** Lead review analytics from v_review_stats and v_duplicate_stats. */
export function LeadReviewSection({ campaignId }: { campaignId?: string }) {
  const stats = useReviewStats(campaignId);
  const s = stats.data;
  const awaiting = (s?.pending_review ?? 0) + (s?.needs_review ?? 0);
  const resolved = (s?.dup_merged ?? 0) + (s?.dup_kept_separate ?? 0);
  const outcomes = s
    ? [
        { label: "Awaiting review", value: awaiting, bar: "bg-warning" },
        { label: "Approved", value: s.approved, bar: "bg-success" },
        { label: "Rejected", value: s.rejected, bar: "bg-danger" },
      ]
    : [];
  const max = Math.max(1, ...outcomes.map((o) => o.value));

  return (
    <section aria-labelledby="review-an-h" className="grid gap-3">
      <div>
        <h2 id="review-an-h" className="text-sm font-semibold">
          Lead review
        </h2>
        <p className="text-xs text-muted-foreground">How your team turns discovered prospects into approved ones.</p>
      </div>
      {stats.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading lead review numbers">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : stats.error ? (
        <ErrorState title="Could not load lead review numbers" error={stats.error} onRetry={() => stats.refetch()} />
      ) : !s || s.discovered === 0 ? (
        <EmptyState icon={<ClipboardCheck aria-hidden />} title="No prospects discovered yet" description="Start a campaign or import your own buyers to see review numbers." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <KpiCard label="Prospects discovered" value={formatNumber(s.discovered)} hint="Excluding merged duplicates" />
            <KpiCard
              label="Awaiting review"
              value={formatNumber(awaiting)}
              hint={`${formatNumber(s.needs_review)} with warnings`}
              icon={<ClipboardCheck aria-hidden />}
              href={campaignId ? `/leads?campaign=${campaignId}` : "/leads"}
              tone={awaiting ? "attention" : "default"}
            />
            <KpiCard label="Approved" value={formatNumber(s.approved)} icon={<CheckCircle2 aria-hidden />} />
            <KpiCard label="Rejected" value={formatNumber(s.rejected)} icon={<XCircle aria-hidden />} />
            <KpiCard
              label="Duplicates resolved"
              value={formatNumber(resolved)}
              hint={`${formatNumber(s.dup_merged)} merged · ${formatNumber(s.dup_kept_separate)} kept separate · ${formatNumber(s.dup_pending)} pending`}
              icon={<GitMerge aria-hidden />}
            />
            <KpiCard label="Median review turnaround" value={fmtHours(s.median_review_hours)} hint="From discovery to decision" icon={<Clock aria-hidden />} />
            <KpiCard label="Outreach started" value={formatNumber(s.outreach_started)} hint="Approved and released" icon={<Send aria-hidden />} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Review outcomes</CardTitle>
              <CardDescription>
                {campaignId ? "This campaign" : "All campaigns"} ·{" "}
                <Link href={campaignId ? `/leads?campaign=${campaignId}&status=all` : "/leads?status=all"} className="text-primary hover:underline">
                  Open Lead Review
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="sr-only">
                Of {s.discovered} discovered prospects, {awaiting} are awaiting review, {s.approved} were approved and {s.rejected} were rejected.
                {` ${resolved} duplicate warnings were resolved.`}
              </p>
              <div className="grid gap-2" aria-hidden>
                {outcomes.map((o) => (
                  <div key={o.label} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{o.label}</span>
                    <div className="h-3 overflow-hidden rounded-full bg-surface-muted">
                      <div className={`h-full ${o.bar}`} style={{ width: `${(o.value / max) * 100}%` }} />
                    </div>
                    <span className="text-right tabular">{formatNumber(o.value)}</span>
                  </div>
                ))}
              </div>
              <Table>
                <caption className="sr-only">Lead review numbers</caption>
                <THead>
                  <TR>
                    <TH scope="col" className="text-right">Discovered</TH>
                    <TH scope="col" className="text-right">Pending review</TH>
                    <TH scope="col" className="text-right">Needs review</TH>
                    <TH scope="col" className="text-right">Approved</TH>
                    <TH scope="col" className="text-right">Rejected</TH>
                    <TH scope="col" className="text-right">Merged</TH>
                    <TH scope="col" className="text-right">Outreach started</TH>
                    <TH scope="col" className="text-right">Median turnaround</TH>
                  </TR>
                </THead>
                <TBody>
                  <TR>
                    <TD className="text-right tabular">{formatNumber(s.discovered)}</TD>
                    <TD className="text-right tabular">{formatNumber(s.pending_review)}</TD>
                    <TD className="text-right tabular">{formatNumber(s.needs_review)}</TD>
                    <TD className="text-right tabular">{formatNumber(s.approved)}</TD>
                    <TD className="text-right tabular">{formatNumber(s.rejected)}</TD>
                    <TD className="text-right tabular">{formatNumber(s.merged)}</TD>
                    <TD className="text-right tabular">{formatNumber(s.outreach_started)}</TD>
                    <TD className="text-right tabular">{fmtHours(s.median_review_hours)}</TD>
                  </TR>
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}
