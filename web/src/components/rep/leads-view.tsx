"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CloudOff, Hand, Moon, Search, Users } from "lucide-react";
import { useViewer } from "@/components/providers";
import { FitScoreBadge } from "@/components/domain/badges";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { LeadRow } from "@/components/rep/rep-ui";
import { ALL_STAGES } from "@/components/rep/helpers";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { timeAgo } from "@/lib/format";
import { t } from "@/lib/i18n";
import { listLeadSnapshots } from "@/lib/offline/cache";
import { useDexieQuery, useOnline } from "@/lib/offline/hooks";
import { isNetworkError } from "@/lib/offline/network";
import type { LeadSnapshot } from "@/lib/offline/types";
import { cn } from "@/lib/utils";

// Work first: escalated, unread, stale, then the deals furthest along.
const STAGE_URGENCY: Record<string, number> = {
  negotiating: 0,
  quoted: 1,
  qualified: 2,
  engaged: 3,
  contacted: 4,
  new: 5,
  first_order: 6,
  repeat_order: 7,
  lost: 8,
};

export function LeadsView() {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const online = useOnline();
  const isManager = viewer.role === "owner" || viewer.role === "sales_head";
  const [onlyMine, setOnlyMine] = useState(true);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string>("all");
  const scopeMine = !isManager || onlyMine;

  const leads = useQuery({
    queryKey: qk.prospects({ surface: "rep", mine: scopeMine }),
    queryFn: async () => {
      let q = supabase
        .from("prospects")
        .select("id, name, city, type, stage, fit_score, is_stale, stage_changed_at, assigned_rep_id, conversations(unread_count, ai_paused)")
        .order("stage_changed_at", { ascending: false })
        .limit(300);
      if (isManager && onlyMine) q = q.eq("assigned_rep_id", viewer.userId);
      return unwrap(await q);
    },
  });

  const cached = useDexieQuery<LeadSnapshot[]>(() => listLeadSnapshots(viewer.userId), [viewer.userId], []);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (leads.data ?? [])
      .map((p) => {
        const convs = (p.conversations ?? []) as { unread_count: number; ai_paused: boolean }[];
        const unread = convs.reduce((s, c) => s + (c.unread_count ?? 0), 0);
        const paused = convs.some((c) => c.ai_paused);
        const urgency = paused ? 0 : unread > 0 ? 1 : p.is_stale ? 2 : 3 + (STAGE_URGENCY[p.stage] ?? 9);
        return { ...p, unread, paused, urgency };
      })
      .filter((p) => (stage === "all" ? true : p.stage === stage))
      .filter((p) => (!term ? true : p.name.toLowerCase().includes(term) || (p.city ?? "").toLowerCase().includes(term)))
      .sort((a, b) => a.urgency - b.urgency || b.stage_changed_at.localeCompare(a.stage_changed_at));
  }, [leads.data, search, stage]);

  const offlineFailure = leads.error && (!online || isNetworkError(leads.error));

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        <div className="relative">
          <Label htmlFor="lead-search" className="sr-only">
            Search leads
          </Label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="lead-search"
            type="search"
            placeholder="Search by name or city"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 pl-9"
          />
        </div>
        <div role="group" aria-label="Filter by stage" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {["all", ...ALL_STAGES].map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={stage === s}
              onClick={() => setStage(s)}
              className={cn(
                "inline-flex min-h-9 shrink-0 items-center rounded-full border px-3 text-xs font-medium",
                stage === s ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-muted-foreground",
              )}
            >
              {s === "all" ? "All stages" : t(`stage.${s}`)}
            </button>
          ))}
        </div>
        {isManager && (
          <div className="flex items-center gap-2">
            <Switch id="only-mine" checked={onlyMine} onCheckedChange={setOnlyMine} />
            <Label htmlFor="only-mine" className="font-normal">
              Only leads assigned to me
            </Label>
          </div>
        )}
      </div>

      {leads.isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : offlineFailure ? (
        <div className="grid gap-3">
          <EmptyState
            icon={<CloudOff aria-hidden />}
            title="Your lead list needs a connection"
            description={
              cached.length > 0
                ? "These leads you opened recently are saved on this phone and work offline."
                : "Open a lead while online and it will be saved for offline use."
            }
          />
          {cached.length > 0 && (
            <ul className="grid gap-2">
              {cached.map((s) => (
                <LeadRow
                  key={s.id}
                  href={`/rep/leads/${s.id}`}
                  name={s.lead.name}
                  city={s.lead.city}
                  stage={s.lead.stage}
                  meta={`saved ${timeAgo(new Date(s.savedAt))}`}
                />
              ))}
            </ul>
          )}
        </div>
      ) : leads.error ? (
        <ErrorState error={leads.error} onRetry={() => leads.refetch()} />
      ) : (leads.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden />}
          title={scopeMine ? "No leads assigned to you yet" : "No leads yet"}
          description={
            scopeMine
              ? "Leads are assigned when your manager approves outreach for a campaign. They will appear here."
              : "Prospects appear after a campaign passes QA and outreach is approved."
          }
          action={
            isManager && onlyMine ? (
              <Button variant="outline" onClick={() => setOnlyMine(false)}>
                Show all leads
              </Button>
            ) : undefined
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No leads match"
          description="Try another name or stage."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setStage("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {rows.length} lead{rows.length === 1 ? "" : "s"}
          </p>
          <ul className="grid gap-2">
            {rows.map((p) => (
              <LeadRow
                key={p.id}
                href={`/rep/leads/${p.id}`}
                name={p.name}
                city={p.city}
                stage={p.stage}
                meta={`moved ${timeAgo(p.stage_changed_at)}`}
                badge={
                  <>
                    {p.paused && (
                      <Badge tone="warning">
                        <Hand aria-hidden /> Needs you
                      </Badge>
                    )}
                    {p.unread > 0 && <Badge tone="info">{p.unread} unread</Badge>}
                    {p.is_stale && (
                      <Badge tone="neutral">
                        <Moon aria-hidden /> Stale
                      </Badge>
                    )}
                    <FitScoreBadge score={p.fit_score} />
                  </>
                }
              />
            ))}
          </ul>
          {(leads.data ?? []).length >= 300 && (
            <p className="text-center text-xs text-muted-foreground">
              Showing the 300 most recently moved leads. Search to narrow down
              {isManager && (
                <>
                  {" "}
                  or open the{" "}
                  <Link href="/pipeline" className="underline">
                    pipeline
                  </Link>{" "}
                  on the web app
                </>
              )}
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}
