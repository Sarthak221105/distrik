// Minimal RFC 4180 CSV parsing for buyer list imports (quoted fields, escaped
// quotes, CRLF, BOM). Runs in the browser; rows go to import_prospect_records.

export const CSV_COLUMNS = [
  "name",
  "phone",
  "email",
  "address",
  "city",
  "state",
  "pincode",
  "type",
  "category_hint",
  "contact_name",
  "contact_role",
  "website",
  "source_url",
  "lat",
  "lng",
] as const;

export type CsvRow = Partial<Record<(typeof CSV_COLUMNS)[number], string | number>>;

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export type CsvParseResult = {
  rows: CsvRow[];
  headers: string[];
  unknownColumns: string[];
  missingName: boolean;
  skipped: number;
  errors: string[];
};

export function parseProspectCsv(text: string): CsvParseResult {
  const table = parseCsvText(text);
  const errors: string[] = [];
  if (table.length === 0) return { rows: [], headers: [], unknownColumns: [], missingName: true, skipped: 0, errors: ["The file is empty."] };
  const headers = table[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const known = new Set<string>(CSV_COLUMNS);
  const unknownColumns = headers.filter((h) => h && !known.has(h));
  const missingName = !headers.includes("name");
  let skipped = 0;
  const rows: CsvRow[] = [];
  table.slice(1).forEach((cells, idx) => {
    const row: CsvRow = {};
    headers.forEach((h, i) => {
      if (!known.has(h)) return;
      const v = (cells[i] ?? "").trim();
      if (!v) return;
      if (h === "lat" || h === "lng") {
        const n = Number(v);
        if (Number.isFinite(n)) row[h] = n;
        else errors.push(`Row ${idx + 2}: ${h} "${v}" is not a number (ignored)`);
      } else {
        row[h as Exclude<(typeof CSV_COLUMNS)[number], "lat" | "lng">] = v;
      }
    });
    if (!row.name) {
      skipped++;
      return;
    }
    rows.push(row);
  });
  return { rows, headers, unknownColumns, missingName, skipped, errors: errors.slice(0, 10) };
}
