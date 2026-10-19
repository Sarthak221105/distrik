// WhatsApp Cloud API (Meta) webhook format: parsing and X-Hub-Signature-256
// verification. Shared by the meta_cloud provider and the sandbox provider
// (the sandbox speaks the same payload format so simulations exercise the
// exact production parsing code).

import type { InboundMessage, StatusUpdate } from "./types.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

function tsToIso(ts: unknown): string {
  const n = Number(ts);
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000).toISOString();
  return new Date().toISOString();
}

function* changeValues(payload: Any): Generator<Any> {
  if (!payload || typeof payload !== "object") return;
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (change?.field && change.field !== "messages") continue;
      if (change?.value && typeof change.value === "object") yield change.value;
    }
  }
}

export function parseMetaInbound(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  for (const value of changeValues(payload)) {
    const phoneNumberId = String(value?.metadata?.phone_number_id ?? "");
    const contacts: Any[] = Array.isArray(value.contacts) ? value.contacts : [];
    const messages: Any[] = Array.isArray(value.messages) ? value.messages : [];
    for (const m of messages) {
      if (!m?.id || !m?.from) continue;
      const contact = contacts.find((c) => c?.wa_id === m.from) ?? contacts[0];
      const type = String(m.type ?? "text");
      let body: string | null = null;
      let media: InboundMessage["media"] = null;
      switch (type) {
        case "text":
          body = m.text?.body ?? null;
          break;
        case "button":
          body = m.button?.text ?? m.button?.payload ?? null;
          break;
        case "interactive":
          body = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
          break;
        case "image":
        case "document":
        case "audio":
        case "video":
        case "sticker": {
          const obj = m[type] ?? {};
          body = obj.caption ?? null;
          if (type !== "sticker" && obj.id) {
            media = {
              id: String(obj.id),
              type: type as "image" | "document" | "audio" | "video",
              mime: obj.mime_type ?? null,
              filename: obj.filename ?? null,
            };
          }
          break;
        }
        case "location":
          body = m.location ? `[location ${m.location.latitude},${m.location.longitude}] ${m.location.name ?? ""}`.trim() : null;
          break;
        default:
          body = null;
      }
      out.push({
        phoneNumberId,
        from: String(m.from),
        providerMessageId: String(m.id),
        body,
        sentAt: tsToIso(m.timestamp),
        profileName: contact?.profile?.name ?? null,
        media,
        type,
      });
    }
  }
  return out;
}

export function parseMetaStatus(payload: unknown): StatusUpdate[] {
  const out: StatusUpdate[] = [];
  for (const value of changeValues(payload)) {
    const statuses: Any[] = Array.isArray(value.statuses) ? value.statuses : [];
    for (const s of statuses) {
      if (!s?.id || !s?.status) continue;
      const err = Array.isArray(s.errors) && s.errors.length
        ? [s.errors[0].code, s.errors[0].title, s.errors[0].error_data?.details].filter(Boolean).join(": ")
        : null;
      out.push({ providerMessageId: String(s.id), status: String(s.status), at: tsToIso(s.timestamp), error: err });
    }
  }
  return out;
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
}

/** Verifies X-Hub-Signature-256: sha256=<hex HMAC of the raw body with the app secret>. */
export async function verifyMetaSignature(secret: string, rawBody: string, headers: Headers): Promise<boolean> {
  if (!secret) return false;
  const header = headers.get("x-hub-signature-256") ?? "";
  const m = header.match(/^sha256=([0-9a-f]{64})$/i);
  if (!m) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  const got = m[1].toLowerCase();
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

/** Builds a Meta format inbound text/media webhook (used by the sandbox simulator and tests). */
export function buildMetaInboundPayload(opts: {
  phoneNumberId: string;
  displayNumber?: string | null;
  from: string;
  profileName?: string | null;
  providerMessageId: string;
  text?: string | null;
  media?: { type: "document" | "image"; id: string; mime: string; filename?: string | null } | null;
  timestamp?: number;
}): Record<string, unknown> {
  const ts = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  // deno-lint-ignore no-explicit-any
  const message: Record<string, any> = { from: opts.from, id: opts.providerMessageId, timestamp: ts };
  if (opts.media) {
    message.type = opts.media.type;
    message[opts.media.type] = {
      id: opts.media.id,
      mime_type: opts.media.mime,
      ...(opts.media.type === "document" ? { filename: opts.media.filename ?? "document.pdf" } : {}),
      ...(opts.text ? { caption: opts.text } : {}),
    };
  } else {
    message.type = "text";
    message.text = { body: opts.text ?? "" };
  }
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "sandbox-waba",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: opts.displayNumber ?? "", phone_number_id: opts.phoneNumberId },
          contacts: [{ profile: { name: opts.profileName ?? "" }, wa_id: opts.from }],
          messages: [message],
        },
      }],
    }],
  };
}
