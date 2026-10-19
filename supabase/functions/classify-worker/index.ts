// classify-worker (PRD 7): categorises a prospect against the manufacturer's
// taxonomy with a confidence score (below 0.7 is flagged for the manufacturer's
// Lead Review instead of being guessed). set_prospect_classification queues research.

import { aiEnabled, aiModel, isRetryableAiError, structuredCall } from "../_shared/ai.ts";
import { classifyHeuristic } from "../_shared/discovery.ts";
import { errorMessage } from "../_shared/log.ts";
import { rpc } from "../_shared/supabase.ts";
import { PermanentError, serveWorker } from "../_shared/worker.ts";

serveWorker<{ prospect_id: string }>({
  name: "classify-worker",
  queue: "classify",
  vt: 60,
  batch: 10,
  async handle(job, { svc, log: base, readCt }) {
    if (!job?.prospect_id) throw new PermanentError("job has no prospect_id");
    const log = base.child({ prospect_id: job.prospect_id });
    const { data: p, error } = await svc.from("prospects")
      .select("id, manufacturer_id, campaign_id, name, type, category, city, research, pipeline_step").eq("id", job.prospect_id).maybeSingle();
    if (error) throw error;
    if (!p) return;
    if (p.pipeline_step !== "classify") return; // already classified (idempotent)

    const [{ data: mfr }, { data: campaign }] = await Promise.all([
      svc.from("manufacturers").select("settings").eq("id", p.manufacturer_id).single(),
      p.campaign_id ? svc.from("campaigns").select("product_ids, target_category").eq("id", p.campaign_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const taxonomy: string[] = (mfr?.settings?.taxonomy as string[]) ?? ["distributor", "super_stockist", "wholesaler", "dealer", "retailer", "modern_trade"];
    let productCategories: string[] = [];
    const ids = (campaign as { product_ids?: string[] } | null)?.product_ids ?? [];
    const prodQuery = svc.from("products").select("category").eq("manufacturer_id", p.manufacturer_id).eq("status", "active");
    const { data: prods } = ids.length ? await prodQuery.in("id", ids) : await prodQuery;
    productCategories = [...new Set((prods ?? []).map((x: { category: string | null }) => x.category).filter(Boolean) as string[])];
    const research = (p.research ?? {}) as Record<string, unknown>;

    let result = classifyHeuristic({
      name: p.name,
      description: research.raw_description as string | null,
      typeHint: p.type,
      categoryHint: p.category,
      brands: research.brands_carried as string[] | null,
      taxonomy,
      productCategories,
    });
    let method = "heuristic";

    if (aiEnabled()) {
      try {
        const categories = [...new Set([...productCategories, "other"])];
        const { data } = await structuredCall<{ type: string; category: string; confidence: number; reason: string }>({
          model: aiModel(),
          maxTokens: 600,
          effort: "low",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["type", "category", "confidence", "reason"],
            properties: {
              type: { type: "string", enum: [...new Set([...taxonomy, "other"])] },
              category: { type: "string", enum: categories },
              confidence: { type: "number", description: "0 to 1" },
              reason: { type: "string" },
            },
          },
          system:
            "You classify Indian B2B trade buyers (distributors, super stockists, wholesalers, dealers, retailers) for a manufacturer. " +
            "Use only the listing data given. If the data is thin or contradictory, return a low confidence instead of guessing.",
          messages: [{
            role: "user",
            content: JSON.stringify({
              business_name: p.name,
              city: p.city,
              listing_type: p.type,
              listing_category: p.category,
              description: research.raw_description ?? null,
              brands: research.brands_carried ?? null,
              manufacturer_product_categories: productCategories,
            }),
          }],
        });
        result = {
          type: data.type,
          category: data.category === "other" ? (p.category ?? null) : data.category,
          confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)),
          reason: String(data.reason ?? "").slice(0, 300),
        };
        method = "claude";
      } catch (e) {
        if (isRetryableAiError(e) && readCt < 3) throw e;
        log.warn("ai_classify_failed_fallback", { error: errorMessage(e) });
      }
    }

    await rpc(svc, "set_prospect_classification", {
      p_prospect: p.id,
      p_category: result.category,
      p_type: result.type,
      p_confidence: result.confidence,
      p_reason: `${result.reason} [${method}]`,
    });
    log.info("classified", { type: result.type, category: result.category, confidence: result.confidence, method });
  },
});
