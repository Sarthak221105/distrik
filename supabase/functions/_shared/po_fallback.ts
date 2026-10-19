// Regex purchase order parser for simple, text based POs (no AI configured).
// Only lines that name a known SKU are taken; arithmetic cross checks decide
// the confidence. Uncertain fields are left null, never guessed.

export interface ParsedPoLine {
  sku: string | null;
  description: string | null;
  qty: number | null;
  unit_price_paise: number | null;
  total_paise: number | null;
}

export interface ParsedPo {
  po_number: string | null;
  po_date: string | null;
  buyer_name: string | null;
  buyer_gstin: string | null;
  delivery_address: string | null;
  lines: ParsedPoLine[];
  subtotal_paise: number | null;
  tax_paise: number | null;
  total_paise: number | null;
}

export interface PoParseResult {
  parsed: ParsedPo | null;
  field_confidence: Record<string, number>;
  confidence: number;
  uncertain_fields: string[];
}

const NUM = String.raw`(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;

function toNum(s: string): number {
  return Number(s.replace(/,/g, ""));
}
function rupeesToPaise(n: number): number {
  return Math.round(n * 100);
}

function amountAfter(label: RegExp, text: string): number | null {
  const re = new RegExp(label.source + String.raw`\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*` + NUM, "gi");
  let last: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) last = toNum(m[m.length - 1]);
  return last;
}

export function parsePoText(text: string, products: Array<{ sku: string; name: string }>): PoParseResult {
  const t = text.replace(/\r/g, "");
  const poNumber = t.match(/(?:P\.?\s?O\.?|Purchase\s+Order)\s*(?:No\.?|Number|#)?\s*[:\-#]?\s*([A-Z0-9][A-Z0-9\/\-]{2,30})/i)?.[1] ?? null;
  const dateM = t.match(/(?:PO\s+)?Date\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i);
  let poDate: string | null = null;
  if (dateM) {
    const d = dateM[1];
    if (/^\d{4}-/.test(d)) poDate = d;
    else {
      const [dd, mm, yy] = d.split(/[\/\-.]/).map(Number);
      const year = yy < 100 ? 2000 + yy : yy;
      if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) poDate = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }
  const gstin = t.match(/\b(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9])\b/)?.[1] ?? null;
  const buyer = t.match(/(?:Buyer|From|Bill\s*To|Purchaser)\s*[:\-]\s*([^\n]{3,80})/i)?.[1]?.trim() ?? null;
  const address = t.match(/(?:Deliver(?:y)?\s*(?:to|address)|Ship\s*to)\s*[:\-]\s*([^\n]{5,160})/i)?.[1]?.trim() ?? null;

  const lines: ParsedPoLine[] = [];
  const used = new Set<number>();
  for (const p of products) {
    const skuRe = new RegExp(p.sku.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&").replace(/\\-/g, "[-\\s]?"), "gi");
    let m: RegExpExecArray | null;
    while ((m = skuRe.exec(t)) !== null) {
      if (used.has(m.index)) continue;
      used.add(m.index);
      const tail = t.slice(m.index + m[0].length, m.index + m[0].length + 160).split(/\n(?=\S*[A-Z]{2,}-?\d)/)[0];
      // numbers in the tail, ignoring pack sizes like "5 L" or "100 g"
      const nums = [...tail.matchAll(new RegExp(NUM + String.raw`(?!\s*(?:L|Ltr|litre|kg|g|gm|ml|%)\b)`, "gi"))]
        .map((x) => toNum(x[1]));
      // Description: product name if present nearby.
      const qty = nums.find((n) => Number.isInteger(n) && n > 0 && n < 1_000_000) ?? null;
      const after = qty !== null ? nums.slice(nums.indexOf(qty) + 1) : [];
      const rate = after[0] ?? null;
      const amount = after[1] ?? null;
      lines.push({
        sku: p.sku,
        description: p.name,
        qty,
        unit_price_paise: rate !== null ? rupeesToPaise(rate) : null,
        total_paise: amount !== null ? rupeesToPaise(amount) : null,
      });
    }
  }

  const total = amountAfter(/(?:Grand\s+Total|Total\s+Amount|Net\s+Amount|Total\s+Payable|Total)/, t);
  const subtotal = amountAfter(/(?:Sub\s*-?\s*total|Taxable\s+(?:Value|Amount))/, t);
  const tax = amountAfter(/(?:GST|IGST|Total\s+Tax|Tax)\s*(?:@\s*\d+(?:\.\d+)?\s*%)?/, t);

  const fc: Record<string, number> = {};
  fc.po_number = poNumber ? 0.85 : 0;
  const linesOk = lines.length > 0 && lines.every((l) => l.qty !== null && l.unit_price_paise !== null);
  const arithmeticOk = linesOk && lines.every((l) => l.total_paise === null || Math.abs((l.qty ?? 0) * (l.unit_price_paise ?? 0) - l.total_paise) <= 100);
  const lineSum = lines.reduce((s, l) => s + (l.qty ?? 0) * (l.unit_price_paise ?? 0), 0);
  const subtotalPaise = subtotal !== null ? rupeesToPaise(subtotal) : null;
  const totalPaise = total !== null ? rupeesToPaise(total) : null;
  const taxPaise = tax !== null ? rupeesToPaise(tax) : null;
  const totalsOk = totalPaise !== null && (
    Math.abs(totalPaise - lineSum) <= 100 ||
    (subtotalPaise !== null && Math.abs(subtotalPaise - lineSum) <= 100 && (taxPaise === null || Math.abs(subtotalPaise + taxPaise - totalPaise) <= 100))
  );
  fc.lines = linesOk ? (arithmeticOk ? 0.9 : 0.6) : lines.length ? 0.4 : 0;
  fc.qty = linesOk ? (arithmeticOk ? 0.9 : 0.6) : 0;
  fc.unit_price = linesOk ? (arithmeticOk ? 0.9 : 0.55) : 0;
  fc.total = totalPaise === null ? 0 : totalsOk ? 0.9 : 0.5;

  if (!lines.length && !poNumber && totalPaise === null) {
    return { parsed: null, field_confidence: fc, confidence: 0, uncertain_fields: Object.keys(fc) };
  }
  const uncertain = Object.entries(fc).filter(([, v]) => v < 0.7).map(([k]) => k);
  const confidence = Math.min(...["lines", "qty", "unit_price", "total"].map((k) => fc[k] ?? 0), 0.95) * (poNumber ? 1 : 0.9);
  return {
    parsed: {
      po_number: poNumber,
      po_date: poDate,
      buyer_name: buyer,
      buyer_gstin: gstin,
      delivery_address: address,
      lines,
      subtotal_paise: subtotalPaise,
      tax_paise: taxPaise,
      total_paise: totalPaise,
    },
    field_confidence: fc,
    confidence: Math.round(confidence * 1000) / 1000,
    uncertain_fields: uncertain,
  };
}
