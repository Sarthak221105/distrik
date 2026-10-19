"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { toAppError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadCsv } from "@/components/manufacturer/files";
import { trackEvent } from "@/components/manufacturer/hooks";
import { useViewer } from "@/components/providers";
import { istToday } from "@/components/manufacturer/time";

type Kind = "prospects" | "orders" | "quotations";

const CHUNK = 1000;

async function fetchAll(kind: Kind): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseBrowser();
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += CHUNK) {
    const res =
      kind === "prospects"
        ? await supabase
            .from("prospects")
            .select("id, name, type, category, address, city, state, pincode, gstin, website, confidence, fit_score, review_status, reviewed_at, review_note, stage, stage_changed_at, assigned_rep_id, outreach_approved, is_customer, created_at")
            .neq("review_status", "merged")
            .order("created_at")
            .range(from, from + CHUNK - 1)
        : kind === "orders"
          ? await supabase
              .from("orders")
              .select("id, number, status, total_paise, ordered_on, override_reason, prospect:prospects(name, city)")
              .order("ordered_on")
              .range(from, from + CHUNK - 1)
          : await supabase
              .from("quotations")
              .select("id, number, version, status, subtotal_paise, tax_paise, shipping_paise, total_paise, tax_mode, valid_until, sent_at, created_at, prospect:prospects(name, city)")
              .order("created_at")
              .range(from, from + CHUNK - 1);
    if (res.error) throw new Error(toAppError(res.error).message);
    const rows = (res.data ?? []) as Record<string, unknown>[];
    for (const r of rows) {
      const flat: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (v && typeof v === "object" && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v)) flat[`${k}_${k2}`] = v2;
        else if (k.endsWith("_paise") && typeof v === "number") flat[k.replace(/_paise$/, "_inr")] = (v / 100).toFixed(2);
        else flat[k] = v;
      }
      out.push(flat);
    }
    if (rows.length < CHUNK) break;
  }
  return out;
}

export function DataExport() {
  const viewer = useViewer();
  const [busy, setBusy] = useState<Kind | null>(null);

  async function run(kind: Kind) {
    setBusy(kind);
    try {
      const rows = await fetchAll(kind);
      if (rows.length === 0) toast.info(`No ${kind} to export yet`);
      else {
        downloadCsv(`distrik-${kind}-${istToday()}.csv`, rows);
        toast.success(`Exported ${rows.length} ${kind}`);
        void trackEvent(viewer, "data_exported", { kind, rows: rows.length });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data export</CardTitle>
        <CardDescription>
          CSV files built in your browser from the rows you can see. Amounts are in rupees. Contact phone numbers are not included; handle exports as
          personal data under the DPDP Act.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {(["prospects", "orders", "quotations"] as Kind[]).map((k) => (
          <Button key={k} variant="outline" loading={busy === k} disabled={!!busy && busy !== k} onClick={() => run(k)}>
            <Download aria-hidden /> Export {k}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
