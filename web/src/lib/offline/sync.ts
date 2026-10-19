"use client";

import { t } from "@/lib/i18n";
import { getOfflineDb } from "@/lib/offline/db";
import { OfflineError, isOnline } from "@/lib/offline/network";
import { executeMutation } from "@/lib/offline/queue";
import { CALL_OUTCOME_LABELS, type MutationInput, type QueuedMutation } from "@/lib/offline/types";

export type SyncSummary = { synced: QueuedMutation[]; failed: QueuedMutation[]; remaining: number };

const SYNCED_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

export function mutationLabel(m: MutationInput): string {
  switch (m.kind) {
    case "call_log":
      return `Call log · ${CALL_OUTCOME_LABELS[m.payload.outcome] ?? m.payload.outcome}`;
    case "note":
      return "Note";
    case "stage":
      return `Stage change to ${t(`stage.${m.payload.to}`)}`;
  }
}

/** The server's explanation, phrased for the rep (PRD 13: rejected with an explanation). */
export function describeFailure(m: QueuedMutation, message: string): string {
  switch (m.kind) {
    case "stage":
      return `Stage change to ${t(`stage.${m.payload.to}`)} was rejected: ${message}`;
    case "call_log":
      return `Call log could not be saved: ${message}`;
    case "note":
      return `Note could not be saved: ${message}`;
  }
}

let running: Promise<SyncSummary> | null = null;

/**
 * Replays pending writes for this user in the order they were made, with the
 * same idempotency keys. Each one ends synced, failed (with the server's
 * reason), or stays pending when the network drops mid run. Single flight:
 * concurrent callers share the same run.
 */
export function syncPending(userId: string): Promise<SyncSummary> {
  if (!running) {
    running = doSync(userId).finally(() => {
      running = null;
    });
  }
  return running;
}

async function doSync(userId: string): Promise<SyncSummary> {
  const db = getOfflineDb();
  const summary: SyncSummary = { synced: [], failed: [], remaining: 0 };
  if (!db) return summary;

  const pending = await db.mutations.where("[userId+status]").equals([userId, "pending"]).sortBy("createdAt");
  let stoppedAt = pending.length;

  for (let i = 0; i < pending.length; i++) {
    const m = pending[i]!;
    if (!isOnline()) {
      stoppedAt = i;
      break;
    }
    try {
      await executeMutation(m);
      const done = { ...m, status: "synced", syncedAt: Date.now(), attempts: m.attempts + 1, error: null } as QueuedMutation;
      await db.mutations.put(done);
      summary.synced.push(done);
    } catch (e) {
      if (e instanceof OfflineError) {
        await db.mutations.update(m.id, { attempts: m.attempts + 1 });
        stoppedAt = i;
        break;
      }
      const message = e instanceof Error ? e.message : String(e);
      const failed = { ...m, status: "failed", attempts: m.attempts + 1, error: describeFailure(m, message) } as QueuedMutation;
      await db.mutations.put(failed);
      summary.failed.push(failed);
    }
  }
  summary.remaining = pending.length - stoppedAt;

  // Keep synced rows briefly so the rep sees the result, then drop them.
  const cutoff = Date.now() - SYNCED_RETENTION_MS;
  await db.mutations
    .where("[userId+status]")
    .equals([userId, "synced"])
    .filter((m) => (m.syncedAt ?? 0) < cutoff)
    .delete();

  return summary;
}

export async function dismissMutation(id: string): Promise<void> {
  await getOfflineDb()?.mutations.delete(id);
}

export async function pendingCount(userId: string): Promise<number> {
  const db = getOfflineDb();
  if (!db) return 0;
  return db.mutations.where("[userId+status]").equals([userId, "pending"]).count();
}
