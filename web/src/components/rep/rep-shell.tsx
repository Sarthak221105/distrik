"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bell, CalendarClock, CloudOff, CloudUpload, LayoutDashboard, ListTodo, LogOut, RefreshCw, Users, Wifi } from "lucide-react";
import { useViewer } from "@/components/providers";
import { NotificationBell } from "@/components/shell/notification-bell";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/misc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { SyncStatusList } from "@/components/rep/sync-status-list";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import { titleCase } from "@/lib/format";
import { t } from "@/lib/i18n";
import { clearOfflineData } from "@/lib/offline/cache";
import { useOnline, usePendingCount, useSyncLoop } from "@/lib/offline/hooks";
import { SW_AUTO_REGISTER, clearPageCache, registerServiceWorker, swSupported, warmPageCache } from "@/lib/offline/sw-register";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/rep/today", label: t("nav.today"), icon: ListTodo },
  { href: "/rep/leads", label: t("nav.leads"), icon: Users },
  { href: "/rep/reorders", label: t("nav.reorders"), icon: CalendarClock },
  { href: "/rep/notifications", label: t("nav.notifications"), icon: Bell },
] as const;

function titleFor(pathname: string): string {
  if (pathname.startsWith("/rep/leads/")) return "Lead";
  const tab = TABS.find((x) => pathname === x.href || pathname.startsWith(x.href + "/"));
  return tab?.label ?? "Distrik";
}

/**
 * Mobile first shell for the rep PWA: top bar with connection state and the
 * offline queue, bottom tab bar with 44px+ targets. On desktop the same
 * layout sits in a centred column.
 */
export function RepShell({ children }: { children: ReactNode }) {
  const viewer = useViewer();
  const pathname = usePathname();
  const router = useRouter();
  const online = useOnline();
  const pending = usePendingCount(viewer.userId);
  const [syncOpen, setSyncOpen] = useState(false);
  const isManager = viewer.role === "owner" || viewer.role === "sales_head";

  useSyncLoop(viewer.userId);

  const unread = useQuery({
    queryKey: qk.unreadCount(),
    queryFn: async () => {
      const { count } = await getSupabaseBrowser()
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", viewer.userId)
        .is("read_at", null);
      return count ?? 0;
    },
  });

  // Service worker: register, keep an offline copy of the tab pages, and
  // follow deep links from notification taps.
  useEffect(() => {
    if (!swSupported()) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "NAVIGATE" && typeof e.data.url === "string") {
        const u = new URL(e.data.url);
        router.push(u.pathname + u.search);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    if (SW_AUTO_REGISTER) {
      void registerServiceWorker().then(async () => {
        await navigator.serviceWorker.ready;
        warmPageCache(TABS.map((x) => x.href));
      });
    }
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  // Signing out (here or in another tab) drops cached buyer data and pages.
  useEffect(() => {
    const { data } = getSupabaseBrowser().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        void clearOfflineData();
        clearPageCache();
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function signOut() {
    if (pending > 0 && !window.confirm(`${pending} change${pending === 1 ? " has" : "s have"} not synced yet. Sign out anyway? They will sync next time you sign in on this phone.`)) {
      return;
    }
    await clearOfflineData();
    clearPageCache();
    await getSupabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a href="#rep-main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-lg items-center gap-2 px-3">
          <span
            aria-hidden
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
          >
            D
          </span>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{titleFor(pathname)}</h1>

          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              online ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
            )}
            role="status"
            aria-live="polite"
          >
            {online ? <Wifi className="size-3.5" aria-hidden /> : <CloudOff className="size-3.5" aria-hidden />}
            {online ? "Online" : "Offline"}
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="relative size-11"
            onClick={() => setSyncOpen(true)}
            aria-label={pending > 0 ? `${pending} changes waiting to sync. Open sync status` : "Sync status, everything synced"}
          >
            <CloudUpload aria-hidden />
            {pending > 0 && (
              <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-semibold leading-4 text-white">
                {pending > 9 ? "9+" : pending}
              </span>
            )}
          </Button>

          <NotificationBell allHref="/rep/notifications" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-surface-muted"
                aria-label="Account menu"
              >
                <Avatar name={viewer.fullName ?? viewer.email} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>
                <span className="block text-sm font-medium text-foreground">{viewer.fullName ?? viewer.email}</span>
                <span className="block">
                  {titleCase(viewer.role)}
                  {viewer.manufacturer ? ` · ${viewer.manufacturer.name}` : ""}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isManager && (
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">
                    <LayoutDashboard aria-hidden /> Open web app
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setSyncOpen(true)}>
                <RefreshCw aria-hidden /> Sync status
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void signOut()}>
                <LogOut aria-hidden /> {t("common.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {!online && (
          <div className="border-t border-border bg-warning-soft px-4 py-1.5 text-center text-xs text-warning" role="status">
            You are offline. Calls, notes and stage changes are saved on this phone and sync when you reconnect.
          </div>
        )}
      </header>

      <main id="rep-main" className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-4">
        {children}
      </main>

      <nav
        aria-label="Rep sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto grid w-full max-w-lg grid-cols-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
            const badge = tab.href === "/rep/notifications" ? (unread.data ?? 0) : 0;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className={cn("relative rounded-full px-3 py-0.5", active && "bg-primary-soft")}>
                    <Icon className="size-5" aria-hidden />
                    {badge > 0 && (
                      <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
                        {badge > 9 ? "9+" : badge}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </span>
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Sheet
        open={syncOpen}
        onOpenChange={setSyncOpen}
        side="bottom"
        title="Sync status"
        description="Changes you made offline, replayed in order when the connection returns."
      >
        <SyncStatusList userId={viewer.userId} showProspect />
      </Sheet>
    </div>
  );
}
