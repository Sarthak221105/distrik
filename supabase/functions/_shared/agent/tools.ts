// The sales agent's fixed tool set (PRD 9). Tools run server side with
// validated arguments and call the same SQL rules as everything else: prices
// come only from evaluate_offer / negotiate_offer / settle_negotiation, and
// messages are queued only through enqueue_outbound_message. Buyer text can
// never change rules, tiers or tool permissions: autonomy_policies decide what
// each tool may do, and the database enforces the rest.

import type { SupabaseClient } from "../deps.ts";
import { AppError, isAppCode } from "../http.ts";
import { errorMessage, type Logger } from "../log.ts";
import { formatRupees } from "../money.ts";
import { rpc, rpcRow } from "../supabase.ts";
import type { Product, TurnContext } from "./context.ts";
import { guessProduct } from "./intents.ts";

export const QUALIFICATION_FIELDS = [
  "current_suppliers",
  "monthly_volume",
  "decision_maker",
  "timeline",
  "objections",
  "brands_carried",
  "retail_reach",
  "credit_expectation",
  "notes",
] as const;

const APPROVAL_KINDS = ["payment_terms", "credit", "sample", "custom_quotation", "other"] as const;
const KIND_POLICY: Record<string, string> = {
  payment_terms: "special_payment_terms",
  credit: "credit",
  sample: "sample",
  custom_quotation: "custom_quotation",
  other: "custom_quotation",
};

