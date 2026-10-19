"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, ClipboardCheck, Info, Loader2, Search, Upload, UserPlus, X } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatNumber, formatPhone, timeAgo, titleCase } from "@/lib/format";
import { toE164 } from "@/lib/edge";
import { can } from "@/lib/permissions";
import { useRpc } from "@/hooks/use-rpc";
import { useRealtime } from "@/hooks/use-realtime";
import { useViewer } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfidenceTag, ConsentTag, FitScoreBadge, ReviewFlagBadge, ReviewStatusBadge } from "@/components/domain/badges";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { CsvImportDialog } from "@/components/manufacturer/csv-import";
import { LeadDrawer } from "@/components/manufacturer/lead-drawer";
import { AssignDialog, BulkResultDialog, ReasonDialog } from "@/components/manufacturer/lead-dialogs";
import { useTeam, useTrackScreen } from "@/components/manufacturer/hooks";
import {
  BUYER_TYPES,
  LEAD_INVALIDATE,
  LEAD_ROW_SELECT,
  REVIEW_TABS,
  isProcessing,
  isReviewTab,
  parseSkipped,
  primaryContact,
  sanitizeSearch,
  whatsappConsent,
  type BulkResult,
  type LeadRow,
  type ReviewTab,
} from "@/components/manufacturer/lead-shared";
import type { Json } from "@/lib/database.types";

const PAGE = 50;
const MAX_BULK = 500;

type Filters = {
  campaign: string;
  city: string;
  type: string;
  minFit: string;
  dupes: boolean;
  search: string;
};

type Supabase = ReturnType<typeof getSupabaseBrowser>;

/** Prospect ids whose contacts match a phone search, or null for a name search. */
async function phoneMatches(supabase: Supabase, search: string): Promise<string[] | null> {
  const digits = search.replace(/\D/g, "");
  if (digits.length < 4) return null;
  const e164 = toE164(search);
  const needle = e164 ? e164.slice(1) : digits;
  const res = await supabase.from("contacts").select("prospect_id").ilike("phone_e164", `%${needle}%`).limit(500);
  return Array.from(new Set((unwrap(res) ?? []).map((r) => r.prospect_id)));
}

function leadQuery(
  supabase: Supabase,
  select: string,
  f: Filters,
  phoneIds: string[] | null,
  opts?: { count?: "exact"; head?: boolean },
) {
  let q = supabase.from("prospects").select(select, opts).neq("review_status", "merged");
  if (f.campaign) q = q.eq("campaign_id", f.campaign);
  const city = sanitizeSearch(f.city);
  if (city) q = q.ilike("city", `%${city}%`);
  if (f.type) q = q.eq("type", f.type);
  const minFit = Number(f.minFit);
  if (f.minFit && Number.isFinite(minFit) && minFit > 0) q = q.gte("fit_score", minFit);
  if (f.dupes) q = q.contains("review_flags", ["possible_duplicate"]);
  const term = sanitizeSearch(f.search);
  if (phoneIds) q = phoneIds.length ? q.in("id", phoneIds) : q.eq("id", "00000000-0000-0000-0000-000000000000");
  else if (term) q = q.ilike("name", `%${term}%`);
  return q;
}

function withStatus<Q extends ReturnType<typeof leadQuery>>(q: Q, status: ReviewTab): Q {
  if (status === "pending" || status === "needs_review") return q.eq("review_status", status).eq("pipeline_step", "done") as Q;
  if (status === "approved" || status === "rejected") return q.eq("review_status", status) as Q;
  return q;
}

type BulkKind = "approve" | "reject" | "assign";

