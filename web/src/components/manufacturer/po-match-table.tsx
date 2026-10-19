import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { formatINR, titleCase } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { parseLines, type QuoteLine } from "@/components/manufacturer/quotation-preview";

type Diff = { field: string; sku?: string | null; quotation?: Json; po?: Json; issue?: string | null };

export function parseDiffs(raw: Json | null | undefined): Diff[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((d): d is Record<string, Json> => !!d && typeof d === "object" && !Array.isArray(d)).map((d) => ({
    field: String(d.field ?? ""),
    sku: (d.sku as string | null) ?? null,
    quotation: d.quotation,
    po: d.po,
    issue: (d.issue as string | null) ?? null,
  }));
}

const FIELD_LABEL: Record<string, string> = {
  qty: "Quantity",
  unit_price_paise: "Unit price",
  total_paise: "Total",
  line: "Line item",
  quotation: "Quotation",
  parsed: "PO reading",
};

const ISSUE_LABEL: Record<string, string> = {
  missing_in_po: "In the quotation but missing from the PO",
  extra_in_po: "In the PO but not on the quotation",
  no_sent_quotation: "No sent quotation to match against",
  not_parsed: "The PO has not been read yet",
};

function fmt(field: string, v: Json | undefined) {
  if (v === null || v === undefined || v === "") return "–";
  if (field.endsWith("_paise")) return formatINR(Number(v));
  return String(v);
}

const LOW = 0.7;

function confidenceFor(fc: Record<string, number>, key: string) {
  const v = fc[key];
  return typeof v === "number" ? v : null;
}

function ConfidenceFlag({ value }: { value: number | null }) {
  if (value === null) return null;
  return value < LOW ? (
    <Badge tone="warning" title={`Read with ${Math.round(value * 100)}% confidence`}>
      <AlertTriangle aria-hidden /> Low confidence {Math.round(value * 100)}%
    </Badge>
  ) : (
    <span className="text-[11px] text-muted-foreground tabular">{Math.round(value * 100)}%</span>
  );
}

/**
 * POMatchTable: field level diff between a parsed purchase order and its
 * quotation, with parsed lines beside quotation lines and low confidence
 * fields flagged. Differences carry an icon and text, never colour alone.
 */
