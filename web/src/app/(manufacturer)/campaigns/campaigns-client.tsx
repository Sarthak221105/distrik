"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Plus } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import { formatDate, formatNumber } from "@/lib/format";
import { useRealtime } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { StatusBadge } from "@/components/domain/badges";
import { sumFunnel } from "@/components/manufacturer/charts";
import { unwrapList, useTrackScreen } from "@/components/manufacturer/hooks";

export function CampaignsClient() {
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  useTrackScreen("campaigns");

  const data = useQuery({
    queryKey: qk.campaigns(),
    queryFn: async () => {
      const [c, f, r] = await Promise.all([
        supabase
          .from("campaigns")
          .select("id, name, status, status_detail, stalled_step, target_count, target_city, target_state, created_at, launched_at, discovery_completed_at")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("v_funnel").select("*"),
        supabase.from("v_review_stats").select("*"),
      ]);
      return { campaigns: unwrapList(c), funnel: unwrapList(f), review: unwrapList(r) };
    },
  });

  useRealtime({ table: "campaigns", invalidate: [qk.campaigns()] });

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Campaigns"
        description="One campaign per market instruction. The AI finds, cleans, researches and scores buyers; your team approves them in Lead Review before anyone is contacted."
        actions={
          <Button asChild>
            <Link href="/campaigns/new">
              <Plus aria-hidden /> Start Sales
            </Link>
          </Button>
        }
      />
      {data.isLoading ? (
        <LoadingSkeleton variant="table" rows={5} />
      ) : data.error ? (
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      ) : data.data!.campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone aria-hidden />}
          title="No campaigns yet"
          description="Describe a market in plain language, for example “Find 75 grocery distributors in Indore for our mustard oil”."
          action={
            <Button asChild>
              <Link href="/campaigns/new">Start Sales</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <caption className="sr-only">Campaigns</caption>
            <THead>
              <TR>
                <TH scope="col">Campaign</TH>
                <TH scope="col">Market</TH>
                <TH scope="col">Status</TH>
                <TH scope="col" className="w-48">Discovered</TH>
                <TH scope="col" className="text-right">Awaiting review</TH>
                <TH scope="col" className="text-right">Approved</TH>
                <TH scope="col" className="text-right">Contacted</TH>
                <TH scope="col" className="text-right">Qualified</TH>
                <TH scope="col" className="text-right">Ordered</TH>
                <TH scope="col">Started</TH>
              </TR>
            </THead>
            <TBody>
              {data.data!.campaigns.map((c) => {
                const f = sumFunnel(data.data!.funnel.filter((r) => r.campaign_id === c.id));
                const rs = data.data!.review.find((r) => r.campaign_id === c.id);
                const discovered = Number(rs?.discovered ?? 0);
                const awaiting = Number(rs?.pending_review ?? 0) + Number(rs?.needs_review ?? 0);
                const pct = c.target_count ? Math.min(100, (discovered / c.target_count) * 100) : 0;
                return (
                  <TR key={c.id} className="cursor-pointer" onClick={() => router.push(`/campaigns/${c.id}`)}>
                    <TD>
                      <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                      {c.status_detail && <p className="text-xs text-muted-foreground">{c.status_detail}</p>}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {c.target_city}
                      {c.target_state ? <span className="text-muted-foreground">, {c.target_state}</span> : null}
                    </TD>
                    <TD>
                      <div className="grid gap-1">
                        <StatusBadge status={c.status} />
                        {c.stalled_step && <span className="text-xs text-danger">Stalled at {c.stalled_step}</span>}
                      </div>
                    </TD>
                    <TD>
                      <Progress value={pct} label={`${discovered} of ${c.target_count} prospects discovered`} />
                      <span className="text-xs text-muted-foreground tabular">
                        {formatNumber(discovered)} / {formatNumber(c.target_count)} discovered
                      </span>
                    </TD>
                    <TD className="text-right tabular">
                      {awaiting > 0 ? (
                        <Link href={`/leads?campaign=${c.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                          {formatNumber(awaiting)}
                          <span className="sr-only"> awaiting review, open Lead Review</span>
                        </Link>
                      ) : (
                        "0"
                      )}
                    </TD>
                    <TD className="text-right tabular">{formatNumber(Number(rs?.approved ?? 0))}</TD>
                    <TD className="text-right tabular">{formatNumber(f.contacted)}</TD>
                    <TD className="text-right tabular">{formatNumber(f.qualified)}</TD>
                    <TD className="text-right tabular">{formatNumber(f.ordered)}</TD>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDate(c.created_at)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
