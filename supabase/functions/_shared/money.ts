// Money is integer paise everywhere. Formatting uses Indian digit grouping
// (12,34,567.00) and Indian numbering words (lakh, crore).

/** Groups an integer string the Indian way: 1234567 -> 12,34,567 */
export function groupIndian(intDigits: string): string {
  const neg = intDigits.startsWith("-");
  const d = neg ? intDigits.slice(1) : intDigits;
  if (d.length <= 3) return (neg ? "-" : "") + d;
  const last3 = d.slice(-3);
  let rest = d.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return (neg ? "-" : "") + parts.join(",") + "," + last3;
}

/** 3515400 paise -> "35,154.00" (always two decimals). */
export function formatINR(paise: number): string {
  const p = Math.round(paise);
  const neg = p < 0;
  const abs = Math.abs(p);
  const rupees = Math.floor(abs / 100);
  const fr = String(abs % 100).padStart(2, "0");
  return (neg ? "-" : "") + groupIndian(String(rupees)) + "." + fr;
}

/** For chat replies: 55800 -> "₹558", 55850 -> "₹558.50". */
export function formatRupees(paise: number, symbol = "₹"): string {
  const p = Math.round(paise);
  const rupees = Math.floor(Math.abs(p) / 100);
  const fr = Math.abs(p) % 100;
  return (p < 0 ? "-" : "") + symbol + groupIndian(String(rupees)) + (fr ? "." + String(fr).padStart(2, "0") : "");
}

/** Rupees (possibly fractional) to paise, rounded. */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return (TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "")).trim();
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(ONES[h] + " Hundred");
  if (r) parts.push(twoDigits(r));
  return parts.join(" ");
}

/** Integer to words in the Indian system: 3515400 -> "Thirty Five Lakh Fifteen Thousand Four Hundred". */
export function numberToIndianWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  let rest = n % 10_000_000;
  if (crore) parts.push(numberToIndianWords(crore) + " Crore");
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  if (lakh) parts.push(twoDigits(lakh) + " Lakh");
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  if (thousand) parts.push(twoDigits(thousand) + " Thousand");
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** 3515440 paise -> "Rupees Thirty Five Thousand One Hundred Fifty Four and Forty Paise Only" */
export function amountInWords(paise: number): string {
  const p = Math.round(Math.abs(paise));
  const rupees = Math.floor(p / 100);
  const fr = p % 100;
  let s = "Rupees " + numberToIndianWords(rupees);
  if (fr) s += " and " + twoDigits(fr) + " Paise";
  return s + " Only";
}
