import { CircleDashed, ExternalLink, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FitScoreBadge } from "@/components/domain/badges";
import { titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Json } from "@/lib/database.types";

export type FitRow = {
  criterion: string;
  weight: number;
  signal: number;
  contribution: number;
  missing: boolean;
  source?: string | null;
};

export function parseBreakdown(raw: Json | null | undefined): FitRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, Json> => !!r && typeof r === "object" && !Array.isArray(r))
    .map((r) => ({
      criterion: String(r.criterion ?? ""),
      weight: Number(r.weight ?? 0),
      signal: Number(r.signal ?? 0),
      contribution: Number(r.contribution ?? 0),
      missing: r.missing === true,
      source: r.source == null ? null : String(r.source),
    }))
    .sort((a, b) => b.weight - a.weight);
}

const CRITERION_LABEL: Record<string, string> = {
  category_match: "Category match",
  geographic_coverage: "Geographic coverage",
  brands_carried: "Brands carried",
  retail_network: "Retail network",
  logistics: "Logistics",
  territory_availability: "Territory availability",
  company_size: "Company size",
};

export function criterionLabel(c: string) {
  return CRITERION_LABEL[c] ?? titleCase(c);
}

/**
 * Fit breakdown: criterion, weight, raw signal and contribution as stored by
 * score_prospect, so the interface shows the reasoning without recomputing.
 * A missing signal is neutral (0.5) and labelled, never shown as zero.
 */
export function FitBreakdownPanel({
  breakdown,
  score,
  version,
  className,
}: {
  breakdown: Json | null | undefined;
  score: number | null | undefined;
  version?: number | null;
  className?: string;
}) {
  const rows = parseBreakdown(breakdown);
  const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
  const missing = rows.filter((r) => r.missing).length;

  return (
    <section className={cn("grid gap-3", className)} aria-label="Fit breakdown">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Fit score</h3>
          <FitScoreBadge score={score} />
        </div>
        {version ? <span className="text-xs text-muted-foreground">Weights v{version}</span> : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not scored yet. The score appears once research finishes.</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <caption className="sr-only">Fit score by criterion</caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="pb-1 font-medium">Criterion</th>
                <th scope="col" className="pb-1 text-right font-medium">Weight</th>
                <th scope="col" className="pb-1 text-right font-medium">Signal</th>
                <th scope="col" className="pb-1 text-right font-medium">Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.criterion} className="border-t border-border align-top">
                  <td className="py-2 pr-2">
                    <div className="font-medium">{criterionLabel(r.criterion)}</div>
                    <div className="mt-1 h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                      <div
                        className={cn("h-full", r.missing ? "bg-border" : "bg-primary")}
                        style={{ width: `${Math.round(r.signal * 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.missing ? (
                        <Badge tone="neutral">
                          <CircleDashed aria-hidden /> Neutral, no data
                        </Badge>
                      ) : (
                        <Badge tone="outline">{titleCase(r.source ?? "research")}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-2 text-right tabular">{r.weight}</td>
                  <td className="py-2 text-right tabular">
                    {r.missing ? <span className="text-muted-foreground">0.5 (neutral)</span> : r.signal.toFixed(2)}
                  </td>
                  <td className="py-2 text-right font-medium tabular">{r.contribution.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border text-xs text-muted-foreground">
                <td className="pt-2">Total of {totalWeight} weight</td>
                <td />
                <td />
                <td className="pt-2 text-right font-medium text-foreground tabular">
                  {rows.reduce((s, r) => s + r.contribution, 0).toFixed(1)}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="flex gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Score = points ÷ total weight × 100.
            {missing > 0 && ` ${missing} criteria had no data and count as neutral (0.5), not zero.`}
          </p>
        </>
      )}
    </section>
  );
}

type ResearchSource = { url: string; label?: string };

/** Research summary with sources; anything without a URL is labelled inferred. */
export function ResearchPanel({ research, className }: { research: Json | null | undefined; className?: string }) {
  const r = (research && typeof research === "object" && !Array.isArray(research) ? research : {}) as Record<string, Json>;
  const sources: ResearchSource[] = Array.isArray(r.sources)
    ? r.sources
        .map((s) =>
          typeof s === "string"
            ? { url: s }
            : s && typeof s === "object" && !Array.isArray(s) && typeof s.url === "string"
              ? { url: s.url, label: typeof s.label === "string" ? s.label : undefined }
              : null,
        )
        .filter((s): s is ResearchSource => !!s)
    : [];
  const inferred = r.inferred === true || sources.length === 0;
  const facts: [string, string][] = [];
  const asText = (v: Json | undefined) =>
    v == null ? null : Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(", ") : typeof v === "object" ? null : String(v);
  for (const [key, label] of [
    ["brands_carried", "Brands carried"],
    ["retail_reach", "Retail reach"],
    ["estimated_scale", "Estimated scale"],
  ] as const) {
    const v = asText(r[key]);
    if (v) facts.push([label, v]);
  }
  const decisionMakers = Array.isArray(r.decision_makers)
    ? r.decision_makers
        .map((d) =>
          d && typeof d === "object" && !Array.isArray(d)
            ? [d.name, d.role].filter(Boolean).join(", ")
            : typeof d === "string"
              ? d
              : "",
        )
        .filter(Boolean)
    : [];

  const hasAnything = !!r.summary || facts.length > 0 || decisionMakers.length > 0 || !!r.reason_to_switch;

  return (
    <section className={cn("grid gap-3", className)} aria-label="Research">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Research</h3>
        {hasAnything &&
          (inferred ? (
            <Badge tone="warning">
              <CircleDashed aria-hidden /> Inferred, no source URL
            </Badge>
          ) : (
            <Badge tone="success">{sources.length} source{sources.length === 1 ? "" : "s"}</Badge>
          ))}
      </div>
      {!hasAnything ? (
        <p className="text-sm text-muted-foreground">No research yet.</p>
      ) : (
        <>
          {typeof r.summary === "string" && <p className="text-sm">{r.summary}</p>}
          {facts.length > 0 && (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              {facts.map(([label, v]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
              {decisionMakers.length > 0 && (
                <div>
                  <dt className="text-xs text-muted-foreground">Decision makers</dt>
                  <dd>{decisionMakers.join("; ")}</dd>
                </div>
              )}
            </dl>
          )}
          {typeof r.reason_to_switch === "string" && (
            <p className="rounded-lg bg-ai-soft px-3 py-2 text-sm">
              <span className="font-medium text-ai">Reason to switch: </span>
              {r.reason_to_switch}
            </p>
          )}
          {sources.length > 0 && (
            <ul className="grid gap-1 text-sm">
              {sources.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    {s.label ?? s.url}
                    <span className="sr-only"> (opens in new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
