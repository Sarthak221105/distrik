// Deterministic intent detection for the fallback sales agent (used when no
// ANTHROPIC_API_KEY is configured) and for forced escalation guardrails.
// English, Hinglish (Roman Hindi) and Hindi (Devanagari). Pure functions only.

import { normalizeDigits } from "../price_validator.ts";

export type Lang = "en" | "hinglish" | "hi";

export interface ProductLite {
  id: string;
  name: string;
  sku: string;
  category?: string | null;
  unit?: string | null;
  description?: string | null;
  distributor_price_paise?: number | null;
  moq?: number | null;
}

export interface QualificationFact {
  field:
    | "current_suppliers"
    | "monthly_volume"
    | "decision_maker"
    | "timeline"
    | "objections"
    | "brands_carried"
    | "retail_reach"
    | "credit_expectation"
    | "notes";
  value: string;
}

export interface Intents {
  language: Lang;
  greeting: boolean;
  catalogue: boolean;
  priceAsk: boolean;
  confirm: boolean;
  credit: boolean;
  creditDays: number | null;
  complaint: boolean;
  legal: boolean;
  contract: boolean;
  sample: boolean;
  injection: boolean;
  thanks: boolean;
  poMention: boolean;
  requestedPriceRupees: number | null;
  qty: number | null;
  productSku: string | null;
  qualification: QualificationFact[];
}

const HINGLISH_MARKERS = new RegExp(
  String.raw`\b(hai|hain|hu|hoon|kya|kitna|kitne|kitni|chahiye|chaiye|bhej|bhejo|bhejiye|bhejna|bhej do|karo|kariye|kar do|kardo|de do|dedo|dijiye|nahi|nahin|haan|bhai|bhaiya|aap|aapka|aapke|apka|hum|humein|hume|mujhe|mera|hamara|kaise|kab|kahan|mein|me de|me milega|wale|wala|rakhte|rakhta|theek|thik|accha|acha|achha|bataiye|batao|batana|milega|milegi|lagega|sahi|pakka|hoga|hogi|mahine|mahina|din|ka rate|ke liye|liye|abhi|zyada|jyada|kam|sasta|mehnga|maal|lena|dena|chalega)\b`,
  "i",
);

export function detectLanguage(text: string): Lang {
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  if (HINGLISH_MARKERS.test(text)) return "hinglish";
  return "en";
}

const BRANDS = [
  "Fortune", "Patanjali", "Engine", "Dhara", "Saffola", "Sundrop", "Gemini", "Emami", "Postman", "Figaro",
  "Nature Fresh", "Aashirvaad", "MDH", "Everest", "Catch", "Badshah", "Tata Sampann", "Tata", "Aachi", "Eastern",
  "Sakthi", "Ramdev", "Rajesh Masala", "Goldiee", "Suhana", "Priya", "P Mark", "Hathi", "Nirma", "Ghadi",
  "Surf Excel", "Vim", "Harpic", "Lizol", "Parle", "Britannia", "Haldiram", "Amul",
];

// Synonyms map buyer words to canonical product keywords.
const SYNONYMS: Array<[RegExp, string[]]> = [
  [/\b(mustard|sarson|sarso|sarsoon|kachi ghani|kachchi ghani)\b|सरसों/i, ["mustard", "oil"]],
  [/\b(oil|tel|tail)\b|तेल/i, ["oil"]],
  [/\b(garam masala|garam)\b|गरम मसाला/i, ["garam", "masala"]],
  [/\b(masala|masale|spice|spices)\b|मसाला|मसाले/i, ["masala"]],
  [/\b(haldi|turmeric|haldee)\b|हल्दी/i, ["turmeric"]],
  [/\b(mirch|mirchi|chilli|chili|chillies|kashmiri)\b|मिर्च/i, ["chilli"]],
  [/\b(jar|jars|5\s?l|5\s?ltr|5\s?litre|5\s?liter|5\s?lit)\b|5 लीटर/i, ["5 l", "jar"]],
  [/\b(bottle|bottles|1\s?l|1\s?ltr|1\s?litre|1\s?liter)\b|1 लीटर/i, ["1 l", "bottle"]],
  [/\b(floor cleaner|phenyl|cleaner)\b/i, ["cleaner"]],
];

