// Price validator (PRD 9 guardrails). Any rupee amount in a drafted reply that
// was not returned by evaluate_offer / negotiate_offer / settle_negotiation in
// the same turn blocks the reply. Detection covers English, Hindi and Hinglish
// phrasing: ₹, Rs, Rs., INR, rupees, rupaye, रुपये, /-, "per jar", "@ 558",
// "rate 558", lakh / crore / thousand multipliers and Devanagari digits.

export type AmountKind = "currency" | "per_unit" | "price_word";

export interface AmountMatch {
  raw: string;
  rupees: number;
  paise: number;
  index: number;
  kind: AmountKind;
}

export interface ValidationResult {
  ok: boolean;
  amounts: AmountMatch[];
  violations: AmountMatch[];
}

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

export function normalizeDigits(text: string): string {
  let out = "";
  for (const ch of text) {
    const i = DEVANAGARI_DIGITS.indexOf(ch);
    out += i >= 0 ? String(i) : ch;
  }
  return out.replace(/[   ]/g, " ");
}

// 5,58,000 | 55,800.50 | 558 | 558.00 | 5.58
const NUM = String.raw`(?<!\d)(?<!\d[.,])(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?!\d|[.,]\d)`;
const MULT = String.raw`(?:\s*(lakhs?|lacs?|crores?|cr\b|k\b|thousand|hazaa?r|हज़ार|हजार|लाख|करोड़))?`;
const CUR_WORD = String.raw`(?:₹|(?<![a-z])rs\.?|(?<![a-z])inr\b|(?<![a-z])rupe(?:e|es)\b|(?<![a-z])rupa(?:ye|y|iye|iya)\b|(?<![a-z])rupiya\b|रुपये|रुपए|रुपया|रु\.?)`;
const CUR_SUFFIX = String.raw`(?:\s*\/-|\s*(?:rs\b\.?|inr\b|rupe(?:e|es)\b|rupa(?:ye|y|iye|iya)\b|rupiya\b|₹|रुपये|रुपए|रुपया|रु\b\.?))`;
const UNIT = String.raw`(?:jars?|units?|cartons?|ctns?|bottles?|packs?|packets?|pieces?|pcs?|kgs?|kilo|litres?|liters?|ltrs?|boxe?s?|peti|dabb[ae]|cans?|bags?|tins?|pouch(?:es)?|जार|कार्टन|पेटी|डिब्बा|बोतल)`;
const PRICE_WORD = String.raw`(?:price|prices|rate|rates|daam|dam|bhav|bhaav|keemat|kimat|qeemat|cost|offer|मूल्य|दाम|भाव|कीमत|रेट)`;
const FILLER = String.raw`(?:\s*(?:is|hai|h|of|:|-|=|will\s+be|would\s+be|hoga|hogi|rahega|milega|lagega|just|only|sirf|bas|at|@|abhi|now))*`;

const RE_PREFIX = new RegExp(CUR_WORD + String.raw`\s*` + NUM + MULT, "giu");
const RE_SUFFIX = new RegExp(NUM + MULT + CUR_SUFFIX, "giu");
const RE_AT = new RegExp(String.raw`@\s*` + NUM + MULT, "giu");
const RE_PER = new RegExp(NUM + MULT + String.raw`\s*(?:per|\/|prati|pratee|har|each|a)\s*` + UNIT, "giu");
const RE_WORD = new RegExp(PRICE_WORD + FILLER + String.raw`\s*` + NUM + MULT + String.raw`(?!\s*(?:` + UNIT + String.raw`|%|percent|din|days?|hafte|weeks?|months?|mahine))`, "giu");

function multiplier(m: string | undefined): number {
  if (!m) return 1;
  const s = m.toLowerCase();
  if (s.startsWith("lakh") || s.startsWith("lac") || s === "लाख") return 100_000;
  if (s.startsWith("crore") || s === "cr" || s === "करोड़") return 10_000_000;
  if (s === "k" || s === "thousand" || s.startsWith("hazar") || s.startsWith("hazaar") || s === "हज़ार" || s === "हजार") return 1000;
  return 1;
}

function parseNum(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

/** Finds every rupee amount (currency marked or price shaped) in a reply. */
export function extractRupeeAmounts(input: string): AmountMatch[] {
  const text = normalizeDigits(input);
  const found: AmountMatch[] = [];
  const spans: Array<[number, number]> = [];
  const add = (re: RegExp, kind: AmountKind, numGroup: number, multGroup: number) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (spans.some(([s, e]) => start < e && end > s)) continue;
      const n = parseNum(m[numGroup]);
      if (!Number.isFinite(n)) continue;
      const rupees = n * multiplier(m[multGroup]);
      spans.push([start, end]);
      found.push({ raw: m[0].trim(), rupees, paise: Math.round(rupees * 100), index: start, kind });
    }
  };
  add(RE_PREFIX, "currency", 1, 2);
  add(RE_SUFFIX, "currency", 1, 2);
  add(RE_AT, "per_unit", 1, 2);
  add(RE_PER, "per_unit", 1, 2);
  add(RE_WORD, "price_word", 1, 2);
  return found.sort((a, b) => a.index - b.index);
}

/** Allowed amounts plus their totals for the quantities discussed this turn. */
export function expandAllowed(prices: Iterable<number>, qtys: Iterable<number> = []): Set<number> {
  const out = new Set<number>();
  const q = [...qtys].filter((x) => Number.isInteger(x) && x > 0);
  for (const p of prices) {
    if (!Number.isFinite(p) || p <= 0) continue;
    out.add(Math.round(p));
    for (const n of q) out.add(Math.round(p) * n);
  }
  return out;
}

export function validatePrices(text: string, allowedPaise: Iterable<number>): ValidationResult {
  const allowed = [...allowedPaise];
  const amounts = extractRupeeAmounts(text);
  const violations = amounts.filter((a) => !allowed.some((p) => Math.abs(p - a.paise) <= 1));
  return { ok: violations.length === 0, amounts, violations };
}
