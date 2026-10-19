"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, type LucideIcon } from "lucide-react";
import { useViewer } from "@/components/providers";
import { NotificationBell } from "@/components/shell/notification-bell";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: ReactNode };

/** Desktop sidebar shell shared by the manufacturer app and the system admin console. */
export function AppShell({
  nav,
  title,
  subtitle,
  children,
  notificationsHref,
}: {
  nav: NavItem[];
  title: string;
  subtitle?: string | null;
  children: ReactNode;
  notificationsHref?: string;
}) {
  const pathname = usePathname();
  const viewer = useViewer();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navList = (
    <nav aria-label="Main" className="grid gap-0.5">
      {nav.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {item.badge}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-4 lg:flex">
        <Link href={nav[0]?.href ?? "/"} className="mb-6 flex items-center gap-2 px-2">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground">
            D
          </span>
          <span className="grid leading-tight">
            <span className="text-sm font-semibold">{title}</span>
            {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
          </span>
        </Link>
        <div className="flex-1 overflow-y-auto">{navList}</div>
        <div className="mt-4 flex items-center gap-2 border-t border-border px-1 pt-4">
          <Avatar name={viewer.fullName ?? viewer.email} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{viewer.fullName ?? viewer.email}</p>
            <p className="truncate text-xs text-muted-foreground">{titleCase(viewer.role)}</p>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-surface p-4 shadow-xl">{navList}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/90 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu aria-hidden />
          </Button>
          <p className="text-sm font-medium lg:hidden">{title}</p>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell allHref={notificationsHref} />
            <SignOutButton variant="ghost" />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