function haystack(p: ProductLite): string {
  return `${p.name} ${p.sku} ${p.category ?? ""} ${p.unit ?? ""}`.toLowerCase().replace(/(\d)\s+(l|kg|g|ml)\b/g, "$1 $2");
}

/** Best matching product for the buyer text, or null when ambiguous / unknown. */
export function guessProduct(text: string, products: ProductLite[]): ProductLite | null {
  if (!products.length) return null;
  const t = normalizeDigits(text).toLowerCase();
  const compact = t.replace(/[^a-z0-9]/g, "");
  for (const p of products) {
    const sku = p.sku.toLowerCase();
    if (t.includes(sku) || compact.includes(sku.replace(/[^a-z0-9]/g, ""))) return p;
  }
  const keywords = new Set<string>();
  for (const [re, kws] of SYNONYMS) if (re.test(t)) kws.forEach((k) => keywords.add(k));
  // Plain words from the product names too ("pet", "powder"...).
  for (const w of t.split(/[^a-z0-9]+/)) if (w.length >= 4) keywords.add(w);
  if (!keywords.size) return null;
  let best: ProductLite | null = null;
  let bestScore = 0;
  let tie = false;
  for (const p of products) {
    const h = haystack(p);
    let score = 0;
    for (const k of keywords) if (h.includes(k)) score += k.includes(" ") || ["mustard", "turmeric", "chilli", "garam", "cleaner"].includes(k) ? 2 : 1;
    if (score > bestScore) {
      best = p;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }
  if (!best || bestScore === 0) return null;
  if (tie) {
    // Prefer the jar for "oil" alone (the best seller) only when the buyer said jar; otherwise ambiguous.
    return null;
  }
  return best;
}

const QTY_UNIT = String.raw`(?:jars?|cartons?|ctns?|bottles?|peti|petis|pcs|pieces?|packs?|packets?|box|boxes|units?|cases?|nos|dabba|dabbe|cans?|bags?|tins?|जार|कार्टन|पेटी|डिब्बे|बोतल)`;
const PACK_SIZE = String.raw`(?:l|ltr|ltrs|litre|litres|liter|liters|lit|kg|kgs|g|gm|gms|gram|grams|ml|लीटर|किलो)`;

interface NumTok {
  value: number;
  start: number;
  end: number;
  role: "price" | "qty" | "ignore" | "unknown";
}

/** Splits a buyer message into a requested price (rupees) and a quantity. */
export function extractPriceAndQty(raw: string, refPriceRupees?: number | null): { price: number | null; qty: number | null } {
  const text = normalizeDigits(raw).toLowerCase();
  const toks: NumTok[] = [];
  const re = /(?<![\d.])(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d+))?(?![\d])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = Number(m[1].replace(/,/g, "") + (m[2] ? "." + m[2] : ""));
    toks.push({ value, start: m.index, end: m.index + m[0].length, role: "unknown" });
  }
  for (const tk of toks) {
    const before = text.slice(Math.max(0, tk.start - 14), tk.start);
    const after = text.slice(tk.end, tk.end + 24);
    if (new RegExp(String.raw`^\s*` + PACK_SIZE + String.raw`\b`).test(after)) tk.role = "ignore";
    else if (/^\s*(%|percent|din|days?|hafte|weeks?|months?|mahine|mahina|saal|years?|outlets?|dukaan|dukane|shops?|retailers?|stores?|counters?|baje|am|pm)\b/.test(after)) tk.role = "ignore";
    else if (new RegExp(String.raw`^\s*` + QTY_UNIT + String.raw`(?!\w)`).test(after)) tk.role = "qty";
    else if (/(₹|\brs\.?|\binr|rupees?|rupaye|@|\brate\b|\bprice\b|\bbhav\b|\bbhaav\b|\bdaam\b|\boffer\b|\bat\b)\s*$/.test(before)) tk.role = "price";
    else if (/^\s*(₹|\/-|rs\b|rupees?|rupaye|rupay|inr|रुपये|रुपए)/.test(after)) tk.role = "price";
    else if (/^\s*(me|mein|mai|main|में|par|pe|tak|ka rate|ke rate|ka bhav|per|\/|each|a piece|me de|me milega|mein milega)\b/.test(after)) tk.role = "price";
  }
  let price = toks.find((t) => t.role === "price")?.value ?? null;
  let qty = toks.find((t) => t.role === "qty" && Number.isInteger(t.value))?.value ?? null;
  for (const tk of toks.filter((t) => t.role === "unknown")) {
    if (price === null && refPriceRupees && tk.value >= refPriceRupees * 0.3 && tk.value <= refPriceRupees * 3) {
      price = tk.value;
    } else if (qty === null && Number.isInteger(tk.value) && tk.value > 0 && tk.value <= 100000 && tk.value !== price) {
      qty = tk.value;
    }
  }
  return { price, qty };
}

