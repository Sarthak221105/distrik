import { formatDistanceToNowStrict, format as formatDateFns } from "date-fns";

// Money is stored as integer paise everywhere; format only at the edge.
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

export function formatINR(paise: number | null | undefined, opts: { whole?: boolean } = {}): string {
  if (paise === null || paise === undefined) return "–";
  const rupees = paise / 100;
  if (opts.whole || Number.isInteger(rupees)) return inrWhole.format(rupees);
  return inr.format(rupees);
}

// ₹12.4L / ₹1.2Cr style for dashboards.
export function formatINRCompact(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "–";
  const rupees = paise / 100;
  if (rupees >= 1e7) return `₹${(rupees / 1e7).toFixed(rupees >= 1e8 ? 0 : 1)}Cr`;
  if (rupees >= 1e5) return `₹${(rupees / 1e5).toFixed(rupees >= 1e6 ? 0 : 1)}L`;
  if (rupees >= 1e3) return `₹${(rupees / 1e3).toFixed(1)}K`;
  return `₹${Math.round(rupees)}`;
}

export function rupeesToPaise(rupees: string | number): number {
  const n = typeof rupees === "number" ? rupees : Number(String(rupees).replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  return new Intl.NumberFormat("en-IN").format(n);
}

export function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  return compact.format(n);
}

export function formatDate(value: string | Date | null | undefined, pattern = "d MMM yyyy"): string {
  if (!value) return "–";
  return formatDateFns(typeof value === "string" ? new Date(value) : value, pattern);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, "d MMM, h:mm a");
}

export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return "–";
  return formatDistanceToNowStrict(typeof value === "string" ? new Date(value) : value, { addSuffix: true });
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "–";
  const m = e164.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
