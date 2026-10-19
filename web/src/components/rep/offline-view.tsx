"use client";

import { useEffect, useState } from "react";
import { ChevronRight, CloudOff, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOfflineDb } from "@/lib/offline/db";
import { useDexieQuery, useOnline } from "@/lib/offline/hooks";
import type { LeadSnapshot } from "@/lib/offline/types";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/**
 * Offline fallback page. It cannot know which lead was asked for, so it
 * offers the leads saved on this phone and the pending write count. Links
 * are plain anchors so the service worker can serve the cached page shells.
 */
export function OfflineView() {
  const online = useOnline();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // The session lives in a cookie, so this works without a network.
    getSupabaseBrowser()
      .auth.getSession()
      .then(({ data }) => setUserId(data.session?.user.id ?? null))
      .catch(() => setUserId(null));
  }, []);

  const leads = useDexieQuery<LeadSnapshot[]>(
    async () => {
      const db = getOfflineDb();
      if (!db || !userId) return [];
      return (await db.leads.where("userId").equals(userId).sortBy("savedAt")).reverse();
    },
    [userId],
    [],
  );
  const pending = useDexieQuery<number>(
    async () => {
      const db = getOfflineDb();
      if (!db || !userId) return 0;
      return db.mutations.where("[userId+status]").equals([userId, "pending"]).count();
    },
    [userId],
    0,
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-10">
      <div className="grid justify-items-center gap-3 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-warning-soft text-warning">
          <CloudOff className="size-7" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold">{online ? "Back online" : "You are offline"}</h1>
        <p className="text-sm text-muted-foreground">
          {online
            ? "Your connection is back. Reload to continue where you left off."
            : "This page needs a connection. Leads you opened recently still work, and calls, notes and stage changes you log are saved on this phone."}
        </p>
        {pending > 0 && (
          <p className="rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning" role="status">
            {pending} change{pending === 1 ? "" : "s"} waiting to sync
          </p>
        )}
        <Button size="lg" onClick={() => window.location.reload()}>
          <RotateCw aria-hidden /> Try again
        </Button>
      </div>

      <nav aria-label="Available offline" className="grid gap-2">
        <a href="/rep/today" className="flex min-h-12 items-center justify-between rounded-lg border border-border bg-surface px-3 text-sm font-medium">
          Today <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </a>
        {leads.length > 0 && <h2 className="mt-2 text-sm font-semibold">Saved leads</h2>}
        {leads.map((l) => (
          <a
            key={l.id}
            href={`/rep/leads/${l.id}`}
            className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-sm"
          >
            <span className="grid min-w-0">
              <span className="truncate font-medium">{l.lead.name}</span>
              {l.lead.city && <span className="text-xs text-muted-foreground">{l.lead.city}</span>}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </a>
        ))}
      </nav>
    </main>
  );
}
