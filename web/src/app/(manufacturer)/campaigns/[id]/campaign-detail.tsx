"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Info, Loader2, PanelRight, Rocket, Send, Users, X } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatDate, formatINR, formatNumber, titleCase } from "@/lib/format";
import { can } from "@/lib/permissions";
import { useRpc } from "@/hooks/use-rpc";
import { useRealtime } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfidenceTag, ConsentTag, FitScoreBadge, ReviewStatusBadge, StagePill } from "@/components/domain/badges";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader, Skeleton } from "@/components/domain/states";
import { CampaignProgress } from "@/components/manufacturer/campaign-progress";
import { ProspectFitSheet } from "@/components/manufacturer/prospect-fit-sheet";
import { ReviewCountsCard, useReviewStats } from "@/components/manufacturer/review-stats";
import { isProcessing, primaryContact, whatsappConsent, type LeadContact } from "@/components/manufacturer/lead-shared";
import { unwrapList, useTeam, useTrackScreen, trackEvent } from "@/components/manufacturer/hooks";
import { useViewer } from "@/components/providers";
import type { Json } from "@/lib/database.types";

const MarketMap = dynamic(() => import("@/components/manufacturer/market-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] w-full" />,
});

const PAGE = 100;

type Filter = "all" | "pending" | "needs_review" | "approved" | "rejected" | "released";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending Review" },
  { value: "needs_review", label: "Needs Review" },
  { value: "approved", label: "Approved, not released" },
  { value: "released", label: "Released" },
  { value: "rejected", label: "Rejected" },
];

type ProspectRow = {
  id: string;
  name: string;
  type: string;
  city: string | null;
  fit_score: number | null;
  confidence: string;
  stage: string;
  review_status: string;
  pipeline_step: string;
  assigned_rep_id: string | null;
  outreach_approved: boolean;
  contacts: LeadContact[];
};

type LaunchResult = { ai_openers: number; rep_tasks: number; skipped_not_approved: number };

