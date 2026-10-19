// Loads everything one AI turn needs (PRD 9: conversation, prospect, fit,
// qualification, negotiations, approvals, products, templates, catalogues).
// Prospect data is kept minimal: business name, city, type and the contact's
// first name for templates. Product floors are never loaded into the prompt.

import type { SupabaseClient } from "../deps.ts";
import { rpc } from "../supabase.ts";
import type { ProductLite } from "./intents.ts";

export interface Turn {
  id: string;
  manufacturer_id: string;
  conversation_id: string;
  trigger_message_id: string | null;
  reason: string;
  context: Record<string, unknown>;
  status: string;
  attempts: number;
  created_at: string;
}

export interface Product extends ProductLite {
  description: string | null;
  specs: Record<string, unknown>;
  unit: string;
  moq: number;
  hsn_code: string | null;
  gst_rate: number;
  certifications: string[];
  distributor_price_paise: number | null;
}

export interface Offer {
  negotiation_id: string;
  by_party: string;
  price_paise: number;
  qty: number;
  decision: string;
  counter_paise: number | null;
  created_at: string;
}

export interface Negotiation {
  id: string;
  product_id: string;
  qty: number;
  status: string;
  agreed_price_paise: number | null;
  last_floor_paise: number | null;
  updated_at: string;
  offers: Offer[];
}

export interface Approval {
  id: string;
  kind: string;
  status: string;
  negotiation_id: string | null;
  requested_paise: number | null;
  permitted_paise: number | null;
  approved_price_paise: number | null;
  counter_paise: number | null;
  qty: number | null;
  summary: string | null;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  language: string;
  body: string;
  variables: string[];
  purpose: string | null;
  manufacturer_id: string | null;
}

export interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  actor: string;
  body: string | null;
  media_type: string | null;
  created_at: string;
}

export interface TurnContext {
  turn: Turn;
  correlationId: string;
  manufacturer: { id: string; name: string; legal_name: string | null; settings: Record<string, unknown> };
  conversation: {
    id: string;
    prospect_id: string;
    contact_id: string;
    channel: string;
    window_expires_at: string | null;
    ai_paused: boolean;
    last_inbound_at: string | null;
  };
  windowOpen: boolean;
  consent: string;
  prospect: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    type: string;
    category: string | null;
    stage: string;
    fit_score: number | null;
    qualification: Record<string, { value?: string }>;
    campaign_id: string | null;
    research_summary: string | null;
  };
  contactName: string | null;
  messages: ChatMessage[];
  trigger: ChatMessage | null;
  negotiations: Negotiation[];
  approvals: Approval[];
  products: Product[];
  templates: Template[];
  catalogues: Array<{ id: string; title: string | null; storage_path: string; kind: string }>;
  policies: Record<string, { tier: string; threshold_paise: number | null }>;
  prompt: { version: number | null; system_prompt: string | null; model: string | null };
  campaignProductIds: string[];
}

function rows<T>(res: { data: unknown; error: unknown }, what: string): T[] {
  if (res.error) throw new Error(`load ${what}: ${(res.error as { message?: string }).message ?? "error"}`);
  return (res.data ?? []) as T[];
}

function one<T>(res: { data: unknown; error: unknown }, what: string): T {
  if (res.error) throw new Error(`load ${what}: ${(res.error as { message?: string }).message ?? "error"}`);
  if (!res.data) throw new Error(`${what} not found`);
  return res.data as T;
}

