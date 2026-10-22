"use client";

import type { ReactNode } from "react";
import { Activity, Building2, ClipboardList, Database, MessageSquareText } from "lucide-react";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { t } from "@/lib/i18n";

export function SystemShell({ children }: { children: ReactNode }) {
  const nav: NavItem[] = [
    { href: "/system/health", label: t("nav.health"), icon: Activity },
    { href: "/system/applications", label: t("nav.applications"), icon: ClipboardList },
    { href: "/system/tenants", label: t("nav.tenants"), icon: Building2 },
    { href: "/system/sources", label: t("nav.sources"), icon: Database },
    { href: "/system/templates", label: t("nav.templates"), icon: MessageSquareText },
  ];
  return (
    <AppShell nav={nav} title="Distrik system" subtitle="Platform maintenance">
      {children}
    </AppShell>
  );
}
