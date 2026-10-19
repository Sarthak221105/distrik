import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Requested price against the floor and hard minimum. Green zone: at or above
 * the floor (the AI may offer alone). Amber: between hard minimum and floor
 * (needs a human). Red: below the hard minimum (rejected by the rules).
 */
export function PriceGuardrailMeter({
  requested,
  floor,
  hardMinimum,
  list,
  className,
}: {
  requested: number | null | undefined;
  floor: number | null | undefined;
  hardMinimum: number | null | undefined;
  list?: number | null;
  className?: string;
}) {
  if (!floor || !hardMinimum || !requested) return null;
  const top = Math.max(list ?? floor * 1.08, floor * 1.04, requested * 1.02);
  const bottom = Math.min(hardMinimum * 0.96, requested * 0.98);
  const pct = (v: number) => ((v - bottom) / (top - bottom)) * 100;
  const zone = requested >= floor ? "ok" : requested >= hardMinimum ? "approval" : "reject";
  const zoneLabel =
    zone === "ok" ? "At or above floor" : zone === "approval" ? "Below floor: needs approval" : "Below hard minimum";

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        <div className="absolute inset-y-0 left-0 bg-danger/30" style={{ width: `${pct(hardMinimum)}%` }} />
        <div
          className="absolute inset-y-0 bg-warning/35"
          style={{ left: `${pct(hardMinimum)}%`, width: `${pct(floor) - pct(hardMinimum)}%` }}
        />
        <div className="absolute inset-y-0 right-0 bg-success/30" style={{ left: `${pct(floor)}%` }} />
        <div
          className="absolute inset-y-[-2px] w-1 rounded bg-foreground"
          style={{ left: `calc(${pct(requested)}% - 2px)` }}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground tabular">
        <span>
          Hard min <strong className="text-foreground">{formatINR(hardMinimum)}</strong>
        </span>
        <span>
          Ask{" "}
          <strong className={cn(zone === "ok" ? "text-success" : zone === "approval" ? "text-warning" : "text-danger")}>
            {formatINR(requested)}
          </strong>
        </span>
        <span>
          Floor <strong className="text-foreground">{formatINR(floor)}</strong>
        </span>
        {list ? (
          <span>
            List <strong className="text-foreground">{formatINR(list)}</strong>
          </span>
        ) : null}
      </div>
      <p className="sr-only">
        {zoneLabel}. Requested {formatINR(requested)}, floor {formatINR(floor)}, hard minimum {formatINR(hardMinimum)}.
      </p>
      <p
        className={cn(
          "text-xs font-medium",
          zone === "ok" ? "text-success" : zone === "approval" ? "text-warning" : "text-danger",
        )}
      >
        {zoneLabel}
      </p>
    </div>
  );
}