export async function loadTurnContext(svc: SupabaseClient, turn: Turn): Promise<TurnContext> {
  const conv = one<TurnContext["conversation"] & { manufacturer_id: string }>(
    await svc.from("conversations")
      .select("id, manufacturer_id, prospect_id, contact_id, channel, window_expires_at, ai_paused, last_inbound_at")
      .eq("id", turn.conversation_id).single(),
    "conversation",
  );
  const mid = turn.manufacturer_id;

  const [mfrRes, prospectRes, contactRes, msgRes, negRes, apprRes, prodRes, tplRes, docRes, polRes, promptRes] = await Promise.all([
    svc.from("manufacturers").select("id, name, legal_name, settings").eq("id", mid).single(),
    svc.from("prospects")
      .select("id, name, city, state, type, category, stage, fit_score, qualification, campaign_id, research")
      .eq("id", conv.prospect_id).single(),
    svc.from("contacts").select("id, name").eq("id", conv.contact_id).maybeSingle(),
    svc.from("messages").select("id, direction, actor, body, media_type, created_at")
      .eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(30),
    svc.from("negotiations")
      .select("id, product_id, qty, status, agreed_price_paise, last_floor_paise, updated_at")
      .eq("conversation_id", conv.id).order("updated_at", { ascending: false }).limit(5),
    svc.from("human_approvals")
      .select("id, kind, status, negotiation_id, requested_paise, permitted_paise, approved_price_paise, counter_paise, qty, summary, created_at")
      .eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(5),
    svc.from("products")
      .select("id, name, sku, category, description, specs, unit, moq, hsn_code, gst_rate, certifications, distributor_price_paise")
      .eq("manufacturer_id", mid).eq("status", "active").order("name"),
    svc.from("message_templates").select("id, name, language, body, variables, purpose, manufacturer_id")
      .eq("meta_status", "approved").or(`manufacturer_id.eq.${mid},manufacturer_id.is.null`),
    svc.from("documents").select("id, title, storage_path, kind")
      .eq("manufacturer_id", mid).eq("approved_for_sharing", true).in("kind", ["catalogue", "brochure", "price_list"])
      .neq("status", "failed").order("created_at", { ascending: false }),
    svc.from("autonomy_policies").select("action_type, tier, threshold_paise").eq("manufacturer_id", mid),
    svc.from("prompt_versions").select("version, system_prompt, model").eq("agent", "sales_agent").eq("active", true)
      .maybeSingle(),
  ]);

  const manufacturer = one<TurnContext["manufacturer"]>(mfrRes, "manufacturer");
  const p = one<Record<string, unknown>>(prospectRes, "prospect");
  const contact = contactRes.data as { name: string | null } | null;
  const messages = rows<ChatMessage>(msgRes, "messages").reverse();
  const negs = rows<Omit<Negotiation, "offers">>(negRes, "negotiations");
  let offers: Offer[] = [];
  if (negs.length) {
    offers = rows<Offer>(
      await svc.from("negotiation_offers")
        .select("negotiation_id, by_party, price_paise, qty, decision, counter_paise, created_at")
        .in("negotiation_id", negs.map((n) => n.id)).order("created_at", { ascending: false }).limit(30),
      "offers",
    );
  }
  const negotiations: Negotiation[] = negs.map((n) => ({ ...n, offers: offers.filter((o) => o.negotiation_id === n.id) }));

  const consent = await rpc<string>(svc, "consent_status_for", { p_contact: conv.contact_id, p_channel: conv.channel });

  const policies: TurnContext["policies"] = {};
  for (const r of rows<{ action_type: string; tier: string; threshold_paise: number | null }>(polRes, "policies")) {
    policies[r.action_type] = { tier: r.tier, threshold_paise: r.threshold_paise };
  }

  let campaignProductIds: string[] = [];
  if (p.campaign_id) {
    const { data } = await svc.from("campaigns").select("product_ids").eq("id", p.campaign_id).maybeSingle();
    campaignProductIds = ((data as { product_ids?: string[] } | null)?.product_ids) ?? [];
  }

  const trigger = turn.trigger_message_id
    ? messages.find((m) => m.id === turn.trigger_message_id) ?? null
    : null;
  const research = (p.research ?? {}) as Record<string, unknown>;
  const firstName = contact?.name ? contact.name.trim().split(/\s+/)[0] : null;

  return {
    turn,
    correlationId: String(turn.context?.correlation_id ?? crypto.randomUUID()),
    manufacturer,
    conversation: conv,
    windowOpen: Boolean(conv.window_expires_at && new Date(conv.window_expires_at).getTime() > Date.now() + 60_000),
    consent,
    prospect: {
      id: String(p.id),
      name: String(p.name),
      city: (p.city as string) ?? null,
      state: (p.state as string) ?? null,
      type: String(p.type),
      category: (p.category as string) ?? null,
      stage: String(p.stage),
      fit_score: (p.fit_score as number) ?? null,
      qualification: (p.qualification ?? {}) as Record<string, { value?: string }>,
      campaign_id: (p.campaign_id as string) ?? null,
      research_summary: typeof research.summary === "string" ? research.summary : null,
    },
    contactName: firstName,
    messages,
    trigger,
    negotiations,
    approvals: rows<Approval>(apprRes, "approvals"),
    products: rows<Product>(prodRes, "products").map((r) => ({ ...r, gst_rate: Number(r.gst_rate) })),
    templates: rows<Template>(tplRes, "templates"),
    catalogues: rows<TurnContext["catalogues"][number]>(docRes, "documents"),
    policies,
    prompt: (promptRes.data as TurnContext["prompt"]) ?? { version: null, system_prompt: null, model: null },
    campaignProductIds,
  };
}

export function latestInboundText(ctx: TurnContext): string {
  if (ctx.trigger?.direction === "inbound") return ctx.trigger.body ?? "";
  const last = [...ctx.messages].reverse().find((m) => m.direction === "inbound");
  return last?.body ?? "";
}

/** Inbound messages since the last outbound message (buyers often send several in a row). */
export function pendingInboundText(ctx: TurnContext): string {
  const out: string[] = [];
  for (let i = ctx.messages.length - 1; i >= 0; i--) {
    const m = ctx.messages[i];
    if (m.direction === "outbound") break;
    if (m.body) out.unshift(m.body);
  }
  return out.join("\n") || latestInboundText(ctx);
}
