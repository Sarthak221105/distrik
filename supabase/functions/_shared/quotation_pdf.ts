// A4 GST quotation built with pdf-lib. Standard PDF fonts cannot render the
// rupee sign or Devanagari, so text is sanitised to WinAnsi and amounts use "Rs.".

import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";
import { amountInWords, formatINR } from "./money.ts";

export interface QuotationLine {
  sku: string;
  name: string;
  unit: string;
  hsn_code: string | null;
  qty: number;
  unit_price_paise: number;
  gst_rate: number;
  taxable_paise: number;
  tax_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  line_total_paise: number;
}

export interface QuotationPdfInput {
  number: string;
  version: number;
  date: string; // ISO
  validUntil: string; // YYYY-MM-DD
  taxMode: "intra" | "inter";
  seller: {
    name: string;
    legalName: string | null;
    gstin: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    stateCode: string | null;
    phone: string | null;
    email: string | null;
  };
  buyer: {
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    stateCode: string | null;
    gstin: string | null;
  };
  lines: QuotationLine[];
  subtotalPaise: number;
  taxPaise: number;
  shippingPaise: number;
  totalPaise: number;
  paymentTerms: string | null;
  notes: string | null;
}

const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split(""));

/** Makes text safe for the standard (WinAnsi) fonts. */
export function pdfSafe(s: string | null | undefined): string {
  if (!s) return "";
  let out = "";
  for (const ch of s.replace(/₹\s?/g, "Rs. ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')) {
    const c = ch.codePointAt(0)!;
    if (ch === "\n" || ch === "\t") out += " ";
    else if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch)) out += ch;
    else out += "?";
  }
  return out;
}

