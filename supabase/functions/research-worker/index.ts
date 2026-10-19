// research-worker (PRD 7): summarises public information per prospect (brands,
// scale, decision makers, reason to switch) with source URLs; anything without
// a URL is labelled inferred. Signals are 0..1 and omitted when unknown (never
// guessed as zero). set_prospect_research scores and advances the campaign.

import { aiEnabled, aiModel, isRetryableAiError, structuredCall } from "../_shared/ai.ts";
import { researchFromPayload } from "../_shared/discovery.ts";
import { config } from "../_shared/env.ts";
import { errorMessage } from "../_shared/log.ts";
import { rpc } from "../_shared/supabase.ts";
import { PermanentError, serveWorker } from "../_shared/worker.ts";

const SIGNAL_KEYS = ["geographic_coverage", "brands_carried", "retail_network", "logistics", "company_size"] as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "brands_carried", "estimated_scale", "retail_reach", "decision_makers", "reason_to_switch", "sources", "signals"],
  properties: {
    summary: { type: "string" },
    brands_carried: { type: ["string", "null"] },
    estimated_scale: { type: ["string", "null"] },
    retail_reach: { type: ["string", "null"] },
    decision_makers: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name", "role"], properties: { name: { type: "string" }, role: { type: "string" } } },
    },
    reason_to_switch: { type: ["string", "null"] },
    sources: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["url", "label"], properties: { url: { type: "string" }, label: { type: "string" } } },
    },
    signals: {
      type: "array",
      description: "Only criteria with evidence. value 0..1. source_url null when inferred.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["criterion", "value", "source_url"],
        properties: {
          criterion: { type: "string", enum: [...SIGNAL_KEYS] },
          value: { type: "number" },
          source_url: { type: ["string", "null"] },
        },
      },
    },
  },
};

interface AiResearch {
  summary: string;
  brands_carried: string | null;
  estimated_scale: string | null;
  retail_reach: string | null;
  decision_makers: Array<{ name: string; role: string }>;
  reason_to_switch: string | null;
  sources: Array<{ url: string; label: string }>;
  signals: Array<{ criterion: string; value: number; source_url: string | null }>;
}

serveWorker<{ prospect_id: string }>({
  name: "research-worker",
  queue: "research",
  vt: 120,
  batch: 5,
  async handle(job, { svc, log: base, readCt }) {
    if (!job?.prospect_id) throw new PermanentError("job has no prospect_id");
    const log = base.child({ prospect_id: job.prospect_id });
    const { data: p, error } = await svc.from("prospects")
      .select("id, name, type, category, city, state, website, source_url, research, signals, pipeline_step").eq("id", job.prospect_id).maybeSingle();
    if (error) throw error;
    if (!p) return;
    if (p.pipeline_step !== "research") return; // idempotent

    const { data: raw } = await svc.from("raw_records").select("payload").eq("prospect_id", p.id).order("created_at").limit(1).maybeSingle();
    const payload = ((raw as { payload?: Record<string, unknown> } | null)?.payload) ?? {
      source_url: p.source_url,
      website: p.website,
      description: (p.research as Record<string, unknown>)?.raw_description,
      brands: (p.research as Record<string, unknown>)?.brands_carried,
      signals: p.signals,
    };

    let result = researchFromPayload({ name: p.name, type: p.type, city: p.city }, payload);
    if (aiEnabled()) {
      try {
        const webSearch = config.researchWebSearch();
        const { data } = await structuredCall<AiResearch>({
          model: aiModel(),
          maxTokens: 3000,
          effort: "low",
          schema: SCHEMA,
          tools: webSearch ? [{ type: "web_search_20260209", name: "web_search", max_uses: 3, user_location: { type: "approximate", country: "IN", city: p.city ?? undefined } }] : undefined,
          system:
            "You research Indian B2B trade buyers for a manufacturer's sales team. Use only the listing data given" +
            (webSearch ? " and web search results" : "") +
            ". Every claim backed by a page must list that page in sources; claims without a URL are inferred. " +
            "Only include signals you have evidence for, each between 0 and 1. Never output a signal as 0 because it is unknown: omit it.",
          messages: [{
            role: "user",
            content: JSON.stringify({ business_name: p.name, type: p.type, category: p.category, city: p.city, state: p.state, listing: payload }),
          }],
        });
        const signals: Record<string, number> = {};
        const signalSources: Record<string, string> = {};
        for (const s of data.signals ?? []) {
          if (!(SIGNAL_KEYS as readonly string[]).includes(s.criterion)) continue;
          const v = Number(s.value);
          if (!Number.isFinite(v)) continue;
          signals[s.criterion] = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
          signalSources[s.criterion] = s.source_url ? "research" : "inferred";
        }
        const sources = (data.sources ?? []).filter((s) => /^https?:\/\//.test(s.url));
        result = {
          research: {
            summary: data.summary,
            brands_carried: data.brands_carried,
            estimated_scale: data.estimated_scale,
            retail_reach: data.retail_reach,
            decision_makers: data.decision_makers ?? [],
            reason_to_switch: data.reason_to_switch,
            sources,
            inferred: sources.length === 0,
            signal_sources: signalSources,
            method: webSearch ? "claude_web_search" : "claude",
          },
          signals,
        };
      } catch (e) {
        if (isRetryableAiError(e) && readCt < 3) throw e;
        log.warn("ai_research_failed_fallback", { error: errorMessage(e) });
      }
    }

    const score = await rpc<number>(svc, "set_prospect_research", {
      p_prospect: p.id,
      p_research: result.research,
      p_signals: result.signals,
    });
    log.info("researched", { score, signals: Object.keys(result.signals).length, inferred: result.research.inferred });
  },
});
