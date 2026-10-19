"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  ClipboardCheck,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  LineChart,
  Megaphone,
  Package,
  Scale,
  Settings,
  Truck,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import { useRealtime } from "@/hooks/use-realtime";
import { useViewer } from "@/components/providers";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { t } from "@/lib/i18n";
import { useAwaitingReviewCount } from "@/components/manufacturer/lead-shared";

export function ManufacturerShell({ children }: { children: ReactNode }) {
  const viewer = useViewer();
  const supabase = getSupabaseBrowser();
  const pending = useQuery({
    queryKey: [...qk.approvals("pending"), "count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("human_approvals")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
  });
  useRealtime({ table: "human_approvals", invalidate: [qk.approvals("pending")] });
  const awaiting = useAwaitingReviewCount();

  const nav: NavItem[] = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: "/campaigns", label: t("nav.campaigns"), icon: Megaphone },
    {
      href: "/leads",
      label: t("nav.leadReview"),
      icon: ClipboardCheck,
      badge: awaiting.data ? (
        <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white" aria-label={`${awaiting.data} awaiting review`}>
          {awaiting.data}
        </span>
      ) : null,
    },
    {
      href: "/approvals",
      label: t("nav.approvals"),
      icon: BadgeCheck,
      badge: pending.data ? (
        <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white" aria-label={`${pending.data} pending`}>
          {pending.data}
        </span>
      ) : null,
    },
    { href: "/pipeline", label: t("nav.pipeline"), icon: KanbanSquare },
    { href: "/quotations", label: t("nav.quotations"), icon: FileText },
    { href: "/orders", label: t("nav.orders"), icon: Truck },
    { href: "/analytics", label: t("nav.analytics"), icon: LineChart },
    { href: "/products", label: t("nav.products"), icon: Package },
    { href: "/rules", label: t("nav.rules"), icon: Scale },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ];

  return (
    <AppShell nav={nav} title={viewer.manufacturer?.name ?? "Distrik"} subtitle={viewer.manufacturer?.city}>
      {children}
    </AppShell>
  );
}