export function POMatchTable({
  diffs: rawDiffs,
  parsed: rawParsed,
  fieldConfidence,
  quotationLines,
  quotationTotal,
}: {
  diffs: Json | null | undefined;
  parsed: Json | null | undefined;
  fieldConfidence: Json | null | undefined;
  quotationLines: Json | null | undefined;
  quotationTotal: number | null | undefined;
}) {
  const diffs = parseDiffs(rawDiffs);
  const parsed = (rawParsed && typeof rawParsed === "object" && !Array.isArray(rawParsed) ? rawParsed : {}) as Record<string, Json>;
  const fc = (fieldConfidence && typeof fieldConfidence === "object" && !Array.isArray(fieldConfidence) ? fieldConfidence : {}) as Record<
    string,
    number
  >;
  const qLines = parseLines(quotationLines);
  const pLines = parseLines(parsed.lines ?? null);

  // Pair lines by SKU, then by name.
  const used = new Set<number>();
  const pairs: { q: QuoteLine | null; p: QuoteLine | null }[] = qLines.map((q) => {
    let idx = pLines.findIndex((p, i) => !used.has(i) && !!p.sku && p.sku.toUpperCase() === (q.sku ?? "").toUpperCase());
    if (idx < 0)
      idx = pLines.findIndex(
        (p, i) => !used.has(i) && !!p.name && !!q.name && p.name.toLowerCase().includes(q.name.toLowerCase().split(" ")[0] ?? ""),
      );
    if (idx >= 0) used.add(idx);
    return { q, p: idx >= 0 ? pLines[idx]! : null };
  });
  pLines.forEach((p, i) => !used.has(i) && pairs.push({ q: null, p }));

  const linesConf = confidenceFor(fc, "lines");
  const qtyConf = confidenceFor(fc, "qty");
  const priceConf = confidenceFor(fc, "unit_price");
  const totalConf = confidenceFor(fc, "total");
  const poTotal = parsed.total_paise == null ? null : Number(parsed.total_paise);

  const headerFields: [string, string, Json | undefined][] = [
    ["po_number", "PO number", parsed.po_number],
    ["po_date", "PO date", parsed.po_date],
    ["buyer_name", "Buyer", parsed.buyer_name],
    ["buyer_gstin", "Buyer GSTIN", parsed.buyer_gstin],
    ["delivery_address", "Delivery address", parsed.delivery_address],
  ];

  return (
    <div className="grid gap-5">
      <section aria-labelledby="diff-h" className="grid gap-2">
        <h3 id="diff-h" className="flex items-center gap-2 text-sm font-semibold">
          {diffs.length === 0 ? (
            <>
              <CheckCircle2 className="size-4 text-success" aria-hidden /> No differences found
            </>
          ) : (
            <>
              <XCircle className="size-4 text-danger" aria-hidden /> {diffs.length} difference{diffs.length === 1 ? "" : "s"} from the quotation
            </>
          )}
        </h3>
        {diffs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Field level differences</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1.5 pr-2 font-medium">Field</th>
                  <th scope="col" className="py-1.5 pr-2 font-medium">SKU</th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-medium">Quotation</th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-medium">PO says</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((d, i) => (
                  <tr key={i} className="border-b border-border bg-danger-soft/40 align-top">
                    <td className="py-1.5 pr-2">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <XCircle className="size-3.5 text-danger" aria-hidden />
                        {FIELD_LABEL[d.field] ?? titleCase(d.field)}
                      </span>
                      {d.issue && <span className="block text-xs text-muted-foreground">{ISSUE_LABEL[d.issue] ?? titleCase(d.issue)}</span>}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-xs">{d.sku ?? "–"}</td>
                    <td className="py-1.5 pr-2 text-right tabular">{fmt(d.field, d.quotation)}</td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular">{fmt(d.field, d.po)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="lines-h" className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="lines-h" className="text-sm font-semibold">Lines side by side</h3>
          <ConfidenceFlag value={linesConf} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Quotation lines compared with purchase order lines</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1.5 pr-2 font-medium">Item</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">Qty quoted</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">
                  Qty on PO {qtyConf !== null && qtyConf < LOW && <AlertTriangle className="inline size-3 text-warning" aria-label="low confidence" />}
                </th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">Rate quoted</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">
                  Rate on PO {priceConf !== null && priceConf < LOW && <AlertTriangle className="inline size-3 text-warning" aria-label="low confidence" />}
                </th>
              </tr>
            </thead>
            <tbody>
              {pairs.map(({ q, p }, i) => {
                const qtyDiff = !!q && !!p && q.qty !== p.qty;
                const priceDiff = !!q && !!p && Math.abs(q.unit_price_paise - p.unit_price_paise) > 100;
                return (
                  <tr key={i} className="border-b border-border">
                    <td className="py-1.5 pr-2">
                      <div className="font-medium">{q?.name ?? p?.name ?? "–"}</div>
                      <div className="text-xs text-muted-foreground">
                        {q?.sku ?? p?.sku}
                        {!q && " · not on the quotation"}
                        {!p && " · missing from the PO"}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular">{q ? q.qty : "–"}</td>
                    <td className={cn("py-1.5 pr-2 text-right tabular", qtyDiff && "font-semibold text-danger")}>
                      {p ? p.qty : "–"}
                      {qtyDiff && <span className="sr-only"> (differs)</span>}
                      {qtyDiff && <XCircle className="ml-1 inline size-3" aria-hidden />}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular">{q ? formatINR(q.unit_price_paise) : "–"}</td>
                    <td className={cn("py-1.5 pr-2 text-right tabular", priceDiff && "font-semibold text-danger")}>
                      {p ? formatINR(p.unit_price_paise) : "–"}
                      {priceDiff && <span className="sr-only"> (differs)</span>}
                      {priceDiff && <XCircle className="ml-1 inline size-3" aria-hidden />}
                    </td>
                  </tr>
                );
              })}
              <tr className="font-medium">
                <td className="py-1.5 pr-2">
                  Total <ConfidenceFlag value={totalConf} />
                </td>
                <td colSpan={2} className="py-1.5 pr-2 text-right tabular">
                  {formatINR(quotationTotal)} quoted
                </td>
                <td
                  colSpan={2}
                  className={cn(
                    "py-1.5 pr-2 text-right tabular",
                    poTotal !== null && quotationTotal != null && Math.abs(poTotal - quotationTotal) > 100 && "text-danger",
                  )}
                >
                  {poTotal === null ? "– on PO" : `${formatINR(poTotal)} on PO`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="hdr-h" className="grid gap-2">
        <h3 id="hdr-h" className="text-sm font-semibold">What the AI read from the PO</h3>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {headerFields.map(([key, label, v]) => (
            <div key={key}>
              <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                {label} <ConfidenceFlag value={confidenceFor(fc, key)} />
              </dt>
              <dd className={cn(key === "buyer_gstin" && "font-mono text-xs")}>{v == null || v === "" ? <span className="text-muted-foreground">Not found</span> : String(v)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
