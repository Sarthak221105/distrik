// Public WhatsApp webhook (PRD 8). GET: Meta verification handshake.
// POST: verify X-Hub-Signature-256, store each message once, apply status
// callbacks, return 200 fast. A replayed payload creates one message and one
// AI turn (guaranteed in SQL by the unique provider_message_id).

import { getAdapter } from "../_shared/channel/providers.ts";
import { config } from "../_shared/env.ts";
import { json, timingSafeEqual } from "../_shared/http.ts";
import { processWebhookPayload } from "../_shared/inbound.ts";
import { errorMessage, logger } from "../_shared/log.ts";
import { serviceClient } from "../_shared/supabase.ts";

const base = logger({ fn: "whatsapp-webhook" });

// Simple in-memory fixed window rate limit per client IP (per worker instance).
const WINDOW_MS = 60_000;
const LIMIT = 600;
const hits = new Map<string, { n: number; start: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.start > WINDOW_MS) {
    hits.set(ip, { n: 1, start: now });
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
    return false;
  }
  h.n++;
  return h.n > LIMIT;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    const expected = config.whatsappVerifyToken();
    if (mode === "subscribe" && expected && timingSafeEqual(token, expected)) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    base.warn("verify_failed");
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (rateLimited(ip)) {
    base.warn("rate_limited");
    return json({ code: "rate_limited", message: "Too many requests", field: null }, 429);
  }

  const raw = await req.text();
  const adapter = getAdapter("whatsapp");
  if (!(await adapter.verifySignature(raw, req.headers))) {
    base.warn("bad_signature", { provider: adapter.provider });
    return json({ code: "invalid_signature", message: "Signature verification failed", field: null }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ code: "invalid_json", message: "Body is not JSON", field: null }, 400);
  }

  try {
    const svc = serviceClient();
    const result = await processWebhookPayload(svc, adapter, payload, base.child({ provider: adapter.provider }));
    // Transient failures return 500 so the provider redelivers (ingestion is idempotent).
    const transient = result.messages.some((m) => !m.ok && !m.permanent);
    return json(
      {
        ok: !transient,
        messages: result.messages.map((m) => ({
          provider_message_id: m.provider_message_id,
          ok: m.ok,
          duplicate: Boolean(m.result?.duplicate),
          turn_id: m.result?.turn_id ?? null,
          error: m.error ?? null,
        })),
        statuses: result.statuses.length,
      },
      transient ? 500 : 200,
    );
  } catch (e) {
    base.error("webhook_failed", { error: errorMessage(e) });
    return json({ code: "internal_error", message: "Webhook processing failed", field: null }, 500);
  }
});
