// Deterministic parser for a plain language Start Sales objective, e.g.
// "Find 75 FMCG distributors and super stockists in Bhopal for our mustard oil".

import { normalizeDigits } from "./price_validator.ts";
import { CITIES, findCity } from "./india_cities.ts";

export interface ParsedObjective {
  city: string | null;
  state: string | null;
  category: string | null;
  target_count: number;
  buyer_types: string[];
  product_hints: string[];
  confidence: number;
  clarifications: string[];
}

const TYPE_WORDS: Array<[RegExp, string]> = [
  [/super[\s-]?stockists?|\bss\b|c\s?&\s?f/i, "super_stockist"],
  [/distributors?|distribution|distributer/i, "distributor"],
  [/wholesal(e|ers?)|thok/i, "wholesaler"],
  [/dealers?|dealership/i, "dealer"],
  [/retail(ers?)?|kirana|shops?|stores?|dukaan/i, "retailer"],
  [/modern trade|supermarkets?|hypermarkets?/i, "modern_trade"],
];

const CATEGORY_WORDS: Array<[RegExp, string]> = [
  [/edible oil|mustard|sarson|cooking oil|refined oil|groundnut oil|\boils?\b|\btel\b/i, "edible_oil"],
  [/spices?|masala|haldi|turmeric|chilli|mirch|garam/i, "spices"],
  [/home care|detergent|cleaner|phenyl|dishwash/i, "home_care"],
  [/personal care|soap|shampoo|toothpaste|cosmetic/i, "personal_care"],
  [/snacks?|namkeen|biscuits?|chips/i, "snacks"],
  [/beverages?|juice|tea|coffee|drinks?/i, "beverages"],
  [/dairy|ghee|paneer|milk/i, "dairy"],
  [/atta|flour|rice|dal|pulses|staples?/i, "staples"],
];

export function parseObjective(
  objective: string,
  products: Array<{ id?: string; name: string; sku: string; category: string | null }> = [],
  selectedProductIds: string[] = [],
): ParsedObjective {
  const text = normalizeDigits(objective ?? "");
  const t = text.toLowerCase();
  const clarifications: string[] = [];

  const city = findCity(text);
  let state: string | null = city?.state ?? null;
  if (!city) {
    const st = CITIES.find((c) => t.includes(c.state.toLowerCase()));
    state = st?.state ?? null;
    clarifications.push(state ? `Which city in ${state} should we target?` : "Which city should this campaign target?");
  }

  // Target count: a number near buyer words, else the first plausible number.
  let count: number | null = null;
  const near = t.match(/(\d{1,4})\s*(?:\+\s*)?(?:fmcg\s+|spice\s+|oil\s+|good\s+|quality\s+|new\s+|top\s+)?(?:distributors?|super[\s-]?stockists?|wholesalers?|dealers?|retailers?|accounts?|buyers?|prospects?|leads?|parties|shops|stores|outlets)/);
  if (near) count = Number(near[1]);
  if (count === null) {
    const around = t.match(/(?:around|about|approx(?:imately)?|lagbhag|kam se kam|at least|target(?: of)?)\s*(\d{1,4})/);
    if (around) count = Number(around[1]);
  }
  if (count === null) {
    const any = [...t.matchAll(/(?<![\d.])(\d{1,4})(?![\d.]|\s*(?:l|kg|g|ml|litre|ltr|%|days?)\b)/g)].map((m) => Number(m[1]));
    if (any.length) count = any[0];
  }
  const target = Math.max(1, Math.min(500, count ?? 75));
  if (count === null) clarifications.push("How many buyers should we find? Defaulting to 75.");
  else if (count !== target) clarifications.push(`Target count adjusted to ${target} (allowed range 1 to 500).`);

  const buyerTypes: string[] = [];
  for (const [re, ty] of TYPE_WORDS) if (re.test(t) && !buyerTypes.includes(ty)) buyerTypes.push(ty);
  if (!buyerTypes.length) buyerTypes.push("distributor", "wholesaler");

  let category: string | null = null;
  for (const [re, c] of CATEGORY_WORDS) if (re.test(t)) {
    category = c;
    break;
  }
  const hints: string[] = [];
  for (const p of products) {
    const words = p.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !["powder", "bottle", "carton", "pack"].includes(w));
    if (t.includes(p.sku.toLowerCase()) || words.some((w) => t.includes(w)) || (p.id && selectedProductIds.includes(p.id))) {
      hints.push(p.name);
    }
  }
  if (!category) {
    const chosen = products.filter((p) => (p.id && selectedProductIds.includes(p.id)) || hints.includes(p.name));
    const cats = [...new Set(chosen.map((p) => p.category).filter(Boolean))] as string[];
    category = cats[0] ?? null;
  }
  if (!category) clarifications.push("Which product category is this campaign for?");

  let confidence = 0.35;
  if (city) confidence += 0.3;
  if (count !== null) confidence += 0.15;
  if (category) confidence += 0.1;
  if (buyerTypes.length && TYPE_WORDS.some(([re]) => re.test(t))) confidence += 0.1;

  return {
    city: city?.name ?? null,
    state,
    category,
    target_count: target,
    buyer_types: buyerTypes,
    product_hints: [...new Set(hints)],
    confidence: Math.round(Math.min(0.95, confidence) * 100) / 100,
    clarifications,
  };
}