/** JSON schemas for Claude (fixed; never derived from buyer text). */
export const TOOL_DEFINITIONS = [
  {
    name: "get_product_facts",
    description:
      "Look up structured facts for one of the manufacturer's products (name, SKU, unit, MOQ, specs, GST, certifications), the list price per unit returned by evaluate_offer, and the most relevant knowledge base passages. Use before answering any product question.",
    input_schema: {
      type: "object",
      properties: {
        product_sku: { type: "string", description: "Exact SKU if known, e.g. SKO-5L" },
        query: { type: "string", description: "What the buyer asked about, or the product name if the SKU is unknown" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "send_catalogue",
    description:
      "Send the manufacturer's approved trade catalogue (PDF) to the buyer on WhatsApp. Only works inside the 24 hour session window.",
    input_schema: {
      type: "object",
      properties: { document_id: { type: "string", description: "Optional document id; defaults to the latest approved catalogue" } },
      additionalProperties: false,
    },
  },
  {
    name: "propose_price",
    description:
      "Evaluate a price for a product and quantity against the manufacturer's rules (evaluate_offer). Pass the buyer's requested price in rupees if they named one; omit it to get the standard price. Returns decision accept | needs_approval | reject, the allowed price and the floor price. needs_approval automatically opens an approval for the owner.",
    input_schema: {
      type: "object",
      properties: {
        product_sku: { type: "string" },
        qty: { type: "integer", minimum: 1 },
        requested_price_rupees: { type: "number", description: "Buyer's requested price per unit in rupees (ex GST)" },
      },
      required: ["product_sku", "qty"],
      additionalProperties: false,
    },
  },
  {
    name: "settle_and_quote",
    description:
      "When the buyer agrees to a price that a tool accepted in this conversation, settle the negotiation and generate the GST quotation PDF, which is sent to the buyer automatically.",
    input_schema: {
      type: "object",
      properties: {
        product_sku: { type: "string" },
        qty: { type: "integer", minimum: 1 },
        price_rupees: { type: "number", description: "Agreed price per unit in rupees (ex GST)" },
      },
      required: ["product_sku", "qty", "price_rupees"],
      additionalProperties: false,
    },
  },
  {
    name: "request_approval",
    description:
      "Ask the manufacturer to approve something you may not decide: special payment terms, credit, samples, a custom quotation or another exception. Tell the buyer the team is checking.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...APPROVAL_KINDS] },
        summary: { type: "string", description: "One line: what the buyer asks for" },
        recommendation: { type: "string", description: "Your recommendation for the owner, with the reason" },
      },
      required: ["kind", "summary", "recommendation"],
      additionalProperties: false,
    },
  },
  {
    name: "log_qualification_field",
    description: "Record a qualification fact the buyer shared (suppliers, monthly volume, decision maker, timeline, objections, brands, retail reach, credit expectation).",
    input_schema: {
      type: "object",
      properties: {
        field: { type: "string", enum: [...QUALIFICATION_FIELDS] },
        value: { type: "string" },
      },
      required: ["field", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "schedule_followup",
    description: "Schedule the next follow up on this conversation (within 30 days).",
    input_schema: {
      type: "object",
      properties: {
        in_hours: { type: "number", minimum: 1, maximum: 720 },
        reason: { type: "string" },
      },
      required: ["in_hours", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the conversation to a person: contract terms, legal matters, complaints, credit beyond policy, or anything you are unsure about. After your reply the AI goes silent on this thread until a person resumes it.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

export interface ToolResult {
  ok: boolean;
  output: Record<string, unknown>;
}

export interface ActionMeta {
  model: string | null;
  promptVersion: number | null;
}

export class ToolExecutor {
  /** Prices (paise) returned by pricing rules in this turn: the validator's allowed set. */
  readonly allowedPrices = new Set<number>();
  readonly qtys = new Set<number>();
  escalation: { reason: string; source: string } | null = null;
  quotationId: string | null = null;
  approvalIds: string[] = [];
  catalogueSent = false;
  readonly calls: Array<{ name: string; ok: boolean }> = [];

  constructor(
    private svc: SupabaseClient,
    private ctx: TurnContext,
    private log: Logger,
    public meta: ActionMeta,
  ) {}

  async logAction(
    actionType: string,
    input: unknown,
    output: unknown,
    ruleChecked: string | null,
    outcome: string | null,
    extra: { id?: string; latencyMs?: number; agent?: string } = {},
  ): Promise<string> {
    const id = extra.id ?? crypto.randomUUID();
    const { error } = await this.svc.from("ai_actions").insert({
      id,
      manufacturer_id: this.ctx.manufacturer.id,
      conversation_id: this.ctx.conversation.id,
      prospect_id: this.ctx.prospect.id,
      turn_id: this.ctx.turn.id,
      agent: extra.agent ?? "sales_agent",
      action_type: actionType,
      input: input ?? {},
      output: output ?? {},
      rule_checked: ruleChecked,
      outcome,
      model: this.meta.model,
      prompt_version: this.meta.promptVersion,
      latency_ms: extra.latencyMs ?? null,
    });
    if (error) this.log.error("ai_action_insert_failed", { action_type: actionType, error: error.message });
    return id;
  }

  policyTier(action: string): string {
    return this.ctx.policies[action]?.tier ?? "autonomous";
  }

  resolveProduct(sku?: unknown, query?: unknown): Product | null {
    const products = this.ctx.products;
    if (typeof sku === "string" && sku.trim()) {
      const s = sku.trim().toLowerCase();
      const exact = products.find((p) => p.sku.toLowerCase() === s);
      if (exact) return exact;
      const g = guessProduct(sku, products);
      if (g) return products.find((p) => p.id === g.id) ?? null;
    }
    if (typeof query === "string" && query.trim()) {
      const g = guessProduct(query, products);
      if (g) return products.find((p) => p.id === g.id) ?? null;
    }
    return null;
  }

  private remember(paise: unknown) {
    const n = Number(paise);
    if (Number.isFinite(n) && n > 0) this.allowedPrices.add(Math.round(n));
  }

  async run(name: string, input: Record<string, unknown>): Promise<ToolResult> {
    const t0 = Date.now();
    let result: ToolResult;
    let rule: string | null = null;
    let outcome: string | null = null;
    try {
      const r = await this.dispatch(name, input ?? {});
      result = r.result;
      rule = r.rule;
      outcome = r.outcome ?? (result.ok ? "ok" : "error");
    } catch (e) {
      const code = e instanceof AppError ? e.code : (e as { message?: string })?.message ?? "error";
      result = { ok: false, output: { error: code, message: errorMessage(e) } };
      outcome = "error:" + String(code).slice(0, 60);
      this.log.warn("tool_failed", { tool: name, error: errorMessage(e) });
    }
    this.calls.push({ name, ok: result.ok });
    // escalate_to_human is logged when it is applied (after the reply).
    if (name !== "escalate_to_human") {
      await this.logAction(name, input, result.output, rule, outcome, { latencyMs: Date.now() - t0 });
    }
    return result;
  }

  private async dispatch(
    name: string,
    input: Record<string, unknown>,
  ): Promise<{ result: ToolResult; rule: string | null; outcome?: string }> {
    switch (name) {
      case "get_product_facts":
        return await this.getProductFacts(input);
      case "send_catalogue":
        return await this.sendCatalogue(input);
      case "propose_price":
        return await this.proposePrice(input, input._by_party === "ai" ? "ai" : undefined);
      case "settle_and_quote":
        return await this.settleAndQuote(input);
      case "request_approval":
        return await this.requestApproval(input);
      case "log_qualification_field":
        return await this.logQualification(input);
      case "schedule_followup":
        return await this.scheduleFollowup(input);
      case "escalate_to_human":
        return this.escalate(input);
      default:
        return { result: { ok: false, output: { error: "unknown_tool" } }, rule: null };
    }
  }

  // --- get_product_facts --------------------------------------------------
  private async getProductFacts(input: Record<string, unknown>) {
    const product = this.resolveProduct(input.product_sku, input.query);
    if (!product) {
      return {
        result: {
          ok: true,
          output: {
            found: false,
            message: "No single product matched. Ask the buyer which product they mean.",
            products: this.ctx.products.map((p) => ({ name: p.name, sku: p.sku, unit: p.unit, moq: p.moq })),
          },
        },
        rule: null,
        outcome: "not_found",
      };
    }
    let listPrice: number | null = null;
    let decision: string | null = null;
    if (product.distributor_price_paise) {
      const ev = await rpcRow<{ decision: string; floor_paise: number | null }>(this.svc, "evaluate_offer", {
        p_product: product.id,
        p_qty: product.moq,
        p_requested_paise: product.distributor_price_paise,
      });
      decision = ev?.decision ?? null;
      if (ev?.decision === "accept") {
        listPrice = product.distributor_price_paise;
        this.remember(listPrice);
      }
    }
    const query = typeof input.query === "string" && input.query.trim() ? input.query : product.name;
    const knowledge = await searchKnowledge(this.svc, this.ctx.manufacturer.id, query, product.id, this.log);
    return {
      result: {
        ok: true,
        output: {
          found: true,
          product: {
            name: product.name,
            sku: product.sku,
            category: product.category,
            description: product.description,
            specs: product.specs,
            unit: product.unit,
            moq: product.moq,
            gst_rate_pct: product.gst_rate,
            hsn_code: product.hsn_code,
            certifications: product.certifications,
          },
          list_price_paise: listPrice,
          list_price: listPrice ? formatRupees(listPrice) : null,
          price_basis: listPrice ? `per ${product.unit}, ex GST, at the minimum order of ${product.moq}` : "Call propose_price with a quantity",
          knowledge: knowledge.map((k) => k.content),
        },
      },
      rule: "evaluate_offer",
      outcome: decision ?? "no_price",
    };
  }

  // --- send_catalogue ------------------------------------------------------
  private async sendCatalogue(input: Record<string, unknown>) {
    const tier = this.policyTier("send_catalogue");
    const rule = "autonomy_policy:send_catalogue";
    if (tier === "human_only") {
      return { result: { ok: false, output: { error: "policy_human_only", message: "A person must share documents. Escalate instead." } }, rule };
    }
    if (tier === "approval") {
      const id = await rpc<string>(this.svc, "request_approval", {
        p_conversation: this.ctx.conversation.id,
        p_kind: "other",
        p_summary: `${this.ctx.prospect.name} asked for the catalogue`,
        p_recommendation: "Share the approved trade catalogue",
        p_context: { turn_id: this.ctx.turn.id, source: "ai", action: "send_catalogue" },
      });
      this.approvalIds.push(id);
      return { result: { ok: true, output: { sent: false, approval_requested: true, message: "Tell the buyer the team will share it shortly." } }, rule, outcome: "approval_requested" };
    }
    if (!this.ctx.windowOpen) {
      return { result: { ok: false, output: { error: "window_closed", message: "Documents can only be sent inside the 24 hour window." } }, rule };
    }
    const docs = this.ctx.catalogues;
    const doc = typeof input.document_id === "string" ? docs.find((d) => d.id === input.document_id) : docs.find((d) => d.kind === "catalogue") ?? docs[0];
    if (!doc) return { result: { ok: false, output: { error: "no_catalogue", message: "No approved catalogue is available. Offer product details instead." } }, rule };
    const mediaPath = `catalogues/${doc.storage_path}`;
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: dup } = await this.svc.from("messages").select("id").eq("conversation_id", this.ctx.conversation.id)
      .eq("media_path", mediaPath).gte("created_at", since).limit(1);
    if (dup && dup.length) {
      this.catalogueSent = true;
      return { result: { ok: true, output: { sent: false, already_sent_today: true } }, rule, outcome: "already_sent" };
    }
    const actionId = crypto.randomUUID();
    const filename = doc.storage_path.split("/").pop() ?? "catalogue.pdf";
    const messageId = await rpc<string>(this.svc, "enqueue_outbound_message", {
      p_conversation: this.ctx.conversation.id,
      p_body: doc.title ?? "Trade catalogue",
      p_template: null,
      p_actor: "ai",
      p_media_path: mediaPath,
      p_media_type: "document",
      p_media_filename: filename,
      p_template_params: null,
      p_idempotency_key: `turn:${this.ctx.turn.id}:catalogue:${doc.id}`,
      p_turn: this.ctx.turn.id,
      p_ai_action: actionId,
    });
    this.catalogueSent = true;
    return {
      result: { ok: true, output: { sent: true, message_id: messageId, document: doc.title, _action_id: actionId } },
      rule,
      outcome: "queued",
    };
  }

  private validQty(v: unknown): number {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 1_000_000) throw new AppError(400, "invalid_qty", "qty must be a whole number");
    return n;
  }

  private validRupees(v: unknown, field: string): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || n > 100_000_000) throw new AppError(400, "invalid_" + field, `${field} must be a positive amount`);
    return Math.round(n * 100);
  }

  // --- propose_price -------------------------------------------------------
  async proposePrice(input: Record<string, unknown>, byParty?: "buyer" | "ai") {
    const product = this.resolveProduct(input.product_sku, input.query ?? input.product_sku);
    if (!product) return { result: { ok: false, output: { error: "unknown_product", products: this.ctx.products.map((p) => p.sku) } }, rule: null };
    const qty = this.validQty(input.qty);
    const requested = this.validRupees(input.requested_price_rupees, "requested_price_rupees");
    const party = byParty ?? (requested ? "buyer" : "ai");
    const ask = requested ?? product.distributor_price_paise;
    if (!ask) return { result: { ok: false, output: { error: "no_list_price", message: "No list price; escalate or ask the team." } }, rule: "evaluate_offer" };

    const negotiationId = await rpc<string>(this.svc, "open_negotiation", {
      p_conversation: this.ctx.conversation.id,
      p_product: product.id,
      p_qty: qty,
    });
    const row = await rpcRow<{
      decision: string;
      allowed_price_paise: number | null;
      floor_paise: number | null;
      hard_minimum_paise: number | null;
      reason: string;
      offer_id: string;
      approval_id: string | null;
    }>(this.svc, "negotiate_offer", {
      p_negotiation: negotiationId,
      p_requested_paise: ask,
      p_qty: qty,
      p_by_party: party,
      p_turn: this.ctx.turn.id,
    });
    if (!row) throw new Error("negotiate_offer returned nothing");
    this.qtys.add(qty);
    if (row.decision === "accept") this.remember(row.allowed_price_paise);
    if (row.reason !== "below_moq") this.remember(row.floor_paise);
    if (!requested && row.decision === "accept") this.remember(ask);
    if (row.approval_id) {
      this.approvalIds.push(row.approval_id);
      await this.logAction("request_approval", { kind: "price_below_floor", negotiation_id: negotiationId }, { approval_id: row.approval_id },
        "autonomy_policy:price_below_floor", "pending");
    }
    const guidance: Record<string, string> = {
      accept: "The price is allowed. Confirm it and offer to send the quotation (settle_and_quote when the buyer agrees).",
      needs_approval: "Below the autonomous floor: an approval request was sent to the owner. Tell the buyer you are checking with the team and offer the floor price as the best price available right now. Do not repeat the buyer's number.",
      reject: row.reason === "below_moq"
        ? `Quantity is below the minimum order of ${product.moq} ${product.unit}. Ask the buyer to order at least that.`
        : "Below what the manufacturer allows. Decline politely and offer the floor price.",
    };
    return {
      result: {
        ok: true,
        output: {
          decision: row.decision,
          reason: row.reason,
          product: product.name,
          sku: product.sku,
          unit: product.unit,
          moq: product.moq,
          qty,
          negotiation_id: negotiationId,
          allowed_price_paise: row.decision === "accept" ? row.allowed_price_paise : row.floor_paise,
          allowed_price: row.decision === "accept" && row.allowed_price_paise
            ? formatRupees(row.allowed_price_paise)
            : row.floor_paise && row.reason !== "below_moq" ? formatRupees(row.floor_paise) : null,
          floor_price_paise: row.reason === "below_moq" ? null : row.floor_paise,
          floor_price: row.floor_paise && row.reason !== "below_moq" ? formatRupees(row.floor_paise) : null,
          approval_requested: Boolean(row.approval_id),
          guidance: guidance[row.decision] ?? "",
        },
      },
      rule: "evaluate_offer",
      outcome: row.decision,
    };
  }

  // --- settle_and_quote ----------------------------------------------------
  async settleAndQuote(input: Record<string, unknown>) {
    const product = this.resolveProduct(input.product_sku, input.product_sku);
    if (!product) return { result: { ok: false, output: { error: "unknown_product" } }, rule: null };
    const qty = this.validQty(input.qty);
    const price = this.validRupees(input.price_rupees, "price_rupees");
    if (!price) throw new AppError(400, "invalid_price_rupees", "price_rupees is required");
    const tier = this.policyTier("standard_quotation");
    if (tier !== "autonomous") {
      const id = await rpc<string>(this.svc, "request_approval", {
        p_conversation: this.ctx.conversation.id,
        p_kind: "custom_quotation",
        p_summary: `${this.ctx.prospect.name} agreed ${qty} ${product.unit} of ${product.name}`,
        p_recommendation: "Issue the quotation at the agreed price",
        p_requested_paise: price,
        p_context: { turn_id: this.ctx.turn.id, source: "ai", sku: product.sku, qty },
      });
      this.approvalIds.push(id);
      return { result: { ok: true, output: { quoted: false, approval_requested: true } }, rule: "autonomy_policy:standard_quotation", outcome: "approval_requested" };
    }
    const negotiationId = await rpc<string>(this.svc, "open_negotiation", {
      p_conversation: this.ctx.conversation.id,
      p_product: product.id,
      p_qty: qty,
    });
    const res = await rpc<Record<string, unknown>>(this.svc, "settle_negotiation", {
      p_negotiation: negotiationId,
      p_price_paise: price,
      p_qty: qty,
      p_turn: this.ctx.turn.id,
    });
    this.qtys.add(qty);
    if (res?.ok) {
      this.remember(price);
      this.quotationId = String(res.quotation_id);
      return {
        result: {
          ok: true,
          output: {
            quoted: true,
            quotation_id: res.quotation_id,
            price: formatRupees(price),
            qty,
            unit: product.unit,
            product: product.name,
            message: "Quotation PDF is being generated and will be sent to the buyer automatically.",
          },
        },
        rule: "evaluate_offer",
        outcome: "quoted",
      };
    }
    this.remember(res?.floor_paise);
    if (res?.approval_id) this.approvalIds.push(String(res.approval_id));
    return {
      result: {
        ok: true,
        output: {
          quoted: false,
          decision: res?.decision,
          reason: res?.reason,
          floor_price: res?.floor_paise ? formatRupees(Number(res.floor_paise)) : null,
          approval_requested: Boolean(res?.approval_id),
          guidance: "The price was not accepted by the rules. Do not quote it; offer the floor price or say the team is checking.",
        },
      },
      rule: "evaluate_offer",
      outcome: String(res?.decision ?? "not_accepted"),
    };
  }

  // --- request_approval ----------------------------------------------------
  async requestApproval(input: Record<string, unknown>) {
    const kind = String(input.kind ?? "");
    if (!(APPROVAL_KINDS as readonly string[]).includes(kind)) throw new AppError(400, "invalid_kind", "Unknown approval kind");
    const summary = String(input.summary ?? "").trim().slice(0, 300);
    if (!summary) throw new AppError(400, "invalid_summary", "summary is required");
    const recommendation = String(input.recommendation ?? "").trim().slice(0, 1000) || null;
    const action = KIND_POLICY[kind];
    const rule = `autonomy_policy:${action}`;
    if (this.policyTier(action) === "human_only" || (kind === "credit" && this.policyTier("large_credit") === "human_only" && /\b(9\d|1\d\d)\s*days?\b/i.test(summary))) {
      this.escalation = { reason: `Human only: ${summary}`, source: rule };
      return { result: { ok: true, output: { approval_requested: false, escalated: true, message: "This needs a person; the conversation will be handed over after your reply." } }, rule, outcome: "escalated" };
    }
    const openNeg = this.ctx.negotiations.find((n) => ["open", "awaiting_approval", "agreed"].includes(n.status));
    const id = await rpc<string>(this.svc, "request_approval", {
      p_conversation: this.ctx.conversation.id,
      p_kind: kind,
      p_summary: summary,
      p_recommendation: recommendation,
      p_negotiation: openNeg?.id ?? null,
      p_requested_paise: null,
      p_context: { turn_id: this.ctx.turn.id, source: "ai" },
    });
    this.approvalIds.push(id);
    return {
      result: { ok: true, output: { approval_requested: true, approval_id: id, message: "Tell the buyer the team is checking and you will confirm shortly." } },
      rule,
      outcome: "pending",
    };
  }

  // --- log_qualification_field ----------------------------------------------
  async logQualification(input: Record<string, unknown>) {
    const field = String(input.field ?? "");
    if (!(QUALIFICATION_FIELDS as readonly string[]).includes(field)) throw new AppError(400, "invalid_field", "Unknown field");
    const value = String(input.value ?? "").trim().slice(0, 500);
    if (!value) throw new AppError(400, "invalid_value", "value is required");
    await rpc(this.svc, "log_qualification_field", { p_prospect: this.ctx.prospect.id, p_field: field, p_value: value });
    return { result: { ok: true, output: { recorded: true, field } }, rule: null };
  }

  // --- schedule_followup -----------------------------------------------------
  async scheduleFollowup(input: Record<string, unknown>) {
    const rule = "autonomy_policy:followup";
    if (this.policyTier("followup") !== "autonomous") {
      return { result: { ok: false, output: { error: "policy_not_autonomous" } }, rule };
    }
    const hours = Math.min(720, Math.max(1, Number(input.in_hours) || 24));
    const reason = String(input.reason ?? "Follow up").trim().slice(0, 200) || "Follow up";
    const due = new Date(Date.now() + hours * 3600_000).toISOString();
    const id = await rpc<string>(this.svc, "schedule_followup", {
      p_conversation: this.ctx.conversation.id,
      p_due_at: due,
      p_reason: reason,
      p_created_by: "ai",
    });
    return { result: { ok: true, output: { scheduled: true, followup_id: id, due_at: due } }, rule };
  }

  // --- escalate_to_human (applied after the reply) ---------------------------
  escalate(input: Record<string, unknown>) {
    const reason = String(input.reason ?? "").trim().slice(0, 300) || "AI requested a person";
    this.escalation = { reason, source: "model_requested" };
    return {
      result: { ok: true, output: { escalated: true, message: "A person will take over after your reply. Tell the buyer someone from the team will reply shortly; do not promise anything else." } },
      rule: "forced_escalation",
    };
  }

  /** Applies a pending escalation (after the holding reply was queued). */
  async applyEscalation(): Promise<void> {
    if (!this.escalation) return;
    try {
      const rep = await rpc<string | null>(this.svc, "escalate_to_human", {
        p_conversation: this.ctx.conversation.id,
        p_reason: this.escalation.reason,
      });
      await this.logAction("escalate_to_human", { reason: this.escalation.reason }, { assigned_rep: rep }, this.escalation.source === "model_requested" ? "forced_escalation" : this.escalation.source, "escalated");
    } catch (e) {
      if (!isAppCode(e, "not_found")) throw e;
    }
  }
}

export interface KnowledgeHit {
  id: string;
  product_id: string | null;
  content: string;
  similarity: number;
}

/** Vector search when the built in embedding model is available, keyword search otherwise. */
export async function searchKnowledge(
  svc: SupabaseClient,
  manufacturerId: string,
  query: string,
  productId: string | null,
  log: Logger,
  count = 3,
): Promise<KnowledgeHit[]> {
  try {
    const embedding = await embedText(query);
    if (embedding) {
      const hits = await rpc<KnowledgeHit[]>(svc, "match_knowledge", {
        p_manufacturer: manufacturerId,
        p_query_embedding: JSON.stringify(embedding),
        p_product: productId,
        p_count: count,
      });
      if (hits?.length) return hits;
    }
  } catch (e) {
    log.warn("vector_search_failed", { error: errorMessage(e) });
  }
  return (await rpc<KnowledgeHit[]>(svc, "search_knowledge", {
    p_manufacturer: manufacturerId,
    p_query: query,
    p_product: productId,
    p_count: count,
  })) ?? [];
}

// deno-lint-ignore no-explicit-any
let session: any = null;
/** gte-small (384 dims, mean pooled, normalised). Returns null when Supabase.ai is unavailable. */
export async function embedText(text: string): Promise<number[] | null> {
  // deno-lint-ignore no-explicit-any
  const sb = (globalThis as any).Supabase;
  if (!sb?.ai?.Session) return null;
  if (!session) session = new sb.ai.Session("gte-small");
  const out = await session.run(text.slice(0, 2000), { mean_pool: true, normalize: true });
  return Array.from(out as ArrayLike<number>);
}
