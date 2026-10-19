"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, KanbanSquare } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { t } from "@/lib/i18n";
import { useRpc } from "@/hooks/use-rpc";
import { useRealtime } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Label, NativeSelect } from "@/components/ui/input";
import { EmptyState, ErrorState, Skeleton } from "@/components/domain/states";
import { STAGES, StagePill } from "@/components/domain/badges";
import { ProspectCard, type PipelineProspect } from "@/components/manufacturer/prospect-card";
import { stageBlockReason, useStageTransitions, type Stage } from "@/components/manufacturer/stage-menu";
import { unwrapList, useProductsLite, useTeam } from "@/components/manufacturer/hooks";
import { daysSince } from "@/components/manufacturer/time";
import { cn } from "@/lib/utils";

type BoardData = {
  prospects: PipelineProspect[];
  quoted: Map<string, number>;
  unread: Map<string, number>;
  campaignProducts: Map<string, string[]>;
  negotiationProducts: Map<string, Set<string>>;
};

const KEY = qk.prospects({ view: "pipeline" });
const COLUMN_LIMIT = 40;

export function PipelineBoard() {
  const supabase = getSupabaseBrowser();
  const qc = useQueryClient();
  const team = useTeam();
  const products = useProductsLite();
  const { allowed } = useStageTransitions();
  const [city, setCity] = useState("");
  const [rep, setRep] = useState("");
  const [product, setProduct] = useState("");
  const [showLost, setShowLost] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Stage | null>(null);
  const [moving, setMoving] = useState<Set<string>>(new Set());

  const board = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<BoardData> => {
      const [p, q, c, cmp, neg] = await Promise.all([
        supabase
          .from("prospects")
          .select("id, name, city, type, stage, stage_changed_at, fit_score, assigned_rep_id, campaign_id, is_stale")
          .eq("review_status", "approved")
          .order("stage_changed_at", { ascending: false })
          .limit(2000),
        supabase
          .from("quotations")
          .select("prospect_id, total_paise, created_at, status")
          .neq("status", "superseded")
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase.from("conversations").select("prospect_id, unread_count").gt("unread_count", 0),
        supabase.from("campaigns").select("id, product_ids"),
        supabase.from("negotiations").select("prospect_id, product_id"),
      ]);
      const quoted = new Map<string, number>();
      for (const r of unwrapList(q)) if (!quoted.has(r.prospect_id)) quoted.set(r.prospect_id, r.total_paise);
      const unread = new Map<string, number>();
      for (const r of unwrapList(c)) unread.set(r.prospect_id, (unread.get(r.prospect_id) ?? 0) + r.unread_count);
      const campaignProducts = new Map<string, string[]>();
      for (const r of unwrapList(cmp)) campaignProducts.set(r.id, r.product_ids);
      const negotiationProducts = new Map<string, Set<string>>();
      for (const r of unwrapList(neg)) {
        if (!negotiationProducts.has(r.prospect_id)) negotiationProducts.set(r.prospect_id, new Set());
        negotiationProducts.get(r.prospect_id)!.add(r.product_id);
      }
      return { prospects: unwrapList(p) as PipelineProspect[], quoted, unread, campaignProducts, negotiationProducts };
    },
  });

  useRealtime({ table: "prospects", invalidate: [qk.prospects()] });
  useRealtime({ table: "conversations", invalidate: [KEY] });

  const move = useRpc(
    async (vars: { id: string; from: Stage; to: Stage }) =>
      unwrap(await supabase.rpc("set_stage", { p_prospect: vars.id, p_to: vars.to })),
    {
      success: (_d, v) => `Moved to ${t(`stage.${v.to}`)}`,
      onSuccess: (_d, v) => {
        setMoving((s) => {
          const n = new Set(s);
          n.delete(v.id);
          return n;
        });
        qc.invalidateQueries({ queryKey: qk.prospect(v.id) });
        qc.invalidateQueries({ queryKey: qk.prospectEvents(v.id) });
      },
      onError: (_e, v) => {
        // Roll back the optimistic move.
        qc.setQueryData<BoardData>(KEY, (old) =>
          old
            ? { ...old, prospects: old.prospects.map((p) => (p.id === v.id ? { ...p, stage: v.from } : p)) }
            : old,
        );
        setMoving((s) => {
          const n = new Set(s);
          n.delete(v.id);
          return n;
        });
      },
    },
  );

  function requestMove(p: PipelineProspect, to: Stage) {
    const reason = stageBlockReason(p.stage, to, allowed);
    if (reason) {
      if (p.stage !== to) toast.error(`${p.name}: ${reason}`);
      return;
    }
    qc.setQueryData<BoardData>(KEY, (old) =>
      old
        ? {
            ...old,
            prospects: old.prospects.map((x) =>
              x.id === p.id ? { ...x, stage: to, stage_changed_at: new Date().toISOString() } : x,
            ),
          }
        : old,
    );
    setMoving((s) => new Set(s).add(p.id));
    move.mutate({ id: p.id, from: p.stage, to });
  }

  const cities = useMemo(
    () => Array.from(new Set((board.data?.prospects ?? []).map((p) => p.city).filter(Boolean) as string[])).sort(),
    [board.data],
  );

  const filtered = useMemo(() => {
    const d = board.data;
    if (!d) return [];
    return d.prospects.filter((p) => {
      if (city && p.city !== city) return false;
      if (rep === "__none" ? p.assigned_rep_id : rep && p.assigned_rep_id !== rep) return false;
      if (product) {
        const inCampaign = p.campaign_id ? d.campaignProducts.get(p.campaign_id)?.includes(product) : false;
        const inNegotiation = d.negotiationProducts.get(p.id)?.has(product);
        if (!inCampaign && !inNegotiation) return false;
      }
      return true;
    });
  }, [board.data, city, rep, product]);

  const columns: Stage[] = showLost ? [...STAGES, "lost"] : [...STAGES];
  const byStage = useMemo(() => {
    const m = new Map<string, PipelineProspect[]>();
    for (const p of filtered) {
      if (!m.has(p.stage)) m.set(p.stage, []);
      m.get(p.stage)!.push(p);
    }
    return m;
  }, [filtered]);
  const lostCount = byStage.get("lost")?.length ?? 0;
  const now = useMemo(() => (board.dataUpdatedAt ? board.dataUpdatedAt : 0), [board.dataUpdatedAt]);

  if (board.isLoading) {
    return (
      <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label="Loading pipeline">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid w-64 shrink-0 content-start gap-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ))}
      </div>
    );
  }
  if (board.error) return <ErrorState error={board.error} onRetry={() => board.refetch()} />;
  if (board.data!.prospects.length === 0) {
    return (
      <EmptyState
        icon={<KanbanSquare aria-hidden />}
        title="Your pipeline is empty"
        description="Prospects appear here once your team approves them in Lead Review."
        action={
          <Button asChild size="sm">
            <Link href="/leads">Open Lead Review</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filters">
        <div className="grid gap-1">
          <Label htmlFor="pf-city" className="text-xs text-muted-foreground">City</Label>
          <NativeSelect id="pf-city" value={city} onChange={(e) => setCity(e.target.value)} className="w-40">
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="pf-rep" className="text-xs text-muted-foreground">Rep</Label>
          <NativeSelect id="pf-rep" value={rep} onChange={(e) => setRep(e.target.value)} className="w-44">
            <option value="">All reps</option>
            <option value="__none">Unassigned</option>
            {(team.data ?? [])
              .filter((m) => m.role === "rep")
              .map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.full_name ?? m.email}</option>
              ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="pf-product" className="text-xs text-muted-foreground">Product</Label>
          <NativeSelect id="pf-product" value={product} onChange={(e) => setProduct(e.target.value)} className="w-52">
            <option value="">All products</option>
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </NativeSelect>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowLost((v) => !v)} aria-pressed={showLost}>
          {showLost ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
          {showLost ? "Hide" : "Show"} lost ({lostCount})
        </Button>
        {(city || rep || product) && (
          <Button variant="ghost" size="sm" onClick={() => { setCity(""); setRep(""); setProduct(""); }}>
            Clear filters
          </Button>
        )}
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {filtered.length} prospects. Drag cards or use the move button on each card.
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {columns.map((stage) => {
          const items = byStage.get(stage) ?? [];
          const isExpanded = expanded.has(stage);
          const visible = isExpanded ? items : items.slice(0, COLUMN_LIMIT);
          const dragged = dragging ? filtered.find((p) => p.id === dragging) : null;
          const blocked = dragged ? stageBlockReason(dragged.stage, stage, allowed) : null;
          return (
            <section
              key={stage}
              aria-label={`${t(`stage.${stage}`)}, ${items.length} prospects`}
              className={cn(
                "flex w-72 shrink-0 flex-col gap-2 rounded-lg bg-surface-muted/60 p-2 transition-colors",
                dropTarget === stage && !blocked && "bg-primary-soft ring-2 ring-primary",
                dropTarget === stage && blocked && dragged?.stage !== stage && "ring-2 ring-danger/50",
              )}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = blocked ? "none" : "move";
                setDropTarget(stage);
              }}
              onDragLeave={() => setDropTarget((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragging;
                setDropTarget(null);
                setDragging(null);
                const p = filtered.find((x) => x.id === id);
                if (p) requestMove(p, stage);
              }}
            >
              <header className="flex items-center justify-between px-1 py-1">
                <StagePill stage={stage} />
                <span className="text-xs font-medium text-muted-foreground tabular">{items.length}</span>
              </header>
              {dragged && blocked && dragged.stage !== stage && (
                <p className="px-1 text-[11px] text-danger">{blocked}</p>
              )}
              <ul className="grid gap-2">
                {visible.map((p) => (
                  <li key={p.id}>
                    <ProspectCard
                      prospect={p}
                      repName={p.assigned_rep_id ? (team.byId.get(p.assigned_rep_id)?.full_name ?? "Rep") : null}
                      quotedPaise={board.data!.quoted.get(p.id)}
                      unread={board.data!.unread.get(p.id)}
                      daysInStage={daysSince(p.stage_changed_at, now || undefined)}
                      onMove={(to) => requestMove(p, to)}
                      pendingMove={moving.has(p.id)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", p.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(p.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
              {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">No prospects</p>}
              {items.length > COLUMN_LIMIT && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setExpanded((s) => {
                      const n = new Set(s);
                      if (n.has(stage)) n.delete(stage);
                      else n.add(stage);
                      return n;
                    })
                  }
                >
                  {isExpanded ? "Show fewer" : `Show all ${items.length}`}
                </Button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
