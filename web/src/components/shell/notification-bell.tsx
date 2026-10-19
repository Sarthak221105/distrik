"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import { unwrap } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { useRealtime } from "@/hooks/use-realtime";
import { useViewer } from "@/components/providers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Notification badge: Realtime pushes new rows for this user (RLS scoped).
export function NotificationBell({ allHref }: { allHref?: string }) {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: qk.notifications(),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("notifications")
          .select("id, kind, title, body, link, read_at, created_at")
          .eq("user_id", viewer.userId)
          .order("created_at", { ascending: false })
          .limit(15),
      ),
  });

  useRealtime({
    table: "notifications",
    filter: `user_id=eq.${viewer.userId}`,
    event: "INSERT",
    invalidate: [qk.notifications(), qk.unreadCount()],
    onChange: (payload) => {
      const row = payload.new as { title?: string; body?: string };
      if (row?.title) toast(row.title, { description: row.body });
    },
  });

  const unread = (list.data ?? []).filter((n) => !n.read_at).length;

  async function markRead(id: string) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: qk.notifications() });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications, ${unread} unread`} className="relative">
          <Bell aria-hidden />
          {unread > 0 && (
            <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(list.data ?? []).length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">You are all caught up</p>}
        {(list.data ?? []).map((n) => (
          <DropdownMenuItem key={n.id} asChild onSelect={() => !n.read_at && markRead(n.id)}>
            <Link href={n.link ?? "#"} className="grid items-start gap-0.5">
              <span className={cn("text-sm", !n.read_at && "font-semibold")}>{n.title}</span>
              {n.body && <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>}
              <span className="text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        {allHref && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={allHref} className="justify-center text-primary">
                See all
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
