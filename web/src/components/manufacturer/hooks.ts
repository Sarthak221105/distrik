"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { useViewer } from "@/components/providers";
import type { Json, Tables } from "@/lib/database.types";

export type TeamMember = Pick<
  Tables<"profiles">,
  "user_id" | "full_name" | "email" | "phone" | "role" | "approval_limit_paise" | "active" | "created_at" | "permissions"
>;

/** Everyone in the tenant (RLS limits profiles to the viewer's manufacturer). */
export function useTeam() {
  const supabase = getSupabaseBrowser();
  const query = useQuery({
    queryKey: qk.team(),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("profiles")
          .select("user_id, full_name, email, phone, role, approval_limit_paise, active, created_at, permissions")
          .neq("role", "system_admin")
          .order("full_name"),
      ) as TeamMember[],
    staleTime: 5 * 60_000,
  });
  const byId = useMemo(() => {
    const m = new Map<string, TeamMember>();
    for (const p of query.data ?? []) m.set(p.user_id, p);
    return m;
  }, [query.data]);
  const reps = useMemo(() => (query.data ?? []).filter((p) => p.role === "rep" && p.active), [query.data]);
  return { ...query, byId, reps };
}

export type ProductLite = Pick<
  Tables<"products">,
  "id" | "name" | "sku" | "unit" | "category" | "status" | "distributor_price_paise" | "moq" | "mrp_paise" | "cost_paise"
>;

export function useProductsLite() {
  const supabase = getSupabaseBrowser();
  return useQuery({
    queryKey: [...qk.products(), "lite"],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("products")
          .select("id, name, sku, unit, category, status, distributor_price_paise, moq, mrp_paise, cost_paise")
          .order("name"),
      ) as ProductLite[],
    staleTime: 60_000,
  });
}

/** Writes a product analytics event (PRD 11). Failures are ignored. */
export async function trackEvent(
  viewer: { manufacturerId: string | null; userId: string },
  name: string,
  properties: Record<string, unknown> = {},
) {
  try {
    await getSupabaseBrowser()
      .from("product_events")
      .insert({
        manufacturer_id: viewer.manufacturerId,
        user_id: viewer.userId,
        name,
        properties: properties as Json,
      });
  } catch {
    // analytics must never break a screen
  }
}

/** Records one screen view per mount. */
export function useTrackScreen(screen: string, properties: Record<string, unknown> = {}) {
  const viewer = useViewer();
  const sent = useRef(false);
  const propsKey = JSON.stringify(properties);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void trackEvent(viewer, "screen_view", { screen, ...JSON.parse(propsKey) });
  }, [viewer, screen, propsKey]);
}

export const isOwner = (role: string) => role === "owner";

/** unwrap() for list queries: never null. */
export function unwrapList<T>(result: { data: T[] | null; error: unknown }): T[] {
  return unwrap(result) ?? [];
}
