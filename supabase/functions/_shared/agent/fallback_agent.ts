// Deterministic fallback sales agent (no ANTHROPIC_API_KEY). Same tools, same
// SQL rules, same price validator as the Claude agent. Replies quote only
// amounts returned by the pricing tools in this turn.

import type { Negotiation, Product, TurnContext } from "./context.ts";
import { pendingInboundText } from "./context.ts";
import { detectIntents, type Intents, type Lang } from "./intents.ts";
import { phrase } from "./phrases.ts";
import type { ToolExecutor } from "./tools.ts";

function productList(ctx: TurnContext): string {
  const names = ctx.products.slice(0, 5).map((p) => p.name);
  return names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0] ?? "our products";
}

function productBySku(ctx: TurnContext, sku: string | null | undefined): Product | null {
  if (!sku) return null;
  return ctx.products.find((p) => p.sku === sku) ?? null;
}

function productById(ctx: TurnContext, id: string | null | undefined): Product | null {
  return ctx.products.find((p) => p.id === id) ?? null;
}

function activeNegotiation(ctx: TurnContext, productId?: string): Negotiation | null {
  return ctx.negotiations.find((n) =>
    ["open", "awaiting_approval", "agreed"].includes(n.status) && (!productId || n.product_id === productId)
  ) ?? null;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

type Out = Record<string, unknown>;

/** "carton of 12" -> "carton" for natural phrasing. */
function unitWord(unit: string | null | undefined): string {
  return (unit ?? "unit").split(/s+ofs+/i)[0];
}

async function priceReply(exec: ToolExecutor, lang: Lang, product: Product, qty: number | null, requested: number | null): Promise<string> {
  if (!qty) {
    const facts = await exec.run("get_product_facts", { product_sku: product.sku });
    const list = facts.output.list_price as string | null;
    if (list) return phrase(lang, "ask_qty", { product: product.name, list, unit: unitWord(product.unit), moq: product.moq });
    return phrase(lang, "no_pricing", { product: product.name });
  }
  const res = await exec.run("propose_price", {
    product_sku: product.sku,
    qty,
    ...(requested ? { requested_price_rupees: requested } : {}),
  });
  if (!res.ok) return phrase(lang, "no_pricing", { product: product.name });
  const o = res.output as Out;
  const vars = { product: product.name, unit: unitWord(product.unit), qty, moq: product.moq, price: o.allowed_price as string, floor: o.floor_price as string };
  if (o.reason === "below_moq") return phrase(lang, "below_moq", vars);
  if (o.decision === "accept") return phrase(lang, requested ? "price_accept" : "price_list", vars);
  if (o.decision === "needs_approval" && o.floor_price) return phrase(lang, "price_needs_approval", vars);
  if (o.decision === "reject" && o.floor_price) return phrase(lang, "price_reject", vars);
  return phrase(lang, "no_pricing", vars);
}

async function confirmReply(ctx: TurnContext, exec: ToolExecutor, lang: Lang, intents: Intents): Promise<string | null> {
  const hinted = productBySku(ctx, intents.productSku);
  const neg = activeNegotiation(ctx, hinted?.id) ?? activeNegotiation(ctx);
  if (!neg) {
    if (ctx.negotiations.some((n) => n.status === "quoted")) return phrase(lang, "already_quoted");
    return null;
  }
  const product = productById(ctx, neg.product_id);
  if (!product) return null;
  const decided = neg.offers.find((o) => ["approved", "countered"].includes(o.decision) && o.by_party === "manufacturer");
  const accepted = neg.offers.find((o) => o.decision === "accept");
  if (neg.status === "awaiting_approval" && !decided) return phrase(lang, "settle_pending");
  const pricePaise = decided
    ? (decided.counter_paise ?? decided.price_paise)
    : accepted?.price_paise ?? neg.agreed_price_paise ?? neg.last_floor_paise;
  if (!pricePaise) return phrase(lang, "nothing_to_confirm");
  const res = await exec.run("settle_and_quote", { product_sku: product.sku, qty: intents.qty ?? neg.qty, price_rupees: pricePaise / 100 });
  const o = res.output as Out;
  if (res.ok && o.quoted) {
    return phrase(lang, "settle_done", { qty: o.qty as number, unit: unitWord(product.unit), product: product.name, price: o.price as string });
  }
  if (o.approval_requested) return phrase(lang, "settle_pending");
  if (o.floor_price) return phrase(lang, "price_reject", { qty: neg.qty, unit: unitWord(product.unit), floor: o.floor_price as string });
  return phrase(lang, "nothing_to_confirm");
}

export async function fallbackInbound(ctx: TurnContext, exec: ToolExecutor, lang: Lang): Promise<string> {
  const text = pendingInboundText(ctx);
  const intents = detectIntents(text, ctx.products);
  const parts: string[] = [];

  if (intents.injection) {
    await exec.logAction("injection_detected", { pattern: "instruction_override" }, {}, "prompt_injection_guard", "ignored");
  }

  // A document or image from the buyer (usually a PO after a quotation).
  if (ctx.trigger?.media_type && ["document", "image"].includes(ctx.trigger.media_type)) {
    return phrase(lang, "po_ack");
  }

  for (const f of intents.qualification) {
    await exec.run("log_qualification_field", { field: f.field, value: f.value });
  }

  if (intents.credit) {
    const days = intents.creditDays ? `${intents.creditDays} days` : "extended";
    await exec.run("request_approval", {
      kind: "payment_terms",
      summary: `${ctx.prospect.name} asks for ${days} credit`,
      recommendation: "Check the buyer's volume and the credit policy for this tier before approving.",
    });
    parts.push(phrase(lang, "credit_check", { days }));
  }
  if (intents.sample) {
    await exec.run("request_approval", {
      kind: "sample",
      summary: `${ctx.prospect.name} asks for a product sample`,
      recommendation: "Send one trial unit if the buyer's monthly volume justifies it.",
    });
    parts.push(phrase(lang, "sample_check"));
  }

  let handled = parts.length > 0;
  if (intents.confirm && !intents.requestedPriceRupees) {
    const r = await confirmReply(ctx, exec, lang, intents);
    if (r) {
      parts.push(r);
      handled = true;
    }
  }

  if (!handled && (intents.priceAsk || (intents.qty && intents.productSku))) {
    const neg = activeNegotiation(ctx);
    const product = productBySku(ctx, intents.productSku) ?? productById(ctx, neg?.product_id) ??
      (ctx.products.length === 1 ? ctx.products[0] : null);
    if (!product) {
      parts.push(phrase(lang, "ask_product", { products: productList(ctx) }));
    } else {
      const qty = intents.qty ?? (neg && neg.product_id === product.id ? neg.qty : null);
      parts.push(await priceReply(exec, lang, product, qty, intents.requestedPriceRupees));
    }
    handled = true;
  }

  if (!handled && (intents.catalogue || intents.greeting)) {
    const sent = ctx.catalogues.length && ctx.windowOpen ? await exec.run("send_catalogue", {}) : null;
    if (sent?.ok && (sent.output.sent || sent.output.already_sent_today)) {
      parts.push(phrase(lang, intents.greeting ? "greet_catalogue" : "catalogue_sent", { mfr: ctx.manufacturer.name }));
    } else {
      parts.push(phrase(lang, "greet", { mfr: ctx.manufacturer.name, products: productList(ctx) }));
    }
    handled = true;
  }

  if (!handled && intents.thanks) {
    parts.push(phrase(lang, "thanks"));
    handled = true;
  }
  if (!handled && intents.qualification.length) {
    parts.push(phrase(lang, "noted") + " " + phrase(lang, "next_question"));
    handled = true;
  }
  if (!handled) parts.push(phrase(lang, "generic"));
  return parts.join(" ");
}

/** Replies for system triggered turns (approval decided / expired, follow up, reorder, opener) inside the window. */
export async function fallbackEvent(ctx: TurnContext, exec: ToolExecutor, lang: Lang): Promise<string | null> {
  const c = ctx.turn.context ?? {};
  switch (ctx.turn.reason) {
    case "approval_decided": {
      const appr = ctx.approvals.find((a) => a.id === c.approval_id);
      const decision = String(c.decision ?? "");
      const neg = ctx.negotiations.find((n) => n.id === appr?.negotiation_id) ?? null;
      const product = productById(ctx, neg?.product_id);
      if (!appr || appr.kind !== "price_below_floor" || !neg || !product) {
        return phrase(lang, decision === "reject" ? "approval_other_rejected" : "approval_other_approved");
      }
      const qty = appr.qty ?? neg.qty;
      if (decision === "approve") return phrase(lang, "approval_approved", { product: product.name });
      const target = decision === "counter" ? Number(c.counter_paise ?? appr.counter_paise) : Number(appr.permitted_paise ?? neg.last_floor_paise);
      if (!target) return phrase(lang, "approval_other_rejected");
      const r = await exec.run("propose_price", { product_sku: product.sku, qty, requested_price_rupees: target / 100, _by_party: "ai" });
      const o = r.output as Out;
      if (!r.ok || o.decision !== "accept") return phrase(lang, "settle_pending");
      return phrase(lang, decision === "counter" ? "approval_countered" : "approval_rejected", {
        price: o.allowed_price as string,
        unit: unitWord(product.unit),
        qty,
        product: product.name,
      });
    }
    case "approval_expired": {
      const appr = ctx.approvals.find((a) => a.id === c.approval_id);
      const neg = ctx.negotiations.find((n) => n.id === appr?.negotiation_id) ?? null;
      const product = productById(ctx, neg?.product_id);
      const hold = Number(c.hold_price_paise ?? appr?.permitted_paise ?? 0);
      if (!neg || !product || !hold) return phrase(lang, "approval_other_rejected");
      const qty = appr?.qty ?? neg.qty;
      const r = await exec.run("propose_price", { product_sku: product.sku, qty, requested_price_rupees: hold / 100, _by_party: "ai" });
      const o = r.output as Out;
      if (!r.ok || o.decision !== "accept") return phrase(lang, "settle_pending");
      return phrase(lang, "approval_expired", { price: o.allowed_price as string, unit: unitWord(product.unit), qty });
    }
    case "followup": {
      const neg = ctx.negotiations[0];
      const product = productById(ctx, neg?.product_id) ?? ctx.products[0];
      return phrase(lang, "followup", { product: product?.name ?? "our products" });
    }
    case "reorder_due": {
      const product = productById(ctx, c.product_id as string) ?? ctx.products[0];
      return phrase(lang, "reorder", { product: product?.name ?? "", date: fmtDate((c.last_order_date as string) ?? null) || "recently" });
    }
    case "outreach_opener": {
      const product = productById(ctx, ctx.campaignProductIds[0]) ?? ctx.products[0];
      return phrase(lang, "outreach", { name: ctx.contactName ?? "ji", mfr: ctx.manufacturer.name, product: product?.name ?? "" });
    }
    default:
      return null;
  }
}
