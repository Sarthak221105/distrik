// ai-reply (PRD 9): one agent loop per queued AI turn. Claims the turn, loads
// the conversation, runs Claude with the fixed tool set (or the deterministic
// fallback agent when no API key is configured), validates every drafted
// reply against the prices returned by the pricing rules in this turn, and
// queues it through enqueue_outbound_message (consent gate, window, cap).
// Outside the 24 hour window only approved templates are used.

import { aiEnabled, aiModel, isRetryableAiError } from "../_shared/ai.ts";
import { describeError, runClaudeAgent, type Validation } from "../_shared/agent/claude_agent.ts";
import { loadTurnContext, pendingInboundText, type Turn, type TurnContext } from "../_shared/agent/context.ts";
import { fallbackEvent, fallbackInbound } from "../_shared/agent/fallback_agent.ts";
import { detectIntents, detectLanguage, forcedEscalationReason, type Lang } from "../_shared/agent/intents.ts";
import { holdingMessage } from "../_shared/agent/phrases.ts";
import { pickTemplate, renderTemplate } from "../_shared/agent/templates.ts";
import { ToolExecutor } from "../_shared/agent/tools.ts";
import type { SupabaseClient } from "../_shared/deps.ts";
import { isAppCode } from "../_shared/http.ts";
import { errorMessage, type Logger } from "../_shared/log.ts";
import { formatRupees } from "../_shared/money.ts";
import { expandAllowed, validatePrices } from "../_shared/price_validator.ts";
import { rpc } from "../_shared/supabase.ts";
import { type JobContext, serveWorker } from "../_shared/worker.ts";

const SKIP_CODES = ["ai_paused", "consent_required", "window_closed", "template_not_approved", "empty_message"];

serveWorker<{ turn_id: string }>({
  name: "ai-reply",
  queue: "ai_turns",
  vt: 120,
  batch: 3,
  maxAttempts: 5,
  budgetMs: 90_000,
  async handle(job, jc) {
    if (!job?.turn_id) return;
    const turn = await rpc<Turn | null>(jc.svc, "claim_ai_turn", { p_turn: job.turn_id, p_max_attempts: 5 });
    if (!turn || !turn.id) {
      jc.log.info("turn_not_claimable", { turn_id: job.turn_id });
      return;
    }
    try {
      await runTurn(jc, turn);
    } catch (e) {
      await rpc(jc.svc, "finish_ai_turn", { p_turn: turn.id, p_status: "failed", p_error: errorMessage(e) }).catch(() => {});
      throw e;
    }
  },
});

async function finish(svc: SupabaseClient, turnId: string, status: "done" | "skipped" | "failed", error?: string) {
  await rpc(svc, "finish_ai_turn", { p_turn: turnId, p_status: status, p_error: error ?? null });
}

function languageOf(ctx: TurnContext): Lang {
  const text = pendingInboundText(ctx);
  return text ? detectLanguage(text) : "en";
}

function productName(ctx: TurnContext, id?: unknown): string {
  const p = ctx.products.find((x) => x.id === id) ??
    ctx.products.find((x) => x.id === ctx.negotiations[0]?.product_id) ??
    ctx.products.find((x) => ctx.campaignProductIds.includes(x.id)) ?? ctx.products[0];
  return p?.name ?? "";
}

function eventDescription(ctx: TurnContext): string {
  const c = ctx.turn.context ?? {};
  switch (ctx.turn.reason) {
    case "inbound_message":
      return c.po_id
        ? "The buyer sent a purchase order document. Thank them and say the team will verify it against the quotation."
        : "Reply to the buyer's latest message(s). Use tools for any facts or prices.";
    case "approval_decided": {
      const appr = ctx.approvals.find((a) => a.id === c.approval_id);
      const kind = appr?.kind ?? "request";
      if (c.decision === "approve") {
        return `The manufacturer APPROVED the buyer's ${kind} request.` +
          (kind === "price_below_floor" ? " The quotation is being generated and will be sent automatically. Share the good news." : " Share the good news and offer next steps.");
      }
      if (c.decision === "counter") {
        return `The manufacturer COUNTERED the buyer's price request at ${formatRupees(Number(c.counter_paise))} per unit. Call propose_price for the same product and quantity with that requested price, then offer it to the buyer.`;
      }
      const floor = appr?.permitted_paise ? ` Call propose_price with requested price ${formatRupees(appr.permitted_paise)} to confirm the best allowed price, then offer it.` : "";
      return `The manufacturer REJECTED the buyer's ${kind} request. Tell the buyer politely.${floor}`;
    }
    case "approval_expired":
      return `The price approval expired without a decision. Hold the last allowed offer: call propose_price with requested price ${formatRupees(Number(c.hold_price_paise ?? 0))} for the same product and quantity, then offer it.`;
    case "followup":
      return `The buyer has not replied. Send one short, friendly follow up (attempt ${c.attempt ?? 1}, reason: ${c.reason ?? "follow up"}).`;
    case "reorder_due":
      return `This customer's reorder of ${productName(ctx, c.product_id)} is due (last order ${c.last_order_date ?? "recently"}). Send a short reminder asking whether to book the next order and the quantity.`;
    case "outreach_opener":
      return "This is the first message to an opted in trade contact. Introduce the manufacturer briefly and offer the catalogue. Mention they can reply STOP to opt out.";
    default:
      return "Reply helpfully to the buyer.";
  }
}

