"use client";

import Link from "next/link";
import { Clock, MapPin, MessageSquare } from "lucide-react";
import { FitScoreBadge } from "@/components/domain/badges";
import { Avatar, Tooltip } from "@/components/ui/misc";
import { formatINRCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StageMenu, type Stage } from "@/components/manufacturer/stage-menu";

export type PipelineProspect = {
  id: string;
  name: string;
  city: string | null;
  type: string;
  stage: Stage;
  stage_changed_at: string;
  fit_score: number | null;
  assigned_rep_id: string | null;
  campaign_id: string | null;
  is_stale: boolean;
};

export function ProspectCard({
  prospect: p,
  repName,
  quotedPaise,
  unread,
  daysInStage,
  onMove,
  draggable,
  onDragStart,
  pendingMove,
}: {
  prospect: PipelineProspect;
  repName?: string | null;
  quotedPaise?: number | null;
  unread?: number;
  daysInStage: number | null;
  onMove: (to: Stage) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  pendingMove?: boolean;
}) {
  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      aria-label={p.name}
      className={cn(
        "grid gap-2 rounded-lg border border-border bg-surface p-3 shadow-sm transition-opacity",
        draggable && "cursor-grab active:cursor-grabbing",
        pendingMove && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/prospects/${p.id}`} className="min-w-0 text-sm font-medium leading-snug hover:underline">
          {p.name}
        </Link>
        <FitScoreBadge score={p.fit_score} className="shrink-0" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {p.city && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" aria-hidden />
            {p.city}
          </span>
        )}
        {daysInStage !== null && (
          <span className={cn("inline-flex items-center gap-1", daysInStage > 14 && "text-warning")}>
            <Clock className="size-3" aria-hidden />
            {daysInStage}d in stage
          </span>
        )}
        {quotedPaise ? <span className="font-medium text-foreground tabular">{formatINRCompact(quotedPaise)} quoted</span> : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {repName ? (
            <Tooltip content={`Rep: ${repName}`}>
              <span className="inline-flex" tabIndex={0} aria-label={`Assigned to ${repName}`}>
                <Avatar name={repName} className="size-6 text-[10px]" />
              </span>
            </Tooltip>
          ) : (
            <span className="text-xs text-muted-foreground">Unassigned</span>
          )}
          {unread ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white"
              aria-label={`${unread} unread messages`}
            >
              <MessageSquare className="size-3" aria-hidden />
              {unread}
            </span>
          ) : null}
          {p.is_stale && <span className="text-[11px] font-medium text-warning">Stale</span>}
        </div>
        <StageMenu stage={p.stage} onSelect={onMove} size="icon" variant="ghost" prospectName={p.name} disabled={pendingMove} />
      </div>
    </article>
  );
}
