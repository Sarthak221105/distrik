import type { AppRole } from "@/lib/claims";

// Mirrors public.has_permission in SQL. The database is the real enforcement;
// this only decides which buttons to show.
export type Permission = "review_leads" | "resolve_duplicates" | "assign_leads" | "launch_campaigns" | "override_reviews";

export const PERMISSIONS: { key: Permission; label: string; help: string }[] = [
  { key: "review_leads", label: "Review leads", help: "Approve, reject and edit prospects; import buyer lists" },
  { key: "resolve_duplicates", label: "Resolve duplicates", help: "Merge duplicate records or keep them separate" },
  { key: "assign_leads", label: "Assign leads", help: "Assign approved prospects to reps" },
  { key: "launch_campaigns", label: "Launch outreach", help: "Release approved prospects for outreach" },
  { key: "override_reviews", label: "Override decisions", help: "Change an earlier approve or reject decision (audited)" },
];

export function can(viewer: { role: AppRole; permissions: string[] } | null | undefined, permission: Permission): boolean {
  if (!viewer) return false;
  if (viewer.role === "owner") return true;
  return viewer.role === "sales_head" && viewer.permissions.includes(permission);
}
