"use client";

import { Skeleton } from "@/components/domain/states";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePublicStats } from "./use-public-stats";

/** "N manufacturers on the waitlist", live from publicApi.stats(). */
export function WaitlistCount({ className }: { className?: string }) {
  const { data, isPending, isError } = usePublicStats();

  if (isPending) {
    return (
      <span className={cn("inline-flex items-center gap-2", className)}>
        <Skeleton className="h-4 w-52" />
        <span className="sr-only">Loading waitlist count</span>
      </span>
    );
  }
  // The counter is social proof, not essential: on failure, say nothing wrong.
  if (isError || !data) {
    return <span className={cn("text-sm text-muted-foreground", className)}>Early access opens soon</span>;
  }

  const n = data.waitlist_count;
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)} aria-live="polite">
      <span className="relative flex size-2.5" aria-hidden>
        <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2.5 rounded-full bg-success" />
      </span>
      {n > 0 ? (
        <span>
          <strong className="font-semibold text-foreground tabular">{formatNumber(n)}</strong>{" "}
          {n === 1 ? "manufacturer" : "manufacturers"} on the waitlist
        </span>
      ) : (
        <span>Be the first manufacturer on the waitlist</span>
      )}
    </span>
  );
}
