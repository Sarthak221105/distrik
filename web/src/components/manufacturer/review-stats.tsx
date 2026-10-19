"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Upload } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import { formatNumber } from "@/lib/format";
import { can } from "@/lib/permissions";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, Skeleton } from "@/components/domain/states";
import { unwrapList } from "@/components/manufacturer/hooks";

export type ReviewTotals = {
  discovered: number;
  pending_review: number;
  needs_review: number;
  approved: number;
  rejected: number;
  merged: number;
  outreach_started: number;
  median_review_hours: number | null;
  dup_pending: number;
  dup_merged: number;
  dup_kept_separate: number;
};

type StatRow = Partial<Record<keyof ReviewTotals | "campaign_id", unknown>>;

export function sumReviewStats(
  review: StatRow[],
  dupes: { pending: number | null; merged: number | null; kept_separate: number | null }[],
): ReviewTotals {
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const t: ReviewTotals = {
    discovered: 0,
    pending_review: 0,
    needs_review: 0,
    approved: 0,
    rejected: 0,
    merged: 0,
    outreach_started: 0,
    median_review_hours: null,
    dup_pending: 0,
    dup_merged: 0,
    dup_kept_separate: 0,
  };
  let weighted = 0;
  let decided = 0;
  for (const r of review) {
    t.discovered += n(r.discovered);
    t.pending_review += n(r.pending_review);
    t.needs_review += n(r.needs_review);
    t.approved += n(r.approved);
    t.rejected += n(r.rejected);
    t.merged += n(r.merged);
    t.outreach_started += n(r.outreach_started);
    const d = n(r.approved) + n(r.rejected);
    if (r.median_review_hours !== null && r.median_review_hours !== undefined && d > 0) {
      weighted += Number(r.median_review_hours) * d;
      decided += d;
    }
  }
  // Across campaigns this is a decision-weighted average of the medians.
  t.median_review_hours = decided > 0 ? Math.round((weighted / decided) * 10) / 10 : null;
  for (const d of dupes) {
    t.dup_pending += n(d.pending);
    t.dup_merged += n(d.merged);
    t.dup_kept_separate += n(d.kept_separate);
  }
  return t;
}

/** Review counts from v_review_stats and v_duplicate_stats (one campaign, or all). */
export function useReviewStats(campaignId?: string) {
  const supabase = getSupabaseBrowser();
  return useQuery({
    queryKey: qk.reviewStats(campaignId),
    queryFn: async () => {
      let r = supabase.from("v_review_stats").select("*");
      let d = supabase.from("v_duplicate_stats").select("*");
      if (campaignId) {
        r = r.eq("campaign_id", campaignId);
        d = d.eq("campaign_id", campaignId);
      }
      const [review, dupes] = await Promise.all([r, d]);
      return sumReviewStats(unwrapList(review), unwrapList(dupes));
    },
  });
}

/** Campaign page card: where review stands, with a link into Lead Review. */
export function ReviewCountsCard({ campaignId }: { campaignId: string }) {
  const viewer = useViewer();
  const stats = useReviewStats(campaignId);
  const s = stats.data;
  const items: [string, number | undefined, string][] = [
    ["Awaiting review", s?.pending_review, "pending"],
    ["Needs review", s?.needs_review, "needs_review"],
    ["Approved", s?.approved, "approved"],
    ["Rejected", s?.rejected, "rejected"],
    ["Duplicates pending", s?.dup_pending, "needs_review"],
  ];
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle>Lead review</CardTitle>
          <CardDescription>Your team decides which discovered prospects can be contacted.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(viewer, "review_leads") && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/leads?campaign=${campaignId}&import=1`}>
                <Upload aria-hidden /> Import buyers (CSV)
              </Link>
            </Button>
          )}
          <Button asChild size="sm">
            <Link href={`/leads?campaign=${campaignId}`}>
              <ClipboardCheck aria-hidden /> Review leads
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {stats.isLoading ? (
          <Skeleton className="h-16" />
        ) : stats.error ? (
          <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {items.map(([label, value, status]) => (
              <div key={label} className="rounded-lg border border-border p-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd>
                  <Link href={`/leads?campaign=${campaignId}&status=${status}`} className="text-xl font-semibold tabular hover:underline">
                    {formatNumber(value ?? 0)}
                    <span className="sr-only"> {label}, open in Lead Review</span>
                  </Link>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