export function CampaignDetail({ id }: { id: string }) {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const team = useTeam();
  useTrackScreen("campaign_detail", { campaign_id: id });
  const canLaunch = can(viewer, "launch_campaigns");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<string | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [rep, setRep] = useState("");
  const [minFit, setMinFit] = useState("0");
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [result, setResult] = useState<LaunchResult | null>(null);

  const campaign = useQuery({
    queryKey: qk.campaign(id),
    queryFn: async () => {
      const c = unwrap(await supabase.from("campaigns").select("*").eq("id", id).maybeSingle());
      if (!c) return null;
      const [jobs, products] = await Promise.all([
        supabase
          .from("campaign_jobs")
          .select("id, step, status, records, error, attempts, started_at, finished_at, source:sources(name)")
          .eq("campaign_id", id)
          .order("created_at"),
        c.product_ids.length
          ? supabase.from("products").select("id, name, sku, distributor_price_paise, unit").in("id", c.product_ids)
          : Promise.resolve({ data: [], error: null }),
      ]);
      return { campaign: c, jobs: unwrapList(jobs), products: unwrapList(products) };
    },
  });

  const stats = useReviewStats(id);

  const listKey = qk.prospects({ campaign: id, filter });
  const prospects = useInfiniteQuery({
    queryKey: listKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("prospects")
        .select(
          "id, name, type, city, fit_score, confidence, stage, review_status, pipeline_step, assigned_rep_id, outreach_approved, contacts(id, name, is_primary, phone_e164, consents(status, channel))",
        )
        .eq("campaign_id", id)
        .neq("review_status", "merged")
        .order("fit_score", { ascending: false, nullsFirst: false })
        .order("name")
        .range(pageParam, pageParam + PAGE - 1);
      if (filter === "pending" || filter === "needs_review") q = q.eq("review_status", filter).eq("pipeline_step", "done");
      if (filter === "rejected") q = q.eq("review_status", "rejected");
      if (filter === "approved") q = q.eq("review_status", "approved").eq("outreach_approved", false);
      if (filter === "released") q = q.eq("outreach_approved", true);
      return unwrapList(await q) as unknown as ProspectRow[];
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });

  const points = useQuery({
    queryKey: qk.prospects({ campaign: id, view: "map" }),
    queryFn: async () =>
      unwrapList(
        await supabase
          .from("prospects")
          .select("id, name, lat, lng, fit_score, stage, outreach_approved, review_status")
          .eq("campaign_id", id)
          .neq("review_status", "merged")
          .limit(2000),
      ),
  });

  useRealtime({ table: "campaigns", filter: `id=eq.${id}`, invalidate: [qk.campaign(id)] });
  useRealtime({
    table: "prospects",
    filter: `campaign_id=eq.${id}`,
    invalidate: [qk.prospects({ campaign: id }), qk.campaign(id), ["review-stats"]],
  });

  const rows = useMemo(() => prospects.data?.pages.flat() ?? [], [prospects.data]);
  const approvedUnreleased = (points.data ?? []).filter((p) => p.review_status === "approved" && !p.outreach_approved);
  const stillInReview = (points.data ?? []).filter((p) => p.review_status === "pending" || p.review_status === "needs_review").length;
  const launchCount = approvedUnreleased.filter((p) => Number(p.fit_score ?? 0) >= Number(minFit || 0)).length;
  const selectableIds = rows.filter((r) => r.review_status === "approved" && !r.outreach_approved).map((r) => r.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((x) => selected.has(x));

  const consentMix = useMemo(() => {
    let optedIn = 0;
    let other = 0;
    for (const r of rows) {
      if (!selected.has(r.id)) continue;
      if (whatsappConsent(primaryContact(r.contacts)) === "opted_in") optedIn++;
      else other++;
    }
    return { optedIn, other };
  }, [rows, selected]);

  const toResult = (d: unknown): LaunchResult => {
    const r = (d ?? {}) as Record<string, Json>;
    return { ai_openers: Number(r.ai_openers ?? 0), rep_tasks: Number(r.rep_tasks ?? 0), skipped_not_approved: Number(r.skipped_not_approved ?? 0) };
  };
  const invalidate = [qk.prospects({ campaign: id }), qk.campaign(id), qk.campaigns(), ["review-stats"], ["leads"]];

  const approve = useRpc(
    async (vars: { ids: string[]; rep: string }) =>
      unwrap(await supabase.rpc("approve_outreach", { p_prospect_ids: vars.ids, p_rep: vars.rep || undefined })),
    {
      invalidate,
      success: "Outreach approved",
      onSuccess: (d, v) => {
        setResult(toResult(d));
        setSelected(new Set());
        setApproveOpen(false);
        setLaunchError(null);
        void trackEvent(viewer, "outreach_approved", { campaign_id: id, count: v.ids.length });
      },
      onError: (e) => setLaunchError(e.message),
    },
  );

  const launch = useRpc(
    async (fit: number) => unwrap(await supabase.rpc("launch_campaign", { p_campaign: id, p_min_fit: fit })),
    {
      invalidate,
      success: "Approved prospects launched",
      onSuccess: (d, fit) => {
        setResult(toResult(d));
        setLaunchOpen(false);
        setLaunchError(null);
        void trackEvent(viewer, "campaign_launched", { campaign_id: id, min_fit: fit });
      },
      onError: (e) => setLaunchError(e.message),
    },
  );

  if (campaign.isLoading) return <LoadingSkeleton variant="detail" />;
  if (campaign.error) return <ErrorState error={campaign.error} onRetry={() => campaign.refetch()} />;
  if (!campaign.data)
    return (
      <EmptyState
        title="Campaign not found"
        description="It may have been removed, or it belongs to another account."
        action={
          <Button asChild variant="outline">
            <Link href="/campaigns">Back to campaigns</Link>
          </Button>
        }
      />
    );

  const { campaign: c, jobs, products } = campaign.data;
  const closed = c.status === "completed" || c.status === "paused";
  const launchDisabledReason = !canLaunch
    ? "You do not have the Launch outreach permission. Ask the owner to grant it in Settings, Team."
    : closed
      ? `This campaign is ${c.status}.`
      : approvedUnreleased.length === 0
        ? "No approved prospects waiting for release. Approve prospects in Lead Review first."
        : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        back={
          <Link href="/campaigns" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <ArrowLeft className="size-3" aria-hidden /> Campaigns
          </Link>
        }
        title={c.name}
        description={
          <>
            {c.target_city}
            {c.target_state ? `, ${c.target_state}` : ""} · target {formatNumber(c.target_count)} prospects · started {formatDate(c.created_at)}
          </>
        }
        actions={
          <Button onClick={() => setLaunchOpen(true)} disabled={!!launchDisabledReason} title={launchDisabledReason ?? undefined}>
            <Rocket aria-hidden /> Launch approved prospects
          </Button>
        }
      />

      {launchDisabledReason && !canLaunch && (
        <p className="-mt-4 text-xs text-muted-foreground" role="note">
          {launchDisabledReason}
        </p>
      )}

      {result && (
        <div role="status" className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-success/40 bg-success-soft px-3 py-2 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <div>
              <p className="font-medium">Outreach released</p>
              <ul className="grid gap-0.5">
                <li>
                  <strong className="tabular">{result.ai_openers}</strong> opted in contact{result.ai_openers === 1 ? "" : "s"}: AI opener queued through an approved template
                </li>
                <li>
                  <strong className="tabular">{result.rep_tasks}</strong> without opt in: sent to a rep to call and share a click to chat link
                </li>
                {result.skipped_not_approved > 0 && (
                  <li>
                    <strong className="tabular">{result.skipped_not_approved}</strong> skipped because they are not approved
                  </li>
                )}
              </ul>
            </div>
          </div>
          <Button size="icon" variant="ghost" aria-label="Dismiss" onClick={() => setResult(null)}>
            <X aria-hidden />
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardContent className="p-4">
            <CampaignProgress campaign={c} jobs={jobs} approved={stats.data?.approved ?? null} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Objective</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className="text-muted-foreground">“{c.objective_text}”</p>
            <ul className="grid gap-1">
              {products.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>{p.name}</span>
                  <span className="text-muted-foreground tabular">{formatINR(p.distributor_price_paise)}/{p.unit}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <ReviewCountsCard campaignId={id} />

      <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
        <div className="grid gap-1">
          <p>
            Only prospects your team <strong>approved</strong> in Lead Review can be released. You can launch them as soon as one is approved,
            even while others are still waiting for review; those stay untouched until someone approves them.
          </p>
          <p>
            Releasing never sends a cold WhatsApp broadcast. Contacts who have <strong>opted in</strong> get an AI opener through an approved
            template. Contacts with <strong>no consent</strong> go to a rep, who calls and shares a click to chat link; the AI takes over once the
            buyer writes back.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Market map</CardTitle>
          <CardDescription>Every prospect in this campaign. Select a marker to see why it scored the way it did.</CardDescription>
        </CardHeader>
        <CardContent>
          {points.error ? (
            <ErrorState error={points.error} onRetry={() => points.refetch()} />
          ) : points.isLoading ? (
            <Skeleton className="h-[420px] w-full" />
          ) : (
            <MarketMap points={points.data ?? []} onSelect={setPanel} />
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="prospects-h" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="prospects-h" className="text-base font-semibold">
            Prospects{" "}
            <span className="font-normal text-muted-foreground">
              ({formatNumber(points.data?.length ?? 0)} found · {formatNumber(stillInReview)} awaiting review · {formatNumber(approvedUnreleased.length)}{" "}
              approved, not released)
            </span>
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter prospects by review status">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => {
                setFilter(f.value);
                setSelected(new Set());
              }}
              className={`rounded-full border px-3 py-1 text-sm ${filter === f.value ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:bg-surface-muted"}`}
            >
              {filter === f.value ? "✓ " : ""}
              {f.label}
            </button>
          ))}
        </div>

        {selected.size > 0 && (
          <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-surface p-2 shadow-md" role="region" aria-label="Bulk actions">
            <span className="px-2 text-sm font-medium">{selected.size} approved selected</span>
            <Button size="sm" onClick={() => setApproveOpen(true)} disabled={!canLaunch} title={!canLaunch ? "You do not have the Launch outreach permission" : undefined}>
              <Send aria-hidden /> Approve outreach
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}

        {prospects.isLoading ? (
          <LoadingSkeleton variant="table" rows={8} />
        ) : prospects.error ? (
          <ErrorState error={prospects.error} onRetry={() => prospects.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users aria-hidden />}
            title={
              filter === "released"
                ? "Nothing released yet"
                : filter === "all"
                  ? "No prospects yet"
                  : `No prospects in ${FILTERS.find((f) => f.value === filter)?.label}`
            }
            description={
              filter === "released"
                ? "Select approved prospects and approve outreach, or use Launch approved prospects."
                : filter === "all"
                  ? (c.status_detail ?? "Discovered prospects appear here once they are cleaned and scored.")
                  : undefined
            }
            action={
              filter === "all" ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/leads?campaign=${id}&import=1`}>Import your own buyers</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Card>
            <Table>
              <caption className="sr-only">Prospects in this campaign</caption>
              <THead>
                <TR>
                  <TH scope="col" className="w-10">
                    <Checkbox
                      aria-label="Select all approved prospects not yet released"
                      checked={allSelected}
                      disabled={selectableIds.length === 0}
                      onCheckedChange={(v) => setSelected(v ? new Set(selectableIds) : new Set())}
                    />
                  </TH>
                  <TH scope="col">Prospect</TH>
                  <TH scope="col">Review</TH>
                  <TH scope="col">City</TH>
                  <TH scope="col">Fit</TH>
                  <TH scope="col">Data</TH>
                  <TH scope="col">Consent</TH>
                  <TH scope="col">Stage</TH>
                  <TH scope="col">Rep</TH>
                  <TH scope="col">
                    <span className="sr-only">Fit details</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const contact = primaryContact(r.contacts);
                  const consent = whatsappConsent(contact);
                  const repName = r.assigned_rep_id ? team.byId.get(r.assigned_rep_id)?.full_name : null;
                  const selectable = r.review_status === "approved" && !r.outreach_approved;
                  return (
                    <TR key={r.id} data-state={selected.has(r.id) ? "selected" : undefined} className="data-[state=selected]:bg-primary-soft/40">
                      <TD>
                        <Checkbox
                          aria-label={selectable ? `Select ${r.name}` : `${r.name} cannot be selected: ${r.outreach_approved ? "already released" : "not approved"}`}
                          checked={selected.has(r.id)}
                          disabled={!selectable}
                          onCheckedChange={(v) =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (v) n.add(r.id);
                              else n.delete(r.id);
                              return n;
                            })
                          }
                        />
                      </TD>
                      <TD>
                        {r.review_status === "approved" ? (
                          <Link href={`/prospects/${r.id}`} className="font-medium hover:underline">
                            {r.name}
                          </Link>
                        ) : (
                          <Link href={`/leads?campaign=${id}&status=all&id=${r.id}`} className="font-medium hover:underline">
                            {r.name}
                          </Link>
                        )}
                        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                          {titleCase(r.type)}
                          {r.outreach_approved && <Badge tone="primary">Released</Badge>}
                        </div>
                      </TD>
                      <TD>
                        {isProcessing(r) ? (
                          <Badge tone="info">
                            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> Processing
                          </Badge>
                        ) : (
                          <ReviewStatusBadge status={r.review_status} />
                        )}
                      </TD>
                      <TD className="whitespace-nowrap">{r.city ?? "–"}</TD>
                      <TD>
                        <FitScoreBadge score={r.fit_score} />
                      </TD>
                      <TD>
                        <ConfidenceTag confidence={r.confidence} />
                      </TD>
                      <TD>
                        {consent ? <ConsentTag status={consent} /> : <span className="text-xs text-muted-foreground">No contact</span>}
                        {consent && !contact?.phone_e164 && <p className="text-[11px] text-muted-foreground">No phone</p>}
                      </TD>
                      <TD>
                        <StagePill stage={r.stage} />
                      </TD>
                      <TD className="whitespace-nowrap text-sm">{repName ?? <span className="text-muted-foreground">–</span>}</TD>
                      <TD>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPanel(r.id)}
                          aria-label={`Why ${r.name} scored ${r.fit_score === null ? "no score" : Math.round(Number(r.fit_score))}`}
                        >
                          <PanelRight aria-hidden /> Why
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {prospects.hasNextPage && (
              <div className="flex justify-center border-t border-border p-3">
                <Button variant="outline" loading={prospects.isFetchingNextPage} onClick={() => prospects.fetchNextPage()}>
                  Load more
                </Button>
              </div>
            )}
          </Card>
        )}
      </section>

      <ProspectFitSheet prospectId={panel} onClose={() => setPanel(null)} />

      <Dialog open={approveOpen} onOpenChange={(o) => { setApproveOpen(o); if (!o) setLaunchError(null); }}>
        <DialogContent
          title={`Approve outreach for ${selected.size} prospect${selected.size === 1 ? "" : "s"}`}
          description="Each approved prospect is assigned to a rep and released for outreach."
        >
          <ul className="grid gap-1 text-sm">
            <li>
              <strong className="tabular">{consentMix.optedIn}</strong> opted in: the AI sends an opener through an approved template.
            </li>
            <li>
              <strong className="tabular">{consentMix.other}</strong> without opt in: a rep calls and shares a click to chat link.
            </li>
          </ul>
          <Field label="Assign to rep" htmlFor="approve-rep" hint="Leave on automatic to keep the current rep or pick the least loaded one.">
            <NativeSelect id="approve-rep" value={rep} onChange={(e) => setRep(e.target.value)}>
              <option value="">Automatic</option>
              {team.reps.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name ?? m.email}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {launchError && (
            <p className="text-sm text-danger" role="alert">
              {launchError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button loading={approve.isPending} onClick={() => approve.mutate({ ids: Array.from(selected), rep })}>
              Approve outreach
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={launchOpen} onOpenChange={(o) => { setLaunchOpen(o); if (!o) setLaunchError(null); }}>
        <DialogContent
          title="Launch approved prospects"
          description="Releases every prospect your team approved and that is not yet released, at or above the minimum fit."
        >
          <Field label="Minimum fit score" htmlFor="min-fit" hint="0 releases every approved prospect">
            <Input id="min-fit" inputMode="numeric" value={minFit} onChange={(e) => setMinFit(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} />
          </Field>
          <p className="text-sm">
            <strong className="tabular">{launchCount}</strong> of {approvedUnreleased.length} approved prospects will be released. Opted in
            contacts get an AI opener; everyone else goes to a rep for a call and a click to chat link.
          </p>
          {stillInReview > 0 && (
            <p className="text-sm text-muted-foreground">
              {formatNumber(stillInReview)} prospect{stillInReview === 1 ? " is" : "s are"} still awaiting review and will not be contacted. You can
              launch them later, once approved.
            </p>
          )}
          {launchError && (
            <p className="text-sm text-danger" role="alert">
              {launchError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLaunchOpen(false)}>
              Cancel
            </Button>
            <Button loading={launch.isPending} disabled={launchCount === 0} onClick={() => launch.mutate(Number(minFit || 0))}>
              <Rocket aria-hidden /> Launch {launchCount}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
