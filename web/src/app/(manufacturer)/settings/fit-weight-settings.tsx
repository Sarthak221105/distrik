"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { useRpc } from "@/hooks/use-rpc";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { criterionLabel } from "@/components/manufacturer/fit-breakdown-panel";
import { manufacturerKey, useManufacturer } from "./company-settings";
import type { Json } from "@/lib/database.types";

const CRITERIA = [
  "category_match",
  "geographic_coverage",
  "brands_carried",
  "retail_network",
  "logistics",
  "territory_availability",
  "company_size",
] as const;

const DEFAULTS: Record<string, number> = {
  category_match: 25,
  geographic_coverage: 20,
  brands_carried: 15,
  retail_network: 15,
  logistics: 10,
  territory_availability: 10,
  company_size: 5,
};

export function FitWeightSettings() {
  const m = useManufacturer();
  if (m.isLoading) return <LoadingSkeleton rows={5} />;
  if (m.error) return <ErrorState error={m.error} onRetry={() => m.refetch()} />;
  if (!m.data) return <EmptyState title="Company not found" />;
  const w = (m.data.fit_weights && typeof m.data.fit_weights === "object" && !Array.isArray(m.data.fit_weights) ? m.data.fit_weights : {}) as Record<string, Json>;
  const initial = Object.fromEntries(CRITERIA.map((c) => [c, Number(w[c] ?? DEFAULTS[c])]));
  return <WeightsForm key={m.data.fit_config_version} initial={initial} version={m.data.fit_config_version} />;
}

function WeightsForm({ initial, version }: { initial: Record<string, number>; version: number }) {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const isOwner = viewer.role === "owner";
  const [weights, setWeights] = useState(initial);
  const total = CRITERIA.reduce((s, c) => s + (weights[c] ?? 0), 0);
  const changed = CRITERIA.some((c) => weights[c] !== initial[c]);

  const save = useRpc(async () => unwrap(await supabase.rpc("update_fit_weights", { p_weights: weights as Json })), {
    invalidate: [manufacturerKey, qk.prospects(), ["prospect"]],
    success: (v) => `Weights v${v} saved. Every scored prospect has been rescored.`,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fit score weights</CardTitle>
        <CardDescription>
          Version {version}. The score is the weighted share of seven signals; missing signals count as neutral. Saving rescores every prospect.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {!isOwner && <p className="text-sm text-muted-foreground">Only the owner can change scoring weights.</p>}
        <ul className="grid gap-4">
          {CRITERIA.map((c) => {
            const v = weights[c] ?? 0;
            const share = total > 0 ? Math.round((v / total) * 100) : 0;
            return (
              <li key={c} className="grid gap-1.5 sm:grid-cols-[12rem_1fr_7rem] sm:items-center sm:gap-4">
                <label htmlFor={`w-${c}`} className="text-sm font-medium">{criterionLabel(c)}</label>
                <input
                  id={`w-${c}`}
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={v}
                  disabled={!isOwner}
                  onChange={(e) => setWeights((w) => ({ ...w, [c]: Number(e.target.value) }))}
                  aria-valuetext={`${v} points, ${share}% of the score`}
                  className="w-full accent-[var(--primary)]"
                />
                <span className="text-sm tabular">
                  <strong>{v}</strong> <span className="text-muted-foreground">· {share}%</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="flex gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Total weight {total}. Weights are relative, so they need not add up to 100.
        </p>
        {isOwner && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={!changed} onClick={() => setWeights(initial)}>Reset</Button>
            <Button variant="ghost" onClick={() => setWeights(DEFAULTS)}>FMCG defaults</Button>
            <Button loading={save.isPending} disabled={!changed || total === 0} onClick={() => save.mutate(undefined)}>
              Save and rescore
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