function brandsIn(text: string): string[] {
  const found: string[] = [];
  for (const b of BRANDS) {
    const re = new RegExp(String.raw`(^|[^a-z])` + b.toLowerCase().replace(/ /g, String.raw`\s+`) + String.raw`([^a-z]|$)`, "i");
    if (re.test(text) && !found.some((f) => f.toLowerCase().includes(b.toLowerCase()))) found.push(b);
  }
  return found;
}

export function extractQualification(raw: string): QualificationFact[] {
  const text = normalizeDigits(raw).toLowerCase();
  const facts: QualificationFact[] = [];
  const monthly = text.match(
    new RegExp(String.raw`(\d[\d,]*)\s*(` + QTY_UNIT + String.raw`|tons?|kg)\s*(?:per month|a month|monthly|every month|har mahine|har mahina|mahine ka|mahina|महीने|हर महीने|प्रति माह|\/month|pm\b)`),
  ) ?? text.match(new RegExp(String.raw`(?:har mahine|monthly|every month|per month|हर महीने)\s*(\d[\d,]*)\s*(` + QTY_UNIT + String.raw`|tons?|kg)`));
  if (monthly) facts.push({ field: "monthly_volume", value: `${monthly[1].replace(/,/g, "")} ${monthly[2]} per month` });

  const brands = brandsIn(raw);
  if (brands.length) {
    const supplierCtx = /(de rahe|de raha|dete|deta|supply|supplier|se lete|se leta|wale|wala|offering|quoting|giving|se maal|company se)/.test(text);
    const carryCtx = /(rakhte|rakhta|rakhe|bechte|bechta|sell|carry|carries|deal in|stock|chalate|chalta|chalti|keep|रखते|बेचते)/.test(text);
    if (supplierCtx) facts.push({ field: "current_suppliers", value: brands.join(", ") });
    if (carryCtx || !supplierCtx) facts.push({ field: "brands_carried", value: brands.join(", ") });
  }

  const reach = text.match(/(\d[\d,]*)\s*\+?\s*(outlets?|dukaan|dukane|dukanon|shops?|retailers?|stores?|counters?|दुकान)/);
  if (reach) facts.push({ field: "retail_reach", value: `${reach[1].replace(/,/g, "")} ${reach[2]}` });

  if (/\b(i am|i'm|main|mai|hum)\s+(the\s+|hi\s+)?(owner|proprietor|malik|partner|director|md)\b|\b(main|mai)\s+hi\s+decide|मैं\s*(ही)?\s*(मालिक|ओनर)/.test(text)) {
    facts.push({ field: "decision_maker", value: "Contact says they are the owner / decision maker" });
  }
  const timeline = text.match(/\b(next week|agle hafte|agle hafta|next month|agle mahine|is mahine|this month|diwali se pehle|before diwali|turant|immediately|urgent|abhi chahiye|kal tak|by tomorrow|is hafte|this week)\b/);
  if (timeline) facts.push({ field: "timeline", value: timeline[1] });
  const objection = text.match(/\b(mehnga|mehenga|costly|expensive|too high|zyada hai|jyada hai|bahut zyada|margin kam|low margin|quality issue|quality kharab)\b|महंगा/);
  if (objection) facts.push({ field: "objections", value: objection[0] });
  const days = creditDaysIn(text);
  if (days) facts.push({ field: "credit_expectation", value: `${days} days credit` });
  return facts;
}

function creditDaysIn(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*(?:din|days?|day|दिन)\s*(?:ka|ki|ke|of|का|की)?\s*(?:credit|udhaar|udhar|payment|crdt|उधार|क्रेडिट)/) ??
    text.match(/(?:credit|udhaar|udhar|उधार|क्रेडिट)[^\d]{0,20}(\d{1,3})\s*(?:din|days?|दिन)/);
  return m ? Number(m[1]) : null;
}

