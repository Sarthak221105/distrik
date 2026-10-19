"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Database, Pencil, ShieldAlert } from "lucide-react";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { RpcError, toAppError, unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatNumber, timeAgo } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import type { Database as DB } from "@/lib/database.types";

const KEY = qk.system("sources");
type SourceRow = DB["public"]["Functions"]["sysadmin_source_health"]["Returns"][number];

const STALE_DAYS = 7;

/** Source health: yield, freshness, error rate and the lawful basis that gates every run. */
export function SourcesView() {
  const supabase = getSupabaseBrowser();
  const [editing, setEditing] = useState<SourceRow | null>(null);
  const [now] = useState(() => Date.now());

  const list = useQuery({
    queryKey: KEY,
    // Aggregates only (counts and configuration), via a system-admin function.
    queryFn: async (): Promise<{ rows: SourceRow[] }> => ({
      rows: (unwrap(await supabase.rpc("sysadmin_source_health")) ?? []) as SourceRow[],
    }),
  });
  const rows = list.data?.rows ?? [];

  const toggle = useRpc(
    async (vars: { row: SourceRow; enabled: boolean }) => {
      if (vars.enabled && !vars.row.lawful_basis?.trim()) {
        throw new RpcError({
          code: "no_lawful_basis",
          message: "Record a lawful basis before enabling this source. Sources without one are never run.",
          field: "lawful_basis",
        });
      }
      const res = await supabase.from("sources").update({ enabled: vars.enabled }).eq("id", vars.row.id!);
      if (res.error) throw new RpcError(toAppError(res.error));
      return null;
    },
    { invalidate: [KEY], success: (_d, v) => `${v.row.name} ${v.enabled ? "enabled" : "disabled"}` },
  );

  return (
    <div>
      <PageHeader
        title="Sources"
        description="Each source needs a recorded lawful basis (DPDP Act). A source that is disabled or has none is never run."
      />
      {list.isLoading ? (
        <LoadingSkeleton variant="table" />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Database aria-hidden />} title="No sources configured" description="Sources are added by migration with their adapter." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Source</TH>
                <TH>Enabled</TH>
                <TH className="text-right">Yield</TH>
                <TH className="text-right">Records (30d)</TH>
                <TH>Freshness</TH>
                <TH>Error rate (30d)</TH>
                <TH>Lawful basis · terms</TH>
                <TH className="text-right">Edit</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((s) => {
                const noMetrics = s.jobs_30d === null;
                const jobs = Number(s.jobs_30d ?? 0);
                const failed = Number(s.failed_jobs_30d ?? 0);
                const rate = jobs ? Math.round((failed / jobs) * 100) : 0;
                const staleMs = STALE_DAYS * 86_400_000;
                const fresh = s.last_run_at ? Date.parse(s.last_run_at) : 0;
                const isStale = !s.last_run_at || fresh < now - staleMs;
                const noBasis = !s.lawful_basis?.trim();
                return (
                  <TR key={s.id}>
                    <TD>
                      <div className="font-medium">{s.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{s.adapter}</div>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!s.enabled}
                          aria-label={`${s.enabled ? "Disable" : "Enable"} ${s.name}`}
                          disabled={toggle.isPending || (!s.enabled && noBasis)}
                          onCheckedChange={(v) => toggle.mutate({ row: s, enabled: v })}
                        />
                        <span className="text-xs">{s.enabled ? "On" : "Off"}</span>
                      </div>
                      {!s.enabled && noBasis && (
                        <span className="mt-1 flex items-center gap-1 text-[11px] text-danger">
                          <ShieldAlert className="size-3" aria-hidden /> Needs lawful basis
                        </span>
                      )}
                    </TD>
                    <TD className="text-right tabular">{s.yield_pct === null ? "–" : `${s.yield_pct}%`}</TD>
                    <TD className="text-right tabular">{formatNumber(s.records_30d)}</TD>
                    <TD>
                      {isStale ? (
                        <Badge tone="warning">
                          <AlertTriangle aria-hidden /> {s.last_run_at ? `Last run ${timeAgo(s.last_run_at)}` : "Never run"}
                        </Badge>
                      ) : (
                        <Badge tone="success">
                          <CheckCircle2 aria-hidden /> {timeAgo(s.last_run_at)}
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      <span className="tabular text-sm">{noMetrics ? "–" : `${failed}/${jobs} jobs`}</span>{" "}
                      {jobs > 0 && (
                        <Badge tone={rate >= 25 ? "danger" : rate > 0 ? "warning" : "success"}>
                          {rate >= 25 ? <AlertTriangle aria-hidden /> : null}
                          {rate}% failed
                        </Badge>
                      )}
                    </TD>
                    <TD className="max-w-80 text-xs">
                      {noBasis ? (
                        <span className="text-danger">No lawful basis recorded</span>
                      ) : (
                        <p className="line-clamp-2">{s.lawful_basis}</p>
                      )}
                      {s.terms_note && <p className="mt-1 line-clamp-2 text-muted-foreground">Terms: {s.terms_note}</p>}
                    </TD>
                    <TD className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(s)} aria-label={`Edit lawful basis and terms for ${s.name}`}>
                        <Pencil aria-hidden /> Edit
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
      {editing && <EditSourceDialog row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditSourceDialog({ row, onClose }: { row: SourceRow; onClose: () => void }) {
  const supabase = getSupabaseBrowser();
  const [basis, setBasis] = useState(row.lawful_basis ?? "");
  const [terms, setTerms] = useState(row.terms_note ?? "");
  const clearingWhileOn = !!row.enabled && !basis.trim();

  const save = useRpc(
    async () => {
      const patch: { lawful_basis: string | null; terms_note: string | null; enabled?: boolean } = {
        lawful_basis: basis.trim() || null,
        terms_note: terms.trim() || null,
      };
      if (clearingWhileOn) patch.enabled = false;
      const res = await supabase.from("sources").update(patch).eq("id", row.id!);
      if (res.error) throw new RpcError(toAppError(res.error));
      return clearingWhileOn;
    },
    {
      invalidate: [KEY],
      onSuccess: (disabled) => {
        toast.success(disabled ? "Saved. With no lawful basis the source was disabled." : "Saved");
        onClose();
      },
    },
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Edit ${row.name}`} description="Record why collecting this data is lawful and any terms of use to respect.">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(undefined);
          }}
        >
          <Field label="Lawful basis" htmlFor="src-basis" hint="For example: publicly listed business contact data, legitimate interest for B2B outreach, reviewed by legal on …">
            <Textarea id="src-basis" value={basis} onChange={(e) => setBasis(e.target.value)} rows={4} />
          </Field>
          <Field label="Terms note" htmlFor="src-terms" hint="Rate limits, attribution or usage restrictions from the provider.">
            <Textarea id="src-terms" value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} />
          </Field>
          {clearingWhileOn && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning" role="alert">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              Saving with no lawful basis will also disable this source.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
