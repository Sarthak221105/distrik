"use client";

import { AlertTriangle, CheckCircle2, Clock, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";
import { useOnline, useQueuedMutations, useSyncNow } from "@/lib/offline/hooks";
import { dismissMutation, mutationLabel } from "@/lib/offline/sync";
import type { QueuedMutation } from "@/lib/offline/types";
import { cn } from "@/lib/utils";

function StatusTag({ m }: { m: QueuedMutation }) {
  if (m.status === "synced")
    return (
      <Badge tone="success">
        <CheckCircle2 aria-hidden /> Synced
      </Badge>
    );
  if (m.status === "failed")
    return (
      <Badge tone="danger">
        <AlertTriangle aria-hidden /> Rejected
      </Badge>
    );
  return (
    <Badge tone="warning">
      <Clock aria-hidden /> Waiting to sync
    </Badge>
  );
}

/** Offline write queue with the result of each change (lead page and shell sheet). */
export function SyncStatusList({
  userId,
  prospectId,
  showProspect = false,
  hideWhenEmpty = false,
  className,
}: {
  userId: string;
  prospectId?: string;
  showProspect?: boolean;
  hideWhenEmpty?: boolean;
  className?: string;
}) {
  const items = useQueuedMutations(userId, prospectId);
  const online = useOnline();
  const { run, syncing } = useSyncNow(userId);
  const pending = items.filter((m) => m.status === "pending").length;

  if (items.length === 0) {
    if (hideWhenEmpty) return null;
    return <p className="text-sm text-muted-foreground">No offline changes. Everything you logged is on the server.</p>;
  }

  return (
    <div className={cn("grid gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {pending > 0
            ? `${pending} change${pending === 1 ? "" : "s"} waiting to sync${online ? "" : " · you are offline"}`
            : "All offline changes have been processed"}
        </p>
        {pending > 0 && (
          <Button size="sm" variant="outline" onClick={() => run()} loading={syncing} disabled={!online}>
            {!syncing && <RefreshCw aria-hidden />} Sync now
          </Button>
        )}
      </div>
      <ul className="grid gap-2">
        {items.map((m) => (
          <li key={m.id} className="grid gap-1 rounded-lg border border-border bg-surface p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{mutationLabel(m)}</span>
              <StatusTag m={m} />
            </div>
            {showProspect && m.prospectName && <span className="text-xs text-muted-foreground">{m.prospectName}</span>}
            {m.kind !== "stage" && (m.kind === "note" ? m.payload.body : m.payload.notes) && (
              <p className="line-clamp-2 text-xs text-muted-foreground">{m.kind === "note" ? m.payload.body : m.payload.notes}</p>
            )}
            {m.status === "failed" && m.error && (
              <p className="text-xs text-danger" role="alert">
                {m.error}
              </p>
            )}
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Logged {timeAgo(new Date(m.createdAt))}
                {m.syncedAt ? ` · synced ${timeAgo(new Date(m.syncedAt))}` : ""}
              </span>
              {m.status !== "pending" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => dismissMutation(m.id)}
                  aria-label={`Dismiss ${mutationLabel(m)}`}
                >
                  <X aria-hidden /> Dismiss
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
