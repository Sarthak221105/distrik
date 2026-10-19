// Deterministic classification and research fallbacks for the discovery
// pipeline (used when no ANTHROPIC_API_KEY is configured).

export interface Classification {
  type: string;
  category: string | null;
  confidence: number;
  reason: string;
}

const TYPE_RULES: Array<[RegExp, string]> = [
  [/\b(super\s*stockists?|\bss\b|c\s*&\s*f|carrying and forwarding)\b/i, "super_stockist"],
  [/\b(modern trade|hypermarket|mall|reliance smart|dmart|big bazaar)\b/i, "modern_trade"],
  [/\b(kirana|general stores?|departmental store|super ?mart|provision store|bhandar|retail)\b/i, "retailer"],
  [/\b(wholesale|wholesalers?|mandi|mart|traders?|trading co)\b/i, "wholesaler"],
  [/\b(dealers?|sales corporation|sales agency)\b/i, "dealer"],
  [/\b(distributors?|distribution|agenc(y|ies)|marketing|enterprises)\b/i, "distributor"],
];

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/\b(oil|ghee|mustard|sarson|refined|fortune|dhara|engine|saffola|sundrop|gemini|postman|emami|p mark)\b/i, "edible_oil"],
  [/\b(masala|spices?|mdh|everest|catch|badshah|aachi|eastern|ramdev|suhana|tata sampann)\b/i, "spices"],
  [/\b(detergent|cleaner|harpic|lizol|vim|surf|ghadi|nirma|wheel|home care)\b/i, "home_care"],
];

export function classifyHeuristic(input: {
  name: string;
  description?: string | null;
  typeHint?: string | null;
  categoryHint?: string | null;
  brands?: string[] | string | null;
  taxonomy?: string[];
  productCategories?: string[];
}): Classification {
  const brands = Array.isArray(input.brands) ? input.brands.join(" ") : input.brands ?? "";
  const text = `${input.name} ${input.description ?? ""}`;
  let nameType: string | null = null;
  for (const [re, t] of TYPE_RULES) if (re.test(input.name)) {
    nameType = t;
    break;
  }
  let descType: string | null = null;
  for (const [re, t] of TYPE_RULES) if (re.test(input.description ?? "")) {
    descType = t;
    break;
  }
  const taxonomy = input.taxonomy?.length ? input.taxonomy : ["distributor", "super_stockist", "wholesaler", "dealer", "retailer", "modern_trade"];
  const hint = input.typeHint && taxonomy.includes(input.typeHint) ? input.typeHint : null;
  const type = nameType ?? descType ?? hint ?? "distributor";
  const agree = [nameType, descType, hint].filter((x) => x === type).length;

  let category: string | null = null;
  for (const [re, c] of CATEGORY_RULES) if (re.test(`${text} ${brands}`)) {
    category = c;
    break;
  }
  const pcs = (input.productCategories ?? []).map((c) => c.toLowerCase());
  if (input.categoryHint && (!category || pcs.includes(input.categoryHint.toLowerCase()))) category = category ?? input.categoryHint;
  if (!category && pcs.length === 1) category = pcs[0];

  const confidence = Math.min(0.95, 0.5 + agree * 0.15 + (category ? 0.1 : 0) + (nameType ? 0.05 : 0));
  const reason = [
    nameType ? `name suggests ${nameType}` : null,
    descType ? `listing describes a ${descType}` : null,
    hint ? `source type ${hint}` : null,
    category ? `brands/listing indicate ${category}` : "category unclear",
  ].filter(Boolean).join("; ");
  return { type, category, confidence: Math.round(confidence * 100) / 100, reason };
}

export interface ResearchResult {
  research: Record<string, unknown>;
  signals: Record<string, number>;
}

const SIGNAL_KEYS = ["geographic_coverage", "brands_carried", "retail_network", "logistics", "company_size"];

export function researchFromPayload(prospect: { name: string; type: string; city: string | null }, payload: Record<string, unknown> | null): ResearchResult {
  const p = payload ?? {};
  const url = typeof p.source_url === "string" && p.source_url ? p.source_url : null;
  const brands = Array.isArray(p.brands) ? (p.brands as string[]) : typeof p.brands === "string" ? String(p.brands).split(/,\s*/) : [];
  const rawSignals = (p.signals ?? {}) as Record<string, unknown>;
  const signals: Record<string, number> = {};
  for (const k of SIGNAL_KEYS) {
    const v = Number(rawSignals[k]);
    if (rawSignals[k] !== null && rawSignals[k] !== undefined && Number.isFinite(v)) signals[k] = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
  }
  const size = signals.company_size;
  const scale = size === undefined ? null : size >= 0.75 ? "₹10-25 Cr turnover (estimated)" : size >= 0.5 ? "₹5-10 Cr turnover (estimated)" : size >= 0.3 ? "₹2-5 Cr turnover (estimated)" : "Under ₹2 Cr turnover (estimated)";
  const desc = typeof p.description === "string" ? p.description : null;
  const outlets = desc?.match(/(\d+)\s+retail outlets/)?.[1];
  const reach = outlets ? `${outlets} outlets` : signals.retail_network !== undefined ? `${Math.round(50 + signals.retail_network * 550)} outlets (estimated)` : null;
  const signalSources: Record<string, string> = {};
  for (const k of Object.keys(signals)) signalSources[k] = url ? "research" : "inferred";
  const decisionMakers = typeof p.contact_name === "string" && p.contact_name
    ? [{ name: p.contact_name, role: typeof p.contact_role === "string" && p.contact_role ? p.contact_role : "Contact" }]
    : [];
  return {
    research: {
      summary: desc ?? `${prospect.name} is a ${prospect.type.replace("_", " ")} in ${prospect.city ?? "the target city"}.`,
      brands_carried: brands.join(", ") || null,
      estimated_scale: scale,
      retail_reach: reach,
      decision_makers: decisionMakers,
      reason_to_switch: brands.length
        ? `Already distributes ${brands.slice(0, 2).join(" and ")}; a regional brand with better trade margins can add to their portfolio.`
        : "Active trade buyer in the target market; margins and reliable supply are the likely levers.",
      sources: url ? [{ url, label: "Directory listing" }] : [],
      inferred: !url,
      signal_sources: signalSources,
      method: "payload",
    },
    signals,
  };
}
