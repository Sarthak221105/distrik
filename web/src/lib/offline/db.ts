"use client";

import Dexie, { type EntityTable } from "dexie";
import type { LeadSnapshot, QueuedMutation, ThreadSnapshot } from "@/lib/offline/types";

/**
 * IndexedDB for the rep PWA (PRD 13):
 *  - mutations: the offline write queue (call logs, notes, stage changes)
 *  - leads:     the last few lead pages the rep opened (profile, contacts, timeline)
 *  - threads:   only the last viewed conversation's recent messages
 * Supabase responses are never cached by the service worker; this is the
 * only place buyer data is kept on the device, and it is cleared on sign out.
 */
class OfflineDb extends Dexie {
  mutations!: EntityTable<QueuedMutation, "id">;
  leads!: EntityTable<LeadSnapshot, "id">;
  threads!: EntityTable<ThreadSnapshot, "conversationId">;

  constructor() {
    super("distrik-offline");
    this.version(1).stores({
      mutations: "id, createdAt, userId, [userId+status], [userId+prospectId]",
      leads: "id, userId, savedAt",
      threads: "conversationId, userId, prospectId, savedAt",
    });
  }
}

let instance: OfflineDb | null = null;

export function getOfflineDb(): OfflineDb | null {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  if (!instance) instance = new OfflineDb();
  return instance;
}
