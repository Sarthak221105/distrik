import { AlertTriangle, Check, Circle, Loader2 } from "lucide-react";
import { formatDateTime, formatNumber, titleCase } from "@/lib/format";
import { StatusBadge } from "@/components/domain/badges";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";

const STEPS = [
  { key: "discovering", label: "Discovering", hint: "Finding buyers from enabled sources and your uploads" },
  { key: "scoring", label: "Cleaning & scoring", hint: "Cleaning, de-duplicating, researching and scoring automatically" },
  { key: "lead_review", label: "Lead review", hint: "Your team approves or rejects each prospect" },
  { key: "ready", label: "Ready", hint: "Approved prospects can be released for outreach" },
  { key: "live", label: "Live", hint: "Outreach under way for released prospects" },
] as const;

const ORDER: Record<string, number> = { draft: 0, discovering: 0, scoring: 1, lead_review: 2, ready: 3, live: 4, paused: 4, completed: 5, failed: -1 };
const STALLED_STEP_INDEX: Record<string, number> = { ingest: 0, normalize: 1, classify: 1, research: 1, score: 1 };

type Job = Pick<Tables<"campaign_jobs">, "id" | "step" | "status" | "records" | "error" | "attempts" | "finished_at" | "started_at">;

/**
 * Progress tracker: Discovering, Cleaning & scoring, Lead review, Ready, Live.
 * Discovery complete, approved and launched are shown as separate facts:
 * automated discovery and scoring are never approval.
 */
export function CampaignProgress({
  campaign,
  jobs,
  approved,
}: {
  campaign: Pick<Tables<"campaigns">, "status" | "status_detail" | "stalled_step" | "discovery_completed_at" | "launched_at">;
  jobs: (Job & { source?: { name: string } | null })[];
  /** Approved prospects in this campaign (from v_review_stats), when known. */
  approved?: number | null;
}) {
  const failed = campaign.status === "failed";
  const current = failed ? (STALLED_STEP_INDEX[campaign.stalled_step ?? "ingest"] ?? 0) : (ORDER[campaign.status] ?? 0);
  const stalledAt = campaign.stalled_step ? (STALLED_STEP_INDEX[campaign.stalled_step] ?? current) : null;

  const milestones = [
    {
      label: "Discovery complete",
      done: !!campaign.discovery_completed_at,
      text: campaign.discovery_completed_at ? formatDateTime(campaign.discovery_completed_at) : "Not yet",
    },
    {
      label: "Approved by your team",
      done: (approved ?? 0) > 0,
      text: approved === undefined || approved === null ? "–" : `${formatNumber(approved)} prospect${approved === 1 ? "" : "s"}`,
    },
    {
      label: "Outreach launched",
      done: !!campaign.launched_at,
      text: campaign.launched_at ? formatDateTime(campaign.launched_at) : "Not launched",
    },
  ];

  return (
    <div className="grid gap-4">
      <ol className="grid grid-cols-5 gap-2" aria-label="Campaign progress">
        {STEPS.map((s, i) => {
          const done = i < current || campaign.status === "completed";
          const active = i === current && !done;
          const stalled = stalledAt === i && (active || failed);
          return (
            <li key={s.key} className="grid content-start gap-1.5" aria-current={active ? "step" : undefined}>
              <div
                className={cn(
                  "h-1.5 rounded-full",
                  done ? "bg-primary" : stalled ? "bg-danger" : active ? "bg-primary/50" : "bg-surface-muted",
                )}
                aria-hidden
              />
              <div className="flex items-center gap-1.5 text-xs font-medium sm:text-sm">
                {done ? (
                  <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
                ) : stalled ? (
                  <AlertTriangle className="size-3.5 shrink-0 text-danger" aria-hidden />
                ) : active ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
                ) : null}
                <span className={cn(!done && !active && "text-muted-foreground")}>{s.label}</span>
                <span className="sr-only">{done ? "done" : stalled ? "stalled" : active ? "in progress" : "not started"}</span>
              </div>
              <p className="hidden text-xs text-muted-foreground md:block">{s.hint}</p>
            </li>
          );
        })}
      </ol>
      <dl className="grid gap-2 rounded-lg border border-border p-3 text-sm sm:grid-cols-3">
        {milestones.map((m) => (
          <div key={m.label} className="flex items-start gap-2">
            {m.done ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
            <div>
              <dt className="text-xs text-muted-foreground">{m.label}</dt>
              <dd className={cn("font-medium", !m.done && "text-muted-foreground")}>
                {m.text}
                <span className="sr-only">{m.done ? " (done)" : " (not yet)"}</span>
              </dd>
            </div>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={campaign.status} />
        {campaign.status_detail && <span>{campaign.status_detail}</span>}
        {campaign.stalled_step && (
          <span className="inline-flex items-center gap-1 text-danger">
            <AlertTriangle className="size-3.5" aria-hidden /> Stalled at the {titleCase(campaign.stalled_step)} step
          </span>
        )}
      </div>
      {jobs.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Pipeline steps ({jobs.length})</summary>
          <ul className="mt-2 grid gap-1.5">
            {jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-2 text-xs">
                <StatusBadge status={j.status} />
                <span className="font-medium">{titleCase(j.step)}</span>
                {j.source?.name && <span className="text-muted-foreground">· {j.source.name}</span>}
                <span className="text-muted-foreground tabular">· {j.records} records</span>
                {j.attempts > 1 && <span className="text-muted-foreground">· {j.attempts} attempts</span>}
                {j.finished_at && <span className="text-muted-foreground">· {formatDateTime(j.finished_at)}</span>}
                {j.error && <span className="w-full text-danger">{j.error}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