async function runTurn(jc: JobContext, turn: Turn) {
  const { svc } = jc;
  const ctx = await loadTurnContext(svc, turn);
  const log = jc.log.child({ correlation_id: ctx.correlationId, turn_id: turn.id, conversation_id: ctx.conversation.id, reason: turn.reason });

  if (ctx.conversation.ai_paused) {
    log.info("turn_skipped", { why: "ai_paused" });
    return finish(svc, turn.id, "skipped", "ai_paused");
  }
  if (!["engaged", "opted_in"].includes(ctx.consent)) {
    log.info("turn_skipped", { why: "consent_" + ctx.consent });
    return finish(svc, turn.id, "skipped", "consent_" + ctx.consent);
  }

  // Several quick buyer messages: let the newest turn answer them all.
  if (turn.reason === "inbound_message" && turn.trigger_message_id) {
    const lastInbound = [...ctx.messages].reverse().find((m) => m.direction === "inbound");
    if (lastInbound && lastInbound.id !== turn.trigger_message_id) {
      const { data: later } = await svc.from("ai_turns").select("id").eq("trigger_message_id", lastInbound.id)
        .in("status", ["queued", "running"]).maybeSingle();
      if (later) {
        log.info("turn_skipped", { why: "superseded", by: (later as { id: string }).id });
        return finish(svc, turn.id, "skipped", "superseded_by_newer_message");
      }
    }
  }

  if (turn.reason === "reorder_due") {
    const since = new Date(Date.now() - 20 * 3600_000).toISOString();
    const { data: recent } = await svc.from("ai_turns").select("id").eq("conversation_id", ctx.conversation.id)
      .eq("reason", "reorder_due").eq("status", "done").gte("completed_at", since).limit(1);
    if (recent?.length) {
      log.info("turn_skipped", { why: "reorder_already_reminded" });
      return finish(svc, turn.id, "skipped", "reorder_reminder_already_sent");
    }
    const { data: rp } = await svc.from("reorder_predictions").select("last_order_date")
      .eq("prospect_id", ctx.prospect.id).eq("product_id", String(turn.context?.product_id ?? "")).maybeSingle();
    if (rp) ctx.turn.context = { ...ctx.turn.context, last_order_date: (rp as { last_order_date: string }).last_order_date };
  }

  const useClaude = aiEnabled();
  const model = useClaude ? aiModel(ctx.prompt.model) : "fallback-rules-v1";
  const exec = new ToolExecutor(svc, ctx, log, { model, promptVersion: ctx.prompt.version });
  const lang = languageOf(ctx);

  const validate = (text: string): Validation => {
    const allowedSet = expandAllowed(exec.allowedPrices, exec.qtys);
    const r = validatePrices(text, allowedSet);
    return {
      ok: r.ok,
      violations: r.violations.map((v) => v.raw),
      allowed: [...exec.allowedPrices].map((p) => formatRupees(p)),
    };
  };
  const onBlocked = async (draft: string, v: Validation, attempt: number) => {
    log.warn("validator_block", { attempt, violations: v.violations.length });
    await exec.logAction("validator_block", { draft, attempt }, { violations: v.violations, allowed: v.allowed }, "price_validator", "blocked");
  };

  let reply: string | null = null;
  let template: { id: string; params: string[] } | null = null;
  let path: "claude" | "fallback" | "template" | "guardrail" = useClaude ? "claude" : "fallback";

  if (!ctx.windowOpen) {
    // Outside the session window: approved templates only, no free text.
    if (turn.reason === "inbound_message") return finish(svc, turn.id, "skipped", "window_closed");
    const purpose = ({ followup: "followup", approval_decided: "approval_update", approval_expired: "approval_update", reorder_due: "reorder", outreach_opener: "outreach_opener" } as Record<string, string>)[turn.reason] ?? "followup";
    const tpl = pickTemplate(ctx.templates, purpose, lang, ctx.manufacturer.id);
    if (!tpl) {
      log.warn("no_template", { purpose });
      await exec.logAction("reply", { reason: turn.reason, purpose }, {}, "template_required", "skipped:no_approved_template");
      return finish(svc, turn.id, "skipped", `no approved template for ${purpose}`);
    }
    let quotationNumber = "";
    if (turn.context?.quotation_id) {
      const { data } = await svc.from("quotations").select("number").eq("id", String(turn.context.quotation_id)).maybeSingle();
      quotationNumber = (data as { number?: string } | null)?.number ?? "";
    }
    const lastDate = turn.context?.last_order_date
      ? new Date(String(turn.context.last_order_date)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "";
    const rendered = renderTemplate(tpl, {
      name: ctx.contactName ?? ctx.prospect.name,
      manufacturer: ctx.manufacturer.name,
      product: productName(ctx, turn.context?.product_id),
      quotation_number: quotationNumber,
      date: lastDate,
      qty: String(ctx.negotiations[0]?.qty ?? ""),
    });
    reply = rendered.body;
    template = { id: tpl.id, params: rendered.params };
    path = "template";
  } else {
    // Forced escalation guardrail runs before any model or rule: complaints,
    // legal, contract terms, credit beyond policy.
    if (turn.reason === "inbound_message") {
      const intents = detectIntents(pendingInboundText(ctx), ctx.products);
      const maxDays = Number((ctx.manufacturer.settings as Record<string, unknown>)?.max_credit_days ?? 45);
      const reason = forcedEscalationReason(intents, maxDays);
      if (reason) {
        exec.escalation = { reason, source: "forced_escalation" };
        reply = holdingMessage(lang);
        path = "guardrail";
      }
    }

    if (!reply && useClaude) {
      try {
        const out = await runClaudeAgent({ ctx, exec, log, lang, event: eventDescription(ctx), validate, onBlocked });
        if (out.reply) reply = out.reply;
        else if (out.failedValidation) {
          exec.escalation = { reason: "Price validator blocked two drafted replies", source: "price_validator" };
          reply = holdingMessage(lang);
        } else if (out.refused) {
          exec.escalation = { reason: "Model declined to answer; needs a person", source: "model_refusal" };
          reply = holdingMessage(lang);
        } else if (exec.escalation) {
          reply = holdingMessage(lang);
        }
      } catch (e) {
        if (isRetryableAiError(e) && jc.readCt < 3) throw e;
        log.error("model_error_fallback", { error: describeError(e) });
        await exec.logAction("model_error", {}, { error: describeError(e) }, null, "fallback");
        exec.meta.model = "fallback-rules-v1";
        path = "fallback";
      }
    }

    if (!reply && path === "fallback") {
      reply = turn.reason === "inbound_message" ? await fallbackInbound(ctx, exec, lang) : await fallbackEvent(ctx, exec, lang);
      if (exec.escalation && reply) reply = holdingMessage(lang);
    }
  }

  if (!reply) {
    log.info("no_reply", { path });
    await exec.applyEscalation();
    await markFollowup(svc, turn);
    return finish(svc, turn.id, "done", "no_reply");
  }

  // Final validation for every path (the Claude path validated already; this is cheap and catches templates too).
  let v = validate(reply);
  if (!v.ok) {
    await onBlocked(reply, v, path === "claude" ? 3 : 1);
    exec.escalation = exec.escalation ?? { reason: "Price validator blocked the drafted reply", source: "price_validator" };
    reply = holdingMessage(lang);
    template = null;
    v = validate(reply);
  }

  const actionId = crypto.randomUUID();
  try {
    const messageId = await rpc<string>(svc, "enqueue_outbound_message", {
      p_conversation: ctx.conversation.id,
      p_body: reply,
      p_template: template?.id ?? null,
      p_actor: "ai",
      p_template_params: template ? template.params : null,
      p_idempotency_key: `turn:${turn.id}:reply`,
      p_turn: turn.id,
      p_ai_action: actionId,
    });
    await exec.logAction("reply", {
      correlation_id: ctx.correlationId,
      reason: turn.reason,
      path,
      language: lang,
      template: Boolean(template),
    }, {
      message_id: messageId,
      validated: true,
      amounts: validatePrices(reply, []).amounts.map((a) => a.raw),
      tools: exec.calls.map((c) => c.name),
    }, "price_validator", "sent", { id: actionId });
    log.info("reply_queued", { message_id: messageId, path, language: lang, tools: exec.calls.length });
  } catch (e) {
    if (isAppCode(e, ...SKIP_CODES)) {
      const code = (e as { code?: string }).code ?? "blocked";
      await exec.logAction("reply", { reason: turn.reason, path }, { error: errorMessage(e) }, "enqueue_outbound_message", "blocked:" + code, { id: actionId });
      await exec.applyEscalation().catch(() => {});
      log.info("turn_skipped", { why: code });
      return finish(svc, turn.id, "skipped", code);
    }
    if (isAppCode(e, "daily_cap_reached")) {
      await exec.logAction("reply", { reason: turn.reason }, { error: errorMessage(e) }, "daily_outbound_cap", "blocked:daily_cap_reached", { id: actionId });
      return finish(svc, turn.id, "failed", "daily_cap_reached");
    }
    throw e;
  }

  await exec.applyEscalation();
  await markFollowup(svc, turn);
  await finish(svc, turn.id, "done");
}

async function markFollowup(svc: SupabaseClient, turn: Turn) {
  if (turn.reason === "followup" && turn.context?.followup_id) {
    await svc.from("followups").update({ status: "done" }).eq("id", String(turn.context.followup_id));
  }
}

export type { Logger };
