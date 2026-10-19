"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { toast } from "sonner";
import { qk } from "@/lib/query-keys";
import { getOfflineDb } from "@/lib/offline/db";
import { isOnline } from "@/lib/offline/network";
import { mutationLabel, syncPending, type SyncSummary } from "@/lib/offline/sync";
import type { QueuedMutation } from "@/lib/offline/types";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** navigator.onLine as React state (true during server render). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, isOnline, () => true);
}

/** Subscribes to a Dexie query and re-renders when the underlying tables change. */
export function useDexieQuery<T>(querier: () => Promise<T> | T, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    if (!getOfflineDb()) return;
    const sub = liveQuery(querier).subscribe({
      next: (v) => setValue(v),
      error: () => undefined,
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export function useQueuedMutations(userId: string, prospectId?: string): QueuedMutation[] {
  return useDexieQuery<QueuedMutation[]>(
    async () => {
      const db = getOfflineDb();
      if (!db) return [];
      const rows = prospectId
        ? await db.mutations.where("[userId+prospectId]").equals([userId, prospectId]).toArray()
        : await db.mutations.where("userId").equals(userId).toArray();
      return rows.sort((a, b) => b.createdAt - a.createdAt);
    },
    [userId, prospectId],
    [],
  );
}

export function usePendingCount(userId: string): number {
  return useDexieQuery<number>(
    async () => {
      const db = getOfflineDb();
      if (!db) return 0;
      return db.mutations.where("[userId+status]").equals([userId, "pending"]).count();
    },
    [userId],
    0,
  );
}

/** Runs a sync and tells the rep the result of each write, then refreshes affected leads. */
export function useSyncNow(userId: string) {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const run = useCallback(
    async (opts: { quiet?: boolean } = {}): Promise<SyncSummary | null> => {
      if (!isOnline()) {
        if (!opts.quiet) toast.message("Still offline. Changes will sync when you are back online.");
        return null;
      }
      setSyncing(true);
      try {
        const summary = await syncPending(userId);
        const touched = new Set([...summary.synced, ...summary.failed].map((m) => m.prospectId));
        for (const id of touched) {
          qc.invalidateQueries({ queryKey: qk.prospect(id) });
          qc.invalidateQueries({ queryKey: qk.prospectEvents(id) });
        }
        if (touched.size > 0) qc.invalidateQueries({ queryKey: qk.prospects() });
        if (summary.synced.length > 0) {
          toast.success(
            summary.synced.length === 1
              ? `Synced: ${mutationLabel(summary.synced[0]!)}${summary.synced[0]!.prospectName ? ` for ${summary.synced[0]!.prospectName}` : ""}`
              : `Synced ${summary.synced.length} offline changes`,
          );
        }
        for (const f of summary.failed) toast.error(f.error ?? "A change could not be synced", { duration: 10000 });
        if (!opts.quiet && summary.synced.length === 0 && summary.failed.length === 0 && summary.remaining === 0) {
          toast.message("Everything is synced");
        }
        return summary;
      } finally {
        setSyncing(false);
      }
    },
    [userId, qc],
  );

  return { run, syncing };
}

/** App start, `online` events and a slow timer replay the queue (mounted once in the rep shell). */
export function useSyncLoop(userId: string) {
  const { run } = useSyncNow(userId);
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void run({ quiet: true });
    };
    const first = window.setTimeout(tick, 1500);
    window.addEventListener("online", tick);
    const timer = window.setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("online", tick);
    };
  }, [run]);
}
