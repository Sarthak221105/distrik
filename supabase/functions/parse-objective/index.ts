// parse-objective (authenticated, owner / sales_head): turns a Start Sales
// objective into a structured market intent for confirmation. Nothing is
// created here; the web app calls create_campaign after the user confirms.
//
// POST { objective: string, product_ids?: uuid[] }
// 200  { city, state, category, target_count, buyer_types[], product_hints[], confidence, clarifications[], method }

import { aiEnabled, aiModel, structuredCall } from "../_shared/ai.ts";
import { requireCaller, requireRole } from "../_shared/auth.ts";
import { AppError, errorResponse, isUuid, json, preflight, readJson, requireString } from "../_shared/http.ts";
import { cityByName, CITIES } from "../_shared/india_cities.ts";
import { errorMessage, logger } from "../_shared/log.ts";
import { type ParsedObjective, parseObjective } from "../_shared/objective_parser.ts";
import { userClient } from "../_shared/supabase.ts";

const log = logger({ fn: "parse-objective" });
const TYPES = ["distributor", "super_stockist", "wholesaler", "dealer", "retailer", "modern_trade"];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw new AppError(405, "method_not_allowed", "POST only");
    const caller = await requireCaller(req);
    requireRole(caller, ["owner", "sales_head"]);
    const body = await readJson<{ objective?: unknown; product_ids?: unknown }>(req);
    const objective = requireString(body.objective, "objective", { max: 2000, min: 5 });
    const productIds = Array.isArray(body.product_ids) ? body.product_ids.filter(isUuid) : [];

    // RLS limits this to the caller's tenant.
    const { data: products } = await userClient(caller.token).from("products").select("id, name, sku, category").eq("status", "active");
    const fallback = parseObjective(objective, products ?? [], productIds);

    let result: ParsedObjective & { method: string } = { ...fallback, method: "rules" };
    if (aiEnabled()) {
      try {
        const categories = [...new Set((products ?? []).map((p) => p.category).filter(Boolean) as string[])];
        const { data } = await structuredCall<ParsedObjective>({
          model: aiModel(),
          maxTokens: 800,
          effort: "low",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["city", "state", "category", "target_count", "buyer_types", "product_hints", "confidence", "clarifications"],
            properties: {
              city: { type: ["string", "null"] },
              state: { type: ["string", "null"], description: "Indian state name" },
              category: { type: ["string", "null"] },
              target_count: { type: "integer" },
              buyer_types: { type: "array", items: { type: "string", enum: TYPES } },
              product_hints: { type: "array", items: { type: "string" } },
              confidence: { type: "number" },
              clarifications: { type: "array", items: { type: "string" } },
            },
          },
          system:
            "Parse an Indian manufacturer's sales objective into a market intent. Use one Indian city and its state. " +
            `Prefer one of these product categories when it fits: ${categories.join(", ") || "none"}. ` +
            "target_count defaults to 75 when not stated. Add a clarification for anything missing or ambiguous; never invent a city.",
          messages: [{
            role: "user",
            content: JSON.stringify({ objective, products: (products ?? []).map((p) => ({ name: p.name, sku: p.sku, category: p.category, selected: productIds.includes(p.id) })) }),
          }],
        });
        const city = cityByName(data.city);
        result = {
          city: data.city ?? null,
          state: data.state ?? city?.state ?? (data.city ? null : fallback.state),
          category: data.category ?? fallback.category,
          target_count: Math.max(1, Math.min(500, Math.round(Number(data.target_count) || 75))),
          buyer_types: (data.buyer_types ?? []).filter((t) => TYPES.includes(t)),
          product_hints: data.product_hints ?? [],
          confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)),
          clarifications: data.clarifications ?? [],
          method: "claude",
        };
        if (!result.buyer_types.length) result.buyer_types = fallback.buyer_types;
        if (result.city && !result.state) result.state = CITIES.find((c) => c.name === result.city)?.state ?? null;
      } catch (e) {
        log.warn("ai_parse_failed_fallback", { error: errorMessage(e) });
      }
    }
    log.info("objective_parsed", { user_id: caller.userId, method: result.method, confidence: result.confidence });
    return json(result);
  } catch (e) {
    return errorResponse(e);
  }
});