export function LeadsClient() {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const team = useTeam();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  useTrackScreen("lead_review");

  const canReview = can(viewer, "review_leads");
  const canAssign = can(viewer, "assign_leads");
  const canOverride = can(viewer, "override_reviews");

  // URL driven state (notification links land here)
  const status: ReviewTab = isReviewTab(params.get("status")) ? (params.get("status") as ReviewTab) : "pending";
  const campaign = params.get("campaign") ?? "";
  const openId = params.get("id");
  const importOpen = params.get("import") === "1";

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // Local filters
  const [city, setCity] = useState("");
  const [type, setType] = useState("");
  const [minFit, setMinFit] = useState("");
  const [dupes, setDupes] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [cityDebounced, setCityDebounced] = useState("");
  const [sort, setSort] = useState<"fit" | "created">("fit");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkKind | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(h);
  }, [searchInput]);
  useEffect(() => {
    const h = setTimeout(() => setCityDebounced(city), 300);
    return () => clearTimeout(h);
  }, [city]);

  const filters: Filters = useMemo(
    () => ({ campaign, city: cityDebounced, type, minFit, dupes, search }),
    [campaign, cityDebounced, type, minFit, dupes, search],
  );
  const filterKey = JSON.stringify(filters);

  // Reset paging and selection whenever the filters or tab change.
  const [lastKey, setLastKey] = useState(`${filterKey}|${status}`);
  if (lastKey !== `${filterKey}|${status}`) {
    setLastKey(`${filterKey}|${status}`);
    setPage(0);
    setSelected(new Set());
  }

  const campaigns = useQuery({
    queryKey: [...qk.campaigns(), "lead-filter"],
    queryFn: async () => unwrap(await supabase.from("campaigns").select("id, name, status").order("created_at", { ascending: false }).limit(300)) ?? [],
  });

  const counts = useQuery({
    queryKey: qk.leads({ counts: filters }),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const phoneIds = await phoneMatches(supabase, filters.search);
      const head = { count: "exact" as const, head: true };
      const results = await Promise.all([
        ...REVIEW_TABS.map((t) => withStatus(leadQuery(supabase, "id", filters, phoneIds, head), t.value)),
        leadQuery(supabase, "id", filters, phoneIds, head).neq("pipeline_step", "done"),
      ]);
      const out: Record<string, number> = {};
      results.forEach((r, i) => {
        unwrap(r);
        out[i < REVIEW_TABS.length ? REVIEW_TABS[i]!.value : "processing"] = r.count ?? 0;
      });
      return out;
    },
  });

  const list = useQuery({
    queryKey: qk.leads({ list: filters, status, page, sort }),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const phoneIds = await phoneMatches(supabase, filters.search);
      let q = withStatus(leadQuery(supabase, LEAD_ROW_SELECT, filters, phoneIds, { count: "exact" }), status);
      q = sort === "fit" ? q.order("fit_score", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }) : q.order("created_at", { ascending: false });
      const res = await q.range(page * PAGE, page * PAGE + PAGE - 1);
      const rows = (unwrap(res) ?? []) as unknown as LeadRow[];
      return { rows, total: res.count ?? rows.length };
    },
  });

  const mid = viewer.manufacturerId;
  useRealtime({ table: "prospects", filter: `manufacturer_id=eq.${mid}`, enabled: !!mid, invalidate: [["leads"], ["lead"], ["review-stats"]] });
  useRealtime({ table: "merge_candidates", filter: `manufacturer_id=eq.${mid}`, enabled: !!mid, invalidate: [["duplicates"], ["leads"]] });
  useRealtime({ table: "prospect_reviews", filter: `manufacturer_id=eq.${mid}`, enabled: !!mid, invalidate: [["lead-reviews"]] });

  const rows = useMemo(() => list.data?.rows ?? [], [list.data]);
  const total = list.data?.total ?? 0;
  const pageIds = rows.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((x) => selected.has(x));
  const somePageSelected = pageIds.some((x) => selected.has(x));

  const selectAllMatching = useRpc(
    async () => {
      const phoneIds = await phoneMatches(supabase, filters.search);
      const res = await withStatus(leadQuery(supabase, "id", filters, phoneIds), status).order("created_at", { ascending: false }).limit(MAX_BULK);
      return ((unwrap(res) ?? []) as unknown as { id: string }[]).map((r) => r.id);
    },
    { onSuccess: (ids) => setSelected(new Set(ids)) },
  );

  const closeBulk = () => {
    setBulk(null);
    setBulkError(null);
  };

  const review = useRpc(
    async (v: { decision: "approve" | "reject"; reason: string }) =>
      unwrap(await supabase.rpc("review_prospects", { p_ids: Array.from(selected), p_decision: v.decision, p_reason: v.reason || undefined })),
    {
      invalidate: LEAD_INVALIDATE.map((k) => [...k]),
      silentError: true,
      onSuccess: (data, v) => {
        const r = (data ?? {}) as Record<string, Json>;
        const done = Number(r.updated ?? 0);
        const skipped = parseSkipped(r.skipped);
        setResult({
          title: v.decision === "approve" ? "Bulk approve finished" : "Bulk reject finished",
          done,
          doneLabel: v.decision === "approve" ? "approved and eligible for outreach" : "rejected",
          unchanged: Math.max(0, selected.size - done - skipped.length),
          skipped,
        });
        setSelected(new Set());
        setBulkReason("");
        closeBulk();
      },
      onError: (e) => setBulkError(e.message),
    },
  );

  const assign = useRpc(
    async (rep: string) => unwrap(await supabase.rpc("assign_prospects", { p_ids: Array.from(selected), p_rep: rep })),
    {
      invalidate: LEAD_INVALIDATE.map((k) => [...k]),
      silentError: true,
      onSuccess: (data) => {
        const r = (data ?? {}) as Record<string, Json>;
        const done = Number(r.assigned ?? 0);
        const skipped = parseSkipped(r.skipped);
        setResult({ title: "Bulk assign finished", done, doneLabel: "assigned. The rep has been notified.", unchanged: Math.max(0, selected.size - done - skipped.length), skipped });
        setSelected(new Set());
        closeBulk();
      },
      onError: (e) => setBulkError(e.message),
    },
  );

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) {
        if (n.size >= MAX_BULK) return n;
        n.add(id);
      } else n.delete(id);
      return n;
    });

  const filtersActive = !!(campaign || city || type || minFit || dupes || search);
  const campaignName = (campaigns.data ?? []).find((c) => c.id === campaign)?.name;

  return (
    // minmax(0, 1fr) lets the wide table scroll inside its card instead of widening the page.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <PageHeader
        title="Lead Review"
        description="Discovered buyers are cleaned, de-duplicated and scored automatically, then wait here. Only prospects your team approves can be contacted. Discovery and scoring are not approval."
        actions={
          canReview ? (
            <Button variant="outline" onClick={() => setParams({ import: "1" })}>
              <Upload aria-hidden /> Import buyers (CSV)
            </Button>
          ) : undefined
        }
      />

      {!canReview && (
        <p className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          You can view prospects but not approve or reject them. The owner can give you the Review leads permission in Settings, Team.
        </p>
      )}

      {/* Status tabs */}
      <div role="group" aria-label="Review status" className="flex flex-wrap gap-1 rounded-lg bg-surface-muted p-1">
        {REVIEW_TABS.map((t) => {
          const active = status === t.value;
          const n = counts.data?.[t.value];
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={active}
              onClick={() => setParams({ status: t.value === "pending" ? null : t.value })}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium ${active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
              <span className="rounded-full bg-surface-muted px-1.5 text-xs tabular">
                {n === undefined ? "…" : formatNumber(n)}
                <span className="sr-only"> prospects</span>
              </span>
            </button>
          );
        })}
      </div>
      {(counts.data?.processing ?? 0) > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          {formatNumber(counts.data!.processing)} more still being cleaned and scored. They appear in Pending Review when processing finishes (see All).
        </p>
      )}

      {/* Filters */}
      <Card className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Search" htmlFor="lead-search" className="lg:col-span-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input id="lead-search" className="pl-8" placeholder="Company name or phone" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
        </Field>
        <Field label="Campaign" htmlFor="lead-campaign">
          <NativeSelect id="lead-campaign" value={campaign} onChange={(e) => setParams({ campaign: e.target.value || null })}>
            <option value="">All campaigns</option>
            {campaign && !campaignName && <option value={campaign}>This campaign</option>}
            {(campaigns.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="City" htmlFor="lead-city">
          <Input id="lead-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Any city" />
        </Field>
        <Field label="Buyer type" htmlFor="lead-type">
          <NativeSelect id="lead-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {BUYER_TYPES.map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Minimum fit score" htmlFor="lead-minfit">
          <Input id="lead-minfit" inputMode="numeric" placeholder="0" value={minFit} onChange={(e) => setMinFit(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} />
        </Field>
        <div className="flex flex-wrap items-end gap-4 sm:col-span-2 lg:col-span-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={dupes} onCheckedChange={(v) => setDupes(v === true)} aria-label="Possible duplicates only" />
            Possible duplicates only
          </label>
          <div className="flex items-center gap-2">
            <Label htmlFor="lead-sort" className="text-sm font-normal text-muted-foreground">
              Sort by
            </Label>
            <NativeSelect id="lead-sort" className="w-44" value={sort} onChange={(e) => setSort(e.target.value as "fit" | "created")}>
              <option value="fit">Fit score (high first)</option>
              <option value="created">Newest first</option>
            </NativeSelect>
          </div>
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCity("");
                setType("");
                setMinFit("");
                setDupes(false);
                setSearchInput("");
                setParams({ campaign: null });
              }}
            >
              <X aria-hidden /> Clear filters
            </Button>
          )}
        </div>
      </Card>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 grid gap-2 rounded-lg border border-primary/40 bg-surface p-2 shadow-md" role="region" aria-label="Bulk actions">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 text-sm font-medium" aria-live="polite">
              {formatNumber(selected.size)} selected{selected.size >= MAX_BULK ? ` (maximum ${MAX_BULK})` : ""}
            </span>
            {canReview && (
              <>
                <Button size="sm" variant="success" onClick={() => setBulk("approve")}>
                  <Check aria-hidden /> Approve
                </Button>
                <Button size="sm" variant="outline" className="text-danger" onClick={() => setBulk("reject")}>
                  <X aria-hidden /> Reject
                </Button>
              </>
            )}
            {canAssign && (
              <Button size="sm" variant="outline" onClick={() => setBulk("assign")}>
                <UserPlus aria-hidden /> Assign to rep
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
          {allPageSelected && total > rows.length && selected.size < Math.min(total, MAX_BULK) && (
            <p className="px-2 text-xs">
              All {rows.length} on this page are selected.{" "}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => selectAllMatching.mutate(undefined)} disabled={selectAllMatching.isPending}>
                {selectAllMatching.isPending ? "Selecting…" : `Select all ${formatNumber(Math.min(total, MAX_BULK))} matching${total > MAX_BULK ? ` (first ${MAX_BULK})` : ""}`}
              </button>
            </p>
          )}
        </div>
      )}

      {/* Table */}
      {list.isLoading ? (
        <LoadingSkeleton variant="table" rows={10} />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck aria-hidden />}
          title={
            filtersActive
              ? "No prospects match these filters"
              : status === "pending"
                ? "Nothing waiting for review"
                : status === "needs_review"
                  ? "No prospects with warnings"
                  : status === "approved"
                    ? "No approved prospects yet"
                    : status === "rejected"
                      ? "No rejected prospects"
                      : "No prospects yet"
          }
          description={
            filtersActive
              ? "Clear a filter or try another search."
              : status === "pending" || status === "needs_review"
                ? "New prospects appear here as soon as discovery has cleaned and scored them."
                : "Start a campaign, or import your own buyer list, to fill Lead Review."
          }
          action={
            !filtersActive && (status === "all" || status === "pending") ? (
              <Button asChild size="sm">
                <Link href="/campaigns/new">Start Sales</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <Table aria-busy={list.isFetching}>
            <caption className="sr-only">
              Prospects, {REVIEW_TABS.find((t) => t.value === status)?.label}, page {page + 1}
            </caption>
            <THead>
              <TR>
                <TH scope="col" className="w-10">
                  <Checkbox
                    aria-label="Select all prospects on this page"
                    checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                    onCheckedChange={(v) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        for (const id of pageIds) {
                          if (v === true) {
                            if (n.size < MAX_BULK) n.add(id);
                          } else n.delete(id);
                        }
                        return n;
                      })
                    }
                  />
                </TH>
                <TH scope="col">Company</TH>
                <TH scope="col">Phone</TH>
                <TH scope="col">City</TH>
                <TH scope="col">Buyer type</TH>
                <TH scope="col">Fit</TH>
                <TH scope="col">Data</TH>
                <TH scope="col">Flags</TH>
                <TH scope="col">Consent</TH>
                <TH scope="col">Rep</TH>
                <TH scope="col">Status</TH>
                <TH scope="col">Last checked</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => {
                const contact = primaryContact(r.contacts);
                const consent = whatsappConsent(contact);
                const repName = r.assigned_rep_id ? (team.byId.get(r.assigned_rep_id)?.full_name ?? "Rep") : null;
                return (
                  <TR
                    key={r.id}
                    data-state={selected.has(r.id) ? "selected" : undefined}
                    className="cursor-pointer data-[state=selected]:bg-primary-soft/40"
                    onClick={() => setParams({ id: r.id })}
                  >
                    <TD onClick={(e) => e.stopPropagation()}>
                      <Checkbox aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onCheckedChange={(v) => toggle(r.id, v === true)} />
                    </TD>
                    <TD className="min-w-48">
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setParams({ id: r.id });
                        }}
                      >
                        {r.name}
                      </button>
                      <div className="text-xs text-muted-foreground">{contact?.name ?? "No contact name"}</div>
                    </TD>
                    <TD className="whitespace-nowrap">{contact?.phone_e164 ? formatPhone(contact.phone_e164) : <span className="text-muted-foreground">No phone</span>}</TD>
                    <TD className="whitespace-nowrap">{r.city ?? "–"}</TD>
                    <TD>
                      <div>{titleCase(r.type)}</div>
                      {r.category && <div className="text-xs text-muted-foreground">{r.category}</div>}
                    </TD>
                    <TD>
                      <FitScoreBadge score={r.fit_score} />
                    </TD>
                    <TD>
                      <ConfidenceTag confidence={r.confidence} />
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {r.review_flags.length === 0 ? <span className="text-xs text-muted-foreground">None</span> : r.review_flags.map((f) => <ReviewFlagBadge key={f} flag={f} />)}
                      </div>
                    </TD>
                    <TD>{consent ? <ConsentTag status={consent} /> : <span className="text-xs text-muted-foreground">No contact</span>}</TD>
                    <TD className="whitespace-nowrap text-sm">{repName ?? <span className="text-muted-foreground">–</span>}</TD>
                    <TD>
                      {isProcessing(r) ? (
                        <Badge tone="info">
                          <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> Processing
                        </Badge>
                      ) : (
                        <ReviewStatusBadge status={r.review_status} />
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-muted-foreground">{r.last_checked_at ? timeAgo(r.last_checked_at) : "Never"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3 text-sm">
            <span className="text-muted-foreground tabular">
              Showing {formatNumber(page * PAGE + 1)}–{formatNumber(page * PAGE + rows.length)} of {formatNumber(total)}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0 || list.isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ChevronLeft aria-hidden /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total || list.isFetching} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight aria-hidden />
              </Button>
            </div>
          </nav>
        </Card>
      )}

      <LeadDrawer prospectId={openId} onClose={() => setParams({ id: null })} onOpenProspect={(id) => setParams({ id })} />

      {canReview && <CsvImportDialog open={importOpen} onOpenChange={(o) => setParams({ import: o ? "1" : null })} defaultCampaign={campaign || undefined} />}

      {/* Bulk approve */}
      <Dialog open={bulk === "approve"} onOpenChange={(o) => !o && closeBulk()}>
        <DialogContent title={`Approve ${formatNumber(selected.size)} prospect${selected.size === 1 ? "" : "s"}?`} description="Approved prospects become eligible for outreach. Nothing is sent until someone launches outreach.">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setBulkError(null);
              review.mutate({ decision: "approve", reason: bulkReason.trim() });
            }}
          >
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              <li>Prospects still being processed and possible duplicates are skipped; you will see the list afterwards.</li>
              <li>Prospects already rejected are skipped{canOverride ? " unless you give an override reason below" : ""}.</li>
            </ul>
            {canOverride && (
              <Field label="Override reason (only needed to approve earlier rejections; audited)" htmlFor="bulk-approve-reason">
                <Textarea id="bulk-approve-reason" rows={2} value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} />
              </Field>
            )}
            {bulkError && (
              <p className="text-sm text-danger" role="alert">
                {bulkError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeBulk} disabled={review.isPending}>
                Cancel
              </Button>
              <Button type="submit" variant="success" loading={review.isPending}>
                Approve {formatNumber(selected.size)}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={bulk === "reject"}
        onOpenChange={(o) => !o && closeBulk()}
        title={`Reject ${formatNumber(selected.size)} prospect${selected.size === 1 ? "" : "s"}?`}
        description="Rejected prospects are never contacted. One reason is recorded for all of them."
        label="Why are they not a fit?"
        hint={canOverride ? "Approved prospects in the selection are overridden with this reason (audited)." : "Prospects already approved are skipped."}
        confirmLabel={`Reject ${formatNumber(selected.size)}`}
        variant="danger"
        pending={review.isPending}
        error={bulkError}
        onSubmit={(reason) => review.mutate({ decision: "reject", reason })}
      />

      {canAssign && (
        <AssignDialog open={bulk === "assign"} onOpenChange={(o) => !o && closeBulk()} count={selected.size} pending={assign.isPending} onSubmit={(rep) => assign.mutate(rep)} />
      )}

      <BulkResultDialog result={result} onClose={() => setResult(null)} />
    </div>
  );
}
