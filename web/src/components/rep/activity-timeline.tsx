"use client";

import { ArrowRight, Bot, ClipboardCheck, Clock, Phone, StickyNote, UserPlus, AlertTriangle } from "lucide-react";
import { StagePill } from "@/components/domain/badges";
import { EmptyState } from "@/components/domain/states";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { mutationLabel } from "@/lib/offline/sync";
import { CALL_OUTCOME_LABELS, type CallOutcome, type LeadEvent, type QueuedMutation } from "@/lib/offline/types";

const ICONS = {
  stage_change: ArrowRight,
  note: StickyNote,
  call_log: Phone,
  assignment: UserPlus,
  system: Bot,
  review: ClipboardCheck,
} as const;

const KIND_LABEL: Record<string, string> = {
  stage_change: "Stage change",
  note: "Note",
  call_log: "Call",
  assignment: "Assigned",
  system: "System",
  review: "Review",
};

/** Lead history from prospect_events, with offline writes not yet on the server at the top. */
export function ActivityTimeline({ events, local }: { events: LeadEvent[]; local: QueuedMutation[] }) {
  const unsynced = local.filter((m) => m.status !== "synced");
  if (events.length === 0 && unsynced.length === 0) {
    return <EmptyState title="No activity yet" description="Calls, notes and stage changes you log appear here." />;
  }
  return (
    <ol className="grid gap-0">
      {unsynced.map((m) => (
        <li key={m.id} className="relative grid grid-cols-[2rem_1fr] gap-2 pb-4">
          <span
            className={`mt-0.5 inline-flex size-7 items-center justify-center rounded-full ${m.status === "failed" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}
            aria-hidden
          >
            {m.status === "failed" ? <AlertTriangle className="size-3.5" /> : <Clock className="size-3.5" />}
          </span>
          <div className="grid gap-0.5 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{mutationLabel(m)}</span>
              <Badge tone={m.status === "failed" ? "danger" : "warning"}>{m.status === "failed" ? "Rejected" : "Waiting to sync"}</Badge>
            </div>
            {m.kind === "note" && <p className="whitespace-pre-wrap text-muted-foreground">{m.payload.body}</p>}
            {m.kind === "call_log" && m.payload.notes && <p className="whitespace-pre-wrap text-muted-foreground">{m.payload.notes}</p>}
            {m.status === "failed" && m.error && <p className="text-xs text-danger">{m.error}</p>}
            <time className="text-xs text-muted-foreground" dateTime={m.clientTs}>
              {formatDateTime(m.clientTs)} (on this phone)
            </time>
          </div>
        </li>
      ))}
      {events.map((e) => {
        const Icon = ICONS[e.kind as keyof typeof ICONS] ?? Bot;
        const data = (e.data ?? {}) as { outcome?: string; next_followup?: string | null };
        return (
          <li key={e.id} className="relative grid grid-cols-[2rem_1fr] gap-2 pb-4">
            <span className="mt-0.5 inline-flex size-7 items-center justify-center rounded-full bg-surface-muted text-muted-foreground" aria-hidden>
              <Icon className="size-3.5" />
            </span>
            <div className="grid gap-0.5 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{KIND_LABEL[e.kind] ?? e.kind}</span>
                {e.kind === "stage_change" && (
                  <>
                    {e.from_stage && <StagePill stage={e.from_stage} />}
                    <ArrowRight className="size-3 text-muted-foreground" aria-label="to" />
                    {e.to_stage && <StagePill stage={e.to_stage} />}
                  </>
                )}
                {e.kind === "call_log" && data.outcome && (
                  <Badge tone="outline">{CALL_OUTCOME_LABELS[data.outcome as CallOutcome] ?? data.outcome}</Badge>
                )}
              </div>
              {e.body && <p className="whitespace-pre-wrap text-muted-foreground">{e.body}</p>}
              {data.next_followup && <p className="text-xs">Next follow up: {formatDate(data.next_followup)}</p>}
              <time className="text-xs text-muted-foreground" dateTime={e.created_at}>
                {formatDateTime(e.client_ts ?? e.created_at)}
                {e.client_ts && Math.abs(new Date(e.created_at).getTime() - new Date(e.client_ts).getTime()) > 120_000
                  ? ` · synced ${formatDateTime(e.created_at)}`
                  : ""}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
