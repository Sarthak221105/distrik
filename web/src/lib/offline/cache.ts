"use client";

import { getOfflineDb } from "@/lib/offline/db";
import type { CachedMessage, LeadEvent, LeadRecord, LeadSnapshot, ThreadSnapshot } from "@/lib/offline/types";

// Personal data on the device stays minimal: the last few leads opened and
// the last viewed thread only (its most recent messages).
const MAX_LEADS = 5;
const MAX_MESSAGES = 50;

export async function saveLeadSnapshot(userId: string, lead: LeadRecord, events: LeadEvent[]): Promise<void> {
  const db = getOfflineDb();
  if (!db) return;
  try {
    await db.leads.put({ id: lead.id, userId, savedAt: Date.now(), lead, events: events.slice(0, 30) });
    const mine = await db.leads.where("userId").equals(userId).sortBy("savedAt");
    const extra = mine.length - MAX_LEADS;
    if (extra > 0) await db.leads.bulkDelete(mine.slice(0, extra).map((l) => l.id));
  } catch {
    // Storage full or blocked (private mode): the page still works online.
  }
}

export async function getLeadSnapshot(userId: string, id: string): Promise<LeadSnapshot | null> {
  const db = getOfflineDb();
  if (!db) return null;
  const snap = await db.leads.get(id);
  return snap && snap.userId === userId ? snap : null;
}

export async function listLeadSnapshots(userId: string): Promise<LeadSnapshot[]> {
  const db = getOfflineDb();
  if (!db) return [];
  const rows = await db.leads.where("userId").equals(userId).sortBy("savedAt");
  return rows.reverse();
}

export async function saveThreadSnapshot(
  userId: string,
  prospectId: string,
  conversationId: string,
  messages: CachedMessage[],
): Promise<void> {
  const db = getOfflineDb();
  if (!db) return;
  try {
    await db.transaction("rw", db.threads, async () => {
      await db.threads.where("conversationId").notEqual(conversationId).delete();
      await db.threads.put({
        conversationId,
        userId,
        prospectId,
        savedAt: Date.now(),
        messages: messages.slice(-MAX_MESSAGES).map((m) => ({
          id: m.id,
          direction: m.direction,
          body: m.body,
          actor: m.actor,
          status: m.status,
          created_at: m.created_at,
          media_filename: m.media_filename,
          media_type: m.media_type,
          template_id: m.template_id,
        })),
      });
    });
  } catch {
    // ignore storage failures
  }
}

export async function getThreadSnapshot(userId: string, conversationId: string): Promise<ThreadSnapshot | null> {
  const db = getOfflineDb();
  if (!db) return null;
  const snap = await db.threads.get(conversationId);
  return snap && snap.userId === userId ? snap : null;
}

/** Drops cached buyer data (sign out). Pending writes stay for the same user. */
export async function clearOfflineData(): Promise<void> {
  const db = getOfflineDb();
  if (!db) return;
  await Promise.all([db.leads.clear(), db.threads.clear()]);
}