export function detectIntents(raw: string, products: ProductLite[] = []): Intents {
  const text = normalizeDigits(raw ?? "").trim();
  const t = text.toLowerCase();
  const product = guessProduct(text, products);
  const ref = product?.distributor_price_paise ? product.distributor_price_paise / 100 : null;
  const { price, qty } = extractPriceAndQty(text, ref);
  const creditDays = creditDaysIn(t);
  return {
    language: detectLanguage(text),
    greeting: /^(hi+|hello|hey|helo|namaste|namaskar|namaskaar|ram ram|jai shri krishna|jai shree krishna|radhe radhe|good (morning|afternoon|evening))\b/.test(t) || /^(नमस्ते|नमस्कार|राम राम)/.test(t),
    catalogue: /(catalog(ue)?|brochure|price ?list|rate ?list|product ?list|products? (details|range)|details bhej|list bhej|kya kya (products|milta|hai|banate)|कैटलॉग|लिस्ट)/.test(t),
    priceAsk: price !== null ||
      /(price|rate|bhav|bhaav|daam|\bdam\b|keemat|kimat|cost|quote|kitne ka|kitne me|kitne mein|kitna|best price|discount|kam karo|kam kar|kam kijiye|de do|dedo|me milega|offer|रेट|दाम|भाव|कीमत)/.test(t),
    confirm: /^(ok+|okay|done|confirm(ed)?|deal|pakka|final|theek hai|thik hai|thik h|theek h|chalega|chalo|haan|han ji|haan ji|yes|yes please|sure|go ahead|proceed|bhej do)\b/.test(t) || /^(ठीक है|हाँ|हां|पक्का|ओके|भेज दो)/.test(t) ||
      /(send( the| me)? (the )?quotation|quotation (bhejo|bhej do|bhejiye|send|please)|order (confirm|kar do|karo|book)|book (the )?order|kotation bhejo)/.test(t),
    credit: creditDays !== null || /(credit|udhaar|udhar|\bdays? payment|payment terms|baad me payment|baad mein payment|उधार|क्रेडिट)/.test(t),
    creditDays,
    complaint: /(complain|complaint|shikayat|kharab|kharaab|damaged|damage|leak|leakage|toota|tuta|broken|late delivery|delivery late|delivery (was|is) late|delay|expired|wrong (product|item)|galat (maal|product)|refund|paisa wapas|bekar|fraud|cheat|dhoka|शिकायत|खराब)/.test(t),
    legal: /(legal|court|lawyer|advocate|vakil|wakil|legal notice|notice bhej|consumer forum|\bfir\b|police|\bsue\b|कानूनी|वकील|अदालत)/.test(t),
    contract: /(contract|agreement|exclusive|exclusivity|sole distributor|distributorship|appoint (us|me)|territory rights|\bmou\b|anubandh|करार|अनुबंध)/.test(t),
    sample: /(sample|namuna|namoona|trial pack|free piece|नमूना|सैंपल)/.test(t),
    injection: /(ignore (all |your |previous |the |my )*(rules|instructions|prompt)|forget (your|all|the) (rules|instructions)|system prompt|you are now|act as|developer mode|jailbreak|override (the )?(rules|price)|admin mode|new instructions|reveal (your )?prompt)/.test(t),
    thanks: /^(thanks|thank you|thx|dhanyavaad|dhanyawad|shukriya)\b/.test(t) || /^धन्यवाद/.test(t),
    poMention: /(\bpo\b|purchase order|p\.o\.|order copy)/.test(t),
    requestedPriceRupees: price,
    qty,
    productSku: product?.sku ?? null,
    qualification: extractQualification(text),
  };
}

/**
 * Forced escalation (PRD 9): contract terms, legal, complaints and credit beyond
 * policy pause the AI on the thread. Returns the reason or null.
 */
export function forcedEscalationReason(i: Intents, maxCreditDays = 45): string | null {
  if (i.legal) return "Legal matter raised by the buyer";
  if (i.complaint) return "Buyer complaint needs a person";
  if (i.contract) return "Contract, exclusivity or distributorship terms requested";
  if (i.credit && i.creditDays !== null && i.creditDays > maxCreditDays) {
    return `Credit of ${i.creditDays} days requested, beyond the ${maxCreditDays} day policy`;
  }
  return null;
}
