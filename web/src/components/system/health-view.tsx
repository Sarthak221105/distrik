"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, AlertTriangle, CheckCircle2, RotateCw } from "lucide-react";
import { ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { JsonView } from "@/components/system/admin-utils";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatDateTime, formatNumber, timeAgo } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";

const REFRESH_MS = 10_000;
const CONVERSATIONAL = new Set(["outbound_messages", "ai_turns", "notifications"]);

type Level = "ok" | "warn" | "danger";
function levelFor(value: number, warn: number, danger: number): Level {
  return value >= danger ? "danger" : value >= warn ? "warn" : "ok";
}
const LEVEL_UI: Record<Level, { tone: BadgeTone; label: string; Icon: typeof CheckCircle2 }> = {
  ok: { tone: "success", label: "OK", Icon: CheckCircle2 },
  warn: { tone: "warning", label: "Watch", Icon: AlertTriangle },
  danger: { tone: "danger", label: "Act now", Icon: AlertOctagon },
};
function LevelBadge({ level, children }: { level: Level; children?: ReactNode }) {
  const { tone, label, Icon } = LEVEL_UI[level];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden />
      {children ?? label}
    </Badge>
  );
}
function worst(...levels: Level[]): Level {
  return levels.includes("danger") ? "danger" : levels.includes("warn") ? "warn" : "ok";
}
function formatAge(sec: number | null): string {
  if (sec === null || sec === undefined) return "–";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

/** Platform health for the system admin: queues, dead letters, failure counts. Refreshes every 10 seconds. */
type PlatformHealth = {
  failed_messages_24h: number;
  blocked_messages_24h: number;
  failed_ai_turns_24h: number;
  stalled_campaigns: { tenant: string; campaign_id: string; status: string; stalled_step: string | null; since: string }[];
  failed_jobs: { tenant: string; step: string; error: string | null; attempts: number; at: string }[];
};

export function HealthView() {
  const supabase = getSupabaseBrowser();
  const [auto, setAuto] = useState(true);
  const interval = auto ? REFRESH_MS : false;

  const metrics = useQuery({
    queryKey: qk.system("queue-metrics"),
    queryFn: async () => unwrap(await supabase.rpc("sysadmin_queue_metrics")) ?? [],
    refetchInterval: interval,
  });
  const dead = useQuery({
    queryKey: qk.system("dead-letters"),
    queryFn: async () => unwrap(await supabase.rpc("sysadmin_dead_letters", { p_limit: 50 })) ?? [],
    refetchInterval: interval,
  });
  // Aggregates only: the system admin never reads manufacturer buyer data.
  const health = useQuery({
    queryKey: qk.system("platform-health"),
    queryFn: async () => unwrap(await supabase.rpc("sysadmin_platform_health")) as unknown as PlatformHealth,
    refetchInterval: interval,
  });
  const stalled = { ...health, data: health.data?.stalled_campaigns };
  const failedJobs = { ...health, data: health.data?.failed_jobs };

  const retry = useRpc(
    async (vars: { queue: string; msgId: number }) => unwrap(await supabase.rpc("sysadmin_retry_dead_letter", { p_queue: vars.queue, p_msg_id: vars.msgId })),
    { invalidate: [qk.system("dead-letters"), qk.system("queue-metrics")], success: (id, v) => `Re-queued on ${v.queue} as message ${id}` },
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Platform health"
        description="Queue depth, the oldest waiting job, dead letters and failure counts. Technical maintenance only: no buyer or conversation data is shown here."
        actions={
          <div className="flex items-center gap-2">
            <Switch id="jobs-auto" checked={auto} onCheckedChange={setAuto} />
            <Label htmlFor="jobs-auto" className="font-normal">
              Auto refresh (10s)
            </Label>
            {metrics.dataUpdatedAt > 0 && (
              <span className="text-xs text-muted-foreground" aria-live="polite">
                updated {timeAgo(new Date(metrics.dataUpdatedAt))}
              </span>
            )}
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Queues</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.isLoading ? (
            <LoadingSkeleton variant="table" rows={5} />
          ) : metrics.error ? (
            <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Queue</TH>
                  <TH className="text-right">Waiting</TH>
                  <TH className="text-right">Oldest</TH>
                  <TH className="text-right">Total processed</TH>
                  <TH className="text-right">Dead letters</TH>
                  <TH>Health</TH>
                </TR>
              </THead>
              <TBody>
                {(metrics.data ?? []).map((m) => {
                  const fast = CONVERSATIONAL.has(m.queue_name);
                  const len = levelFor(Number(m.queue_length), fast ? 20 : 500, fast ? 100 : 2000);
                  const age = levelFor(Number(m.oldest_msg_age_sec ?? 0), fast ? 60 : 600, fast ? 300 : 3600);
                  const dl = levelFor(Number(m.dead_letters), 1, 10);
                  return (
                    <TR key={m.queue_name}>
                      <TD>
                        <span className="font-mono text-xs">{m.queue_name}</span>
                        <span className="ml-2 text-[11px] text-muted-foreground">{fast ? "conversational" : "batch"}</span>
                      </TD>
                      <TD className={`text-right tabular ${len !== "ok" ? "font-semibold" : ""}`}>{formatNumber(m.queue_length)}</TD>
                      <TD className={`text-right tabular ${age !== "ok" ? "font-semibold" : ""}`}>{formatAge(m.oldest_msg_age_sec)}</TD>
                      <TD className="text-right tabular">{formatNumber(m.total_messages)}</TD>
                      <TD className={`text-right tabular ${dl !== "ok" ? "font-semibold" : ""}`}>{formatNumber(m.dead_letters)}</TD>
                      <TD>
                        <LevelBadge level={worst(len, age, dl)}>
                          {worst(len, age, dl) === "ok"
                            ? "OK"
                            : [len !== "ok" && "backlog", age !== "ok" && "slow", dl !== "ok" && "dead letters"].filter(Boolean).join(", ")}
                        </LevelBadge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Thresholds: conversational queues warn at 20 waiting or 1 minute old (act at 100 or 5 minutes); batch queues warn at 500 or 10 minutes
            (act at 2000 or 1 hour); any dead letter is worth a look.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dead letters</CardTitle>
        </CardHeader>
        <CardContent>
          {dead.isLoading ? (
            <LoadingSkeleton variant="table" rows={3} />
          ) : dead.error ? (
            <ErrorState error={dead.error} onRetry={() => dead.refetch()} />
          ) : (dead.data ?? []).length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-success" aria-hidden /> No dead letters. Every job that ran out of retries would appear here.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Queue</TH>
                  <TH>Message</TH>
                  <TH className="text-right">Reads</TH>
                  <TH>Enqueued · archived</TH>
                  <TH>Payload</TH>
                  <TH className="text-right">Retry</TH>
                </TR>
              </THead>
              <TBody>
                {dead.data!.map((d) => (
                  <TR key={`${d.queue_name}-${d.msg_id}`}>
                    <TD className="font-mono text-xs">{d.queue_name}</TD>
                    <TD className="font-mono text-xs">#{d.msg_id}</TD>
                    <TD className="text-right tabular">{d.read_ct}</TD>
                    <TD className="text-xs">
                      <div>{formatDateTime(d.enqueued_at)}</div>
                      <div className="text-muted-foreground">{formatDateTime(d.archived_at)}</div>
                    </TD>
                    <TD className="max-w-96">
                      <details>
                        <summary className="cursor-pointer text-xs">Show payload</summary>
                        <JsonView value={d.message} label={`Payload of message ${d.msg_id}`} className="mt-1" />
                      </details>
                    </TD>
                    <TD className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retry.mutate({ queue: d.queue_name, msgId: d.msg_id })}
                        loading={retry.isPending && retry.variables?.msgId === d.msg_id && retry.variables?.queue === d.queue_name}
                        aria-label={`Retry message ${d.msg_id} on ${d.queue_name}`}
                      >
                        <RotateCw aria-hidden /> Retry
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Last 24 hours</CardTitle>
        </CardHeader>
        <CardContent>
          {health.isLoading ? (
            <LoadingSkeleton variant="cards" />
          ) : health.error ? (
            <ErrorState error={health.error} onRetry={() => health.refetch()} />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Failed WhatsApp sends", value: health.data!.failed_messages_24h, warn: 1, danger: 20 },
                { label: "Blocked by consent or window", value: health.data!.blocked_messages_24h, warn: 50, danger: 500 },
                { label: "Failed AI turns", value: health.data!.failed_ai_turns_24h, warn: 1, danger: 10 },
              ].map((m) => (
                <div key={m.label} className="rounded-lg border border-border p-3">
                  <dt className="text-xs text-muted-foreground">{m.label}</dt>
                  <dd className="mt-1 flex items-center justify-between gap-2">
                    <span className="tabular text-2xl font-semibold">{formatNumber(m.value)}</span>
                    <LevelBadge level={levelFor(Number(m.value), m.warn, m.danger)} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Blocked sends are the consent gate working as designed; a sudden rise usually means a template or window problem.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <FailureCard title="Stalled campaigns" query={stalled} empty="No campaign is stalled.">
          {(rows) => (
            <ul className="grid gap-2">
              {rows.map((c) => (
                <li key={c.campaign_id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{c.tenant}</span>
                    <LevelBadge level="danger">{c.stalled_step ? `Stalled at ${c.stalled_step}` : c.status}</LevelBadge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Campaign <span className="font-mono">{c.campaign_id.slice(0, 8)}</span> · started {timeAgo(c.since)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </FailureCard>

        <FailureCard title="Failed pipeline jobs" query={failedJobs} empty="No failed pipeline jobs.">
          {(rows) => (
            <ul className="grid gap-2">
              {rows.map((j, i) => (
                <li key={`${j.at}-${i}`} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {j.tenant} · <span className="font-mono text-xs">{j.step}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{timeAgo(j.at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{j.attempts} attempts</p>
                  {j.error && <p className="mt-1 break-words font-mono text-xs text-danger">{j.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </FailureCard>
      </div>
    </div>
  );
}

function FailureCard<T>({
  title,
  query,
  empty,
  children,
}: {
  title: string;
  query: { isLoading: boolean; error: unknown; data: T[] | undefined; refetch: () => unknown };
  empty: string;
  children: (rows: T[]) => ReactNode;
}) {
  const rows = query.data ?? [];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {!query.isLoading && !query.error && <LevelBadge level={rows.length > 0 ? "warn" : "ok"}>{rows.length}</LevelBadge>}
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <LoadingSkeleton rows={2} />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" aria-hidden /> {empty}
          </p>
        ) : (
          children(rows)
        )}
      </CardContent>
    </Card>
  );
}
