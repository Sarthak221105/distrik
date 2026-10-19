"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { openSigned } from "@/lib/storage";
import { formatDate, formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/domain/badges";
import { cn } from "@/lib/utils";
import type { Json, Tables } from "@/lib/database.types";

export type QuoteLine = {
  product_id?: string;
  sku?: string;
  name?: string;
  unit?: string;
  hsn_code?: string | null;
  qty: number;
  unit_price_paise: number;
  gst_rate?: number;
  taxable_paise?: number;
  tax_paise?: number;
  cgst_paise?: number;
  sgst_paise?: number;
  igst_paise?: number;
  line_total_paise?: number;
};

export function parseLines(raw: Json | null | undefined): QuoteLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is Record<string, Json> => !!l && typeof l === "object" && !Array.isArray(l))
    .map((l) => ({
      product_id: l.product_id as string | undefined,
      sku: l.sku as string | undefined,
      name: (l.name ?? l.description) as string | undefined,
      unit: l.unit as string | undefined,
      hsn_code: (l.hsn_code as string | null) ?? null,
      qty: Number(l.qty ?? 0),
      unit_price_paise: Number(l.unit_price_paise ?? 0),
      gst_rate: l.gst_rate == null ? undefined : Number(l.gst_rate),
      taxable_paise: l.taxable_paise == null ? undefined : Number(l.taxable_paise),
      tax_paise: l.tax_paise == null ? undefined : Number(l.tax_paise),
      cgst_paise: l.cgst_paise == null ? undefined : Number(l.cgst_paise),
      sgst_paise: l.sgst_paise == null ? undefined : Number(l.sgst_paise),
      igst_paise: l.igst_paise == null ? undefined : Number(l.igst_paise),
      line_total_paise: l.line_total_paise == null ? undefined : Number(l.line_total_paise),
    }));
}

export function OpenPdfButton({ pdfPath, label = "PDF", size = "sm" }: { pdfPath: string | null; label?: string; size?: "sm" | "default" }) {
  const [busy, setBusy] = useState(false);
  if (!pdfPath) return <span className="text-xs text-muted-foreground">PDF pending</span>;
  return (
    <Button
      size={size}
      variant="outline"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const url = await openSigned("quotations", pdfPath);
        setBusy(false);
        if (!url) toast.error("The PDF could not be opened. It may still be generating.");
      }}
    >
      <FileDown aria-hidden /> {label}
    </Button>
  );
}

type Quotation = Pick<
  Tables<"quotations">,
  | "number"
  | "version"
  | "lines"
  | "subtotal_paise"
  | "tax_paise"
  | "shipping_paise"
  | "total_paise"
  | "tax_mode"
  | "payment_terms"
  | "notes"
  | "valid_until"
  | "status"
  | "pdf_path"
  | "sent_at"
>;

/** GST correct quotation summary: lines with HSN, tax split, totals and terms. */
export function QuotationPreview({ quotation: q, className }: { quotation: Quotation; className?: string }) {
  const lines = parseLines(q.lines);
  const intra = q.tax_mode === "intra";
  return (
    <div className={cn("grid gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold tabular">{q.number}</span>
          <span className="text-xs text-muted-foreground">v{q.version}</span>
          <StatusBadge status={q.status} />
        </div>
        <OpenPdfButton pdfPath={q.pdf_path} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Quotation lines</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1.5 pr-2 font-medium">Item</th>
              <th scope="col" className="py-1.5 pr-2 font-medium">HSN</th>
              <th scope="col" className="py-1.5 pr-2 text-right font-medium">Qty</th>
              <th scope="col" className="py-1.5 pr-2 text-right font-medium">Rate</th>
              <th scope="col" className="py-1.5 pr-2 text-right font-medium">Taxable</th>
              <th scope="col" className="py-1.5 pr-2 text-right font-medium">{intra ? "CGST + SGST" : "IGST"}</th>
              <th scope="col" className="py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={`${l.sku}-${i}`} className="border-b border-border">
                <td className="py-1.5 pr-2">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground">{l.sku}{l.unit ? ` · per ${l.unit}` : ""}</div>
                </td>
                <td className="py-1.5 pr-2 tabular">{l.hsn_code ?? "–"}</td>
                <td className="py-1.5 pr-2 text-right tabular">{l.qty}</td>
                <td className="py-1.5 pr-2 text-right tabular">{formatINR(l.unit_price_paise)}</td>
                <td className="py-1.5 pr-2 text-right tabular">{formatINR(l.taxable_paise ?? l.qty * l.unit_price_paise)}</td>
                <td className="py-1.5 pr-2 text-right tabular">
                  {formatINR(l.tax_paise)}
                  {l.gst_rate !== undefined && <span className="block text-xs text-muted-foreground">{l.gst_rate}%</span>}
                </td>
                <td className="py-1.5 text-right font-medium tabular">{formatINR(l.line_total_paise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto grid w-full max-w-xs gap-1 text-sm">
        <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular">{formatINR(q.subtotal_paise)}</dd></div>
        {intra ? (
          <>
            <div className="flex justify-between"><dt className="text-muted-foreground">CGST</dt><dd className="tabular">{formatINR(lines.reduce((s, l) => s + (l.cgst_paise ?? 0), 0))}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">SGST</dt><dd className="tabular">{formatINR(lines.reduce((s, l) => s + (l.sgst_paise ?? 0), 0))}</dd></div>
          </>
        ) : (
          <div className="flex justify-between"><dt className="text-muted-foreground">IGST</dt><dd className="tabular">{formatINR(q.tax_paise)}</dd></div>
        )}
        {q.shipping_paise > 0 && (
          <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd className="tabular">{formatINR(q.shipping_paise)}</dd></div>
        )}
        <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>Total</dt><dd className="tabular">{formatINR(q.total_paise)}</dd></div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Valid until {formatDate(q.valid_until)}
        {q.sent_at ? ` · sent ${formatDate(q.sent_at)}` : ""}
        {q.payment_terms ? ` · ${q.payment_terms}` : ""}
        {q.notes ? ` · ${q.notes}` : ""}
      </p>
    </div>
  );
}