const A4: [number, number] = [595.28, 841.89];
const M = 36;
const INK = rgb(0.12, 0.13, 0.16);
const MUTED = rgb(0.42, 0.44, 0.48);
const RULE = rgb(0.82, 0.84, 0.87);
const BAND = rgb(0.94, 0.95, 0.97);

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(next, size) <= width) cur = next;
    else {
      if (cur) lines.push(cur);
      // hard break very long tokens
      let token = w;
      while (font.widthOfTextAtSize(token, size) > width && token.length > 1) {
        let i = token.length;
        while (i > 1 && font.widthOfTextAtSize(token.slice(0, i), size) > width) i--;
        lines.push(token.slice(0, i));
        token = token.slice(i);
      }
      cur = token;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

export async function buildQuotationPdf(q: QuotationPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Quotation ${q.number} v${q.version}`));
  doc.setAuthor(pdfSafe(q.seller.legalName ?? q.seller.name));
  doc.setCreator("Distrik AI Sales OS");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage(A4);
  const W = A4[0] - 2 * M;
  let y = A4[1] - M;

  const text = (s: string, x: number, yy: number, size = 9, f = font, color = INK) =>
    page.drawText(pdfSafe(s), { x, y: yy, size, font: f, color });
  const right = (s: string, xRight: number, yy: number, size = 9, f = font, color = INK) => {
    const t = pdfSafe(s);
    page.drawText(t, { x: xRight - f.widthOfTextAtSize(t, size), y: yy, size, font: f, color });
  };
  const hr = (yy: number, color = RULE, thickness = 0.7) =>
    page.drawLine({ start: { x: M, y: yy }, end: { x: M + W, y: yy }, thickness, color });

  // Header: seller
  text(q.seller.legalName ?? q.seller.name, M, y - 14, 15, bold);
  y -= 30;
  const sellerLines = [
    q.seller.address,
    [q.seller.city, q.seller.state].filter(Boolean).join(", ") + (q.seller.stateCode ? ` (State code ${q.seller.stateCode})` : ""),
    q.seller.gstin ? `GSTIN: ${q.seller.gstin}` : null,
    [q.seller.phone, q.seller.email].filter(Boolean).join("  |  "),
  ].filter((l): l is string => Boolean(l && l.trim()));
  for (const l of sellerLines) {
    for (const w of wrap(l, font, 8.5, W * 0.6)) {
      text(w, M, y, 8.5, font, MUTED);
      y -= 11;
    }
  }
  // Title block (right)
  const top = A4[1] - M;
  right("QUOTATION", M + W, top - 14, 18, bold);
  right(`No. ${q.number}`, M + W, top - 32, 9.5, bold);
  right(`Version ${q.version}`, M + W, top - 45, 9);
  right(`Date: ${new Date(q.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}`, M + W, top - 58, 9);
  right(`Valid until: ${new Date(q.validUntil + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}`, M + W, top - 71, 9);
  y = Math.min(y, top - 84) - 6;
  hr(y, INK, 1);
  y -= 16;

  // Buyer block
  text("QUOTATION FOR", M, y, 8, bold, MUTED);
  text("SUPPLY TERMS", M + W * 0.58, y, 8, bold, MUTED);
  y -= 13;
  const yBuyer = y;
  text(q.buyer.name, M, y, 10.5, bold);
  y -= 13;
  const buyerLines = [
    q.buyer.address,
    [q.buyer.city, q.buyer.state].filter(Boolean).join(", "),
    q.buyer.stateCode ? `GST state code: ${q.buyer.stateCode}` : null,
    q.buyer.gstin ? `GSTIN: ${q.buyer.gstin}` : null,
  ].filter((l): l is string => Boolean(l && l.trim()));
  for (const l of buyerLines) {
    for (const w of wrap(l, font, 9, W * 0.52)) {
      text(w, M, y, 9);
      y -= 11.5;
    }
  }
  let yt = yBuyer;
  const terms = [
    `Tax: ${q.taxMode === "intra" ? "CGST + SGST (intra state)" : "IGST (inter state)"}`,
    `Place of supply: ${q.buyer.state ?? "-"}`,
    `Currency: INR`,
  ];
  for (const t of terms) {
    text(t, M + W * 0.58, yt, 9);
    yt -= 11.5;
  }
  y = Math.min(y, yt) - 10;

  // Line table
  const cols = q.taxMode === "intra"
    ? [
      { k: "sno", h: "#", w: 18, a: "l" },
      { k: "item", h: "Item / SKU", w: 150, a: "l" },
      { k: "hsn", h: "HSN", w: 38, a: "l" },
      { k: "qty", h: "Qty", w: 52, a: "r" },
      { k: "rate", h: "Rate (Rs.)", w: 58, a: "r" },
      { k: "taxable", h: "Taxable (Rs.)", w: 66, a: "r" },
      { k: "gst", h: "GST", w: 28, a: "r" },
      { k: "tax", h: "CGST / SGST", w: 56, a: "r" },
      { k: "amount", h: "Amount (Rs.)", w: W - 466, a: "r" },
    ]
    : [
      { k: "sno", h: "#", w: 18, a: "l" },
      { k: "item", h: "Item / SKU", w: 150, a: "l" },
      { k: "hsn", h: "HSN", w: 38, a: "l" },
      { k: "qty", h: "Qty", w: 52, a: "r" },
      { k: "rate", h: "Rate (Rs.)", w: 58, a: "r" },
      { k: "taxable", h: "Taxable (Rs.)", w: 66, a: "r" },
      { k: "gst", h: "GST", w: 28, a: "r" },
      { k: "tax", h: "IGST", w: 56, a: "r" },
      { k: "amount", h: "Amount (Rs.)", w: W - 466, a: "r" },
    ];

  const drawHeader = () => {
    page.drawRectangle({ x: M, y: y - 5, width: W, height: 17, color: BAND });
    let x = M;
    for (const c of cols) {
      if (c.a === "r") right(c.h, x + c.w - 3, y, 7.5, bold);
      else text(c.h, x + 3, y, 7.5, bold);
      x += c.w;
    }
    y -= 18;
  };
  drawHeader();

  q.lines.forEach((l, i) => {
    const itemLines = [...wrap(l.name, font, 8, cols[1].w - 6), ...wrap(`SKU ${l.sku}`, font, 7, cols[1].w - 6)];
    const h = Math.max(1, itemLines.length) * 10 + 6;
    if (y - h < 200) {
      page = doc.addPage(A4);
      y = A4[1] - M - 10;
      drawHeader();
    }
    const tax = q.taxMode === "intra" ? `${formatINR(l.cgst_paise)}\n${formatINR(l.sgst_paise)}` : formatINR(l.igst_paise);
    const cells: Record<string, string> = {
      sno: String(i + 1),
      hsn: l.hsn_code ?? "-",
      qty: `${l.qty} ${l.unit}`,
      rate: formatINR(l.unit_price_paise),
      taxable: formatINR(l.taxable_paise),
      gst: `${Number(l.gst_rate)}%`,
      tax,
      amount: formatINR(l.line_total_paise),
    };
    let x = M;
    for (const c of cols) {
      if (c.k === "item") {
        let yy = y;
        itemLines.forEach((t, j) => {
          text(t, x + 3, yy, j < itemLines.length - 1 || itemLines.length === 1 ? 8 : 7, font, t.startsWith("SKU ") ? MUTED : INK);
          yy -= 10;
        });
      } else {
        const val = cells[c.k] ?? "";
        const size = c.k === "qty" && val.length > 12 ? 6.5 : 8;
        const lines = c.k === "qty" ? wrap(val, font, size, c.w - 4) : val.split("\n");
        lines.forEach((t, j) => {
          if (c.a === "r") right(t, x + c.w - 3, y - j * 9, size);
          else text(t, x + 3, y - j * 9, size);
        });
      }
      x += c.w;
    }
    y -= h;
    hr(y + 4);
  });

  // Totals
  y -= 8;
  const tx = M + W * 0.55;
  const totalsRow = (label: string, value: string, strong = false) => {
    text(label, tx, y, strong ? 10 : 9, strong ? bold : font);
    right(value, M + W, y, strong ? 10 : 9, strong ? bold : font);
    y -= strong ? 16 : 13;
  };
  totalsRow("Taxable value", `Rs. ${formatINR(q.subtotalPaise)}`);
  if (q.taxMode === "intra") {
    const cg = q.lines.reduce((s, l) => s + l.cgst_paise, 0);
    const sg = q.lines.reduce((s, l) => s + l.sgst_paise, 0);
    totalsRow("CGST", `Rs. ${formatINR(cg)}`);
    totalsRow("SGST", `Rs. ${formatINR(sg)}`);
  } else {
    totalsRow("IGST", `Rs. ${formatINR(q.taxPaise)}`);
  }
  if (q.shippingPaise) totalsRow("Shipping", `Rs. ${formatINR(q.shippingPaise)}`);
  page.drawLine({ start: { x: tx, y: y + 9 }, end: { x: M + W, y: y + 9 }, thickness: 1, color: INK });
  totalsRow("Total", `Rs. ${formatINR(q.totalPaise)}`, true);

  y -= 4;
  text("Amount in words", M, y, 8, bold, MUTED);
  y -= 12;
  for (const w of wrap(amountInWords(q.totalPaise), bold, 9, W)) {
    text(w, M, y, 9, bold);
    y -= 12;
  }
  y -= 6;
  const block = (title: string, body: string | null) => {
    if (!body) return;
    text(title, M, y, 8, bold, MUTED);
    y -= 12;
    for (const w of wrap(body, font, 9, W * 0.62)) {
      text(w, M, y, 9);
      y -= 11.5;
    }
    y -= 6;
  };
  block("Payment terms", q.paymentTerms);
  block("Notes", q.notes);
  block("Validity", `Prices are valid until the date above and are exclusive of GST unless shown. Subject to stock availability.`);

  // Signature
  const sy = Math.max(y - 10, 70);
  right(`For ${q.seller.legalName ?? q.seller.name}`, M + W, sy, 9, bold);
  page.drawLine({ start: { x: M + W - 160, y: sy - 34 }, end: { x: M + W, y: sy - 34 }, thickness: 0.7, color: INK });
  right("Authorised signatory", M + W, sy - 46, 8, font, MUTED);

  // Footer on every page
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const f = `System generated quotation  |  ${q.number} v${q.version}  |  Page ${i + 1} of ${pages.length}`;
    const t = pdfSafe(f);
    p.drawText(t, { x: (A4[0] - font.widthOfTextAtSize(t, 7.5)) / 2, y: 22, size: 7.5, font, color: MUTED });
  });

  return await doc.save();
}

export function quotationFileKey(manufacturerId: string, number: string, version: number): string {
  return `${manufacturerId}/${number.replace(/\//g, "-")}-v${version}.pdf`;
}
