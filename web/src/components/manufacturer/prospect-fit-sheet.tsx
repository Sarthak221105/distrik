"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MapPin } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { titleCase } from "@/lib/format";
import { Sheet } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/misc";
import { ConfidenceTag, StagePill } from "@/components/domain/badges";
import { ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { FitBreakdownPanel, ResearchPanel } from "@/components/manufacturer/fit-breakdown-panel";

/** Side panel with a prospect's fit breakdown and research with sources. */
export function ProspectFitSheet({ prospectId, onClose }: { prospectId: string | null; onClose: () => void }) {
  const supabase = getSupabaseBrowser();
  const q = useQuery({
    enabled: !!prospectId,
    queryKey: [...qk.prospect(prospectId ?? "none"), "fit"],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("prospects")
          .select("id, name, type, city, address, stage, confidence, fit_score, fit_breakdown, fit_config_version, research, source_url, source:sources(name)")
          .eq("id", prospectId!)
          .single(),
      ),
  });
  const p = q.data;
  const source = p?.source as { name: string } | null | undefined;
  return (
    <Sheet
      open={!!prospectId}
      onOpenChange={(o) => !o && onClose()}
      title={p?.name ?? "Prospect"}
      description={p ? `${titleCase(p.type)}${p.city ? ` · ${p.city}` : ""}` : undefined}
    >
      {q.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : p ? (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <StagePill stage={p.stage} />
            <ConfidenceTag confidence={p.confidence} />
            {source?.name && <span className="text-xs text-muted-foreground">Source: {source.name}</span>}
            {p.source_url && (
              <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="size-3" aria-hidden /> Source listing
              </a>
            )}
          </div>
          {p.address && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {p.address}
            </p>
          )}
          <FitBreakdownPanel breakdown={p.fit_breakdown} score={p.fit_score} version={p.fit_config_version} />
          <Separator />
          <ResearchPanel research={p.research} />
          <Button asChild variant="outline" className="justify-self-start">
            <Link href={`/prospects/${p.id}`}>Open full profile</Link>
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
