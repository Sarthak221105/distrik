"use client";

import { useQuery } from "@tanstack/react-query";
import { publicApi, type PublicStats } from "@/lib/plans";

// Shared by the landing page and the signup pages so one fetch serves the
// waitlist counter and the plan cards.
export const publicStatsKey = ["public", "stats"] as const;

export function usePublicStats() {
  return useQuery<PublicStats>({
    queryKey: publicStatsKey,
    queryFn: () => publicApi.stats(),
    staleTime: 60_000,
  });
}
