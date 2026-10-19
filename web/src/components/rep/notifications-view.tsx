"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellOff, BellRing, CheckCheck, ChevronRight } from "lucide-react";
import { useViewer } from "@/components/providers";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { timeAgo } from "@/lib/format";
import { useRealtime } from "@/hooks/use-realtime";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/offline/push";
import { cn } from "@/lib/utils";

const PAGE = 30;
const LIST_KEY = [...qk.notifications(), "history"] as const;

export function NotificationsView() {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const qc = useQueryClient();

  const list = useInfiniteQuery({
    queryKey: LIST_KEY,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("notifications")
        .select("id, kind, title, body, link, read_at, created_at")
        .eq("user_id", viewer.userId)
        .order("created_at", { ascending: false })
        .limit(PAGE);
      if (pageParam) q = q.lt("created_at", pageParam);
      return unwrap(await q) ?? [];
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1]!.created_at : null),
  });

  useRealtime({
    table: "notifications",
    filter: `user_id=eq.${viewer.userId}`,
    invalidate: [LIST_KEY, qk.unreadCount()],
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.notifications() });
    qc.invalidateQueries({ queryKey: qk.unreadCount() });
  };

  async function markRead(id: string) {
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    if (!error) refresh();
  }

  const [markingAll, setMarkingAll] = useState(false);
  async function markAllRead() {
    setMarkingAll(true);
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", viewer.userId)
      .is("read_at", null);
    setMarkingAll(false);
    if (error) toast.error(error.message);
    else {
      toast.success("All caught up");
      refresh();
    }
  }

  const items = list.data?.pages.flat() ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="grid gap-4">
      <PushCard />

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">History</h2>
        <Button size="sm" variant="ghost" className="h-10" onClick={markAllRead} loading={markingAll} disabled={unread === 0}>
          <CheckCheck aria-hidden /> Mark all read
        </Button>
      </div>

      {list.isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell aria-hidden />}
          title="No notifications yet"
          description="Escalations, approvals and reorder alerts for your leads will show up here."
        />
      ) : (
        <>
          <ul className="grid gap-2">
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.link ?? "/rep/today"}
                  onClick={() => {
                    if (!n.read_at) void markRead(n.id);
                  }}
                  className={cn(
                    "flex min-h-14 items-start gap-3 rounded-lg border px-3 py-2.5",
                    n.read_at ? "border-border bg-surface" : "border-primary/30 bg-primary-soft/40",
                  )}
                >
                  <span
                    className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")}
                    aria-hidden
                  />
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span className={cn("text-sm", !n.read_at && "font-semibold")}>
                      {n.title}
                      {!n.read_at && <span className="sr-only"> (unread)</span>}
                    </span>
                    {n.body && <span className="line-clamp-2 text-sm text-muted-foreground">{n.body}</span>}
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(n.created_at)} · {n.kind.replace(/_/g, " ")}
                    </span>
                  </div>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {list.hasNextPage && (
            <Button variant="outline" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
              Load older
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function PushCard() {
  const viewer = useViewer();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getPushState()
      .then((s) => {
        if (alive) setState(s);
      })
      .catch(() => {
        if (alive) setState("unsupported");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      await enablePush(viewer.userId);
      setState("subscribed");
      toast.success("Push notifications are on for this device");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not enable push");
      setState(await getPushState().catch(() => "unsupported" as const));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await disablePush(viewer.userId);
      setState(await getPushState());
      toast.success("Push notifications are off for this device");
    } finally {
      setBusy(false);
    }
  }

  const info: Record<PushState, { text: string; tone: "success" | "warning" | "neutral" | "danger" }> = {
    subscribed: { text: "On for this device", tone: "success" },
    prompt: { text: "Off", tone: "neutral" },
    not_subscribed: { text: "Off", tone: "neutral" },
    denied: { text: "Blocked", tone: "danger" },
    unconfigured: { text: "Not configured", tone: "warning" },
    unsupported: { text: "Not supported", tone: "warning" },
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="grid gap-1">
          <CardTitle className="flex items-center gap-2">
            <BellRing className="size-4 text-muted-foreground" aria-hidden /> Push notifications
          </CardTitle>
          <CardDescription>Get escalations, approvals and reorder alerts even when the app is closed.</CardDescription>
        </div>
        {state && <Badge tone={info[state].tone}>{info[state].text}</Badge>}
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {state === "unconfigured" && (
          <p className="text-muted-foreground">
            Push is not configured for this deployment: the VAPID public key (NEXT_PUBLIC_VAPID_PUBLIC_KEY) is empty. In app
            notifications still work.
          </p>
        )}
        {state === "unsupported" && (
          <p className="text-muted-foreground">
            This browser cannot receive push. On Android use Chrome; on iPhone add Distrik to the home screen first (iOS 16.4+).
          </p>
        )}
        {state === "denied" && (
          <p className="text-muted-foreground">Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then reload.</p>
        )}
        {(state === "prompt" || state === "not_subscribed") && (
          <Button size="lg" onClick={enable} loading={busy}>
            <BellRing aria-hidden /> Enable push notifications
          </Button>
        )}
        {state === "subscribed" && (
          <Button size="lg" variant="outline" onClick={disable} loading={busy}>
            <BellOff aria-hidden /> Turn off on this device
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
