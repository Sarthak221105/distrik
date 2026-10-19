"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareText, Pencil, Search } from "lucide-react";
import { StatusBadge } from "@/components/domain/badges";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ManufacturerSelect } from "@/components/system/admin-utils";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { RpcError, toAppError, unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatNumber, timeAgo } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import type { Database } from "@/lib/database.types";

type TemplateStatus = Database["public"]["Enums"]["template_status"];
const STATUSES: TemplateStatus[] = ["draft", "submitted", "approved", "rejected", "paused"];
const KEY = qk.system("templates");

type TemplateRow = {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  variables: string[];
  purpose: string | null;
  meta_status: TemplateStatus;
  meta_template_id: string | null;
  rejection_reason: string | null;
  usage_count: number;
  created_at: string;
  manufacturer_id: string | null;
  manufacturer: { name: string } | null;
};

/** WhatsApp templates across tenants with their Meta approval state. */
export function TemplatesView() {
  const supabase = getSupabaseBrowser();
  const [manufacturer, setManufacturer] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<TemplateRow | null>(null);

  const list = useQuery({
    queryKey: [...KEY, manufacturer, status],
    queryFn: async () => {
      let q = supabase
        .from("message_templates")
        .select(
          "id, name, language, category, body, variables, purpose, meta_status, meta_template_id, rejection_reason, usage_count, created_at, manufacturer_id, manufacturer:manufacturers(name)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (manufacturer) q = q.eq("manufacturer_id", manufacturer);
      if (status) q = q.eq("meta_status", status as TemplateStatus);
      return (unwrap(await q) ?? []) as unknown as TemplateRow[];
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (list.data ?? []).filter((r) => !term || r.name.toLowerCase().includes(term) || r.body.toLowerCase().includes(term));
  }, [list.data, search]);

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Outside the 24 hour window only Meta approved templates can be sent. Technical status sync with Meta for each tenant's submissions."
      />
      <Card className="mb-4 flex flex-wrap items-end gap-4 p-4">
        <Field label="Tenant" htmlFor="tpl-tenant" className="w-56">
          <ManufacturerSelect id="tpl-tenant" value={manufacturer} onChange={setManufacturer} />
        </Field>
        <Field label="Meta status" htmlFor="tpl-status" className="w-44">
          <NativeSelect id="tpl-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Search" htmlFor="tpl-search" className="w-64">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="tpl-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" placeholder="Name or text" />
          </div>
        </Field>
      </Card>

      {list.isLoading ? (
        <LoadingSkeleton variant="table" />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText aria-hidden />}
          title={(list.data ?? []).length === 0 ? "No templates yet" : "No templates match"}
          description="Manufacturers draft templates in their settings; they appear here for submission tracking."
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Template</TH>
                <TH>Tenant</TH>
                <TH>Language · category</TH>
                <TH>Body</TH>
                <TH>Meta status</TH>
                <TH className="text-right">Used</TH>
                <TH className="text-right">Edit</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <div className="font-mono text-xs font-medium">{r.name}</div>
                    {r.purpose && <div className="text-xs text-muted-foreground">{r.purpose}</div>}
                    <div className="text-[11px] text-muted-foreground">created {timeAgo(r.created_at)}</div>
                  </TD>
                  <TD className="text-xs">{r.manufacturer?.name ?? <Badge tone="outline">Global</Badge>}</TD>
                  <TD className="text-xs">
                    {r.language} · {r.category}
                  </TD>
                  <TD className="max-w-96">
                    <details>
                      <summary className="line-clamp-2 cursor-pointer text-xs">{r.body}</summary>
                      <p className="mt-1 whitespace-pre-wrap text-xs">{r.body}</p>
                      {r.variables.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">Variables: {r.variables.join(", ")}</p>}
                    </details>
                  </TD>
                  <TD>
                    <StatusBadge status={r.meta_status} />
                    {r.meta_status === "rejected" && r.rejection_reason && (
                      <p className="mt-1 max-w-56 text-xs text-danger">{r.rejection_reason}</p>
                    )}
                    {r.meta_template_id && <p className="mt-1 font-mono text-[11px] text-muted-foreground">{r.meta_template_id}</p>}
                  </TD>
                  <TD className="text-right tabular">{formatNumber(r.usage_count)}</TD>
                  <TD className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setEditing(r)} aria-label={`Change Meta status of ${r.name}`}>
                      <Pencil aria-hidden /> Status
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      {editing && <StatusDialog row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StatusDialog({ row, onClose }: { row: TemplateRow; onClose: () => void }) {
  const supabase = getSupabaseBrowser();
  const [status, setStatus] = useState<TemplateStatus>(row.meta_status);
  const [reason, setReason] = useState(row.rejection_reason ?? "");
  const [metaId, setMetaId] = useState(row.meta_template_id ?? "");
  const needsReason = status === "rejected" && !reason.trim();

  const save = useRpc(
    async () => {
      const res = await supabase
        .from("message_templates")
        .update({
          meta_status: status,
          rejection_reason: status === "rejected" ? reason.trim() : null,
          meta_template_id: metaId.trim() || null,
        })
        .eq("id", row.id);
      if (res.error) throw new RpcError(toAppError(res.error));
      return null;
    },
    { invalidate: [KEY, qk.templates()], success: `Updated ${row.name}`, onSuccess: onClose },
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Meta status: ${row.name}`} description="Record what Meta decided. Only approved templates can be sent outside the 24 hour window.">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!needsReason) save.mutate(undefined);
          }}
        >
          <Field label="Status" htmlFor="tpl-new-status">
            <NativeSelect id="tpl-new-status" value={status} onChange={(e) => setStatus(e.target.value as TemplateStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Meta template id (optional)" htmlFor="tpl-meta-id">
            <Input id="tpl-meta-id" value={metaId} onChange={(e) => setMetaId(e.target.value)} />
          </Field>
          {status === "rejected" && (
            <Field label="Rejection reason (required)" htmlFor="tpl-reason" error={needsReason ? "Give Meta's reason so the manufacturer can fix it." : undefined}>
              <Textarea id="tpl-reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={needsReason} />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending} disabled={needsReason}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
