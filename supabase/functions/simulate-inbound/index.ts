// simulate-inbound (authenticated owner or sales head, sandbox provider only):
// the manufacturer's WhatsApp test sandbox. Builds a Meta format webhook payload
// for the caller's own business number and runs it through the same processing
// code as whatsapp-webhook.
//
// POST { manufacturer_id, from_phone, profile_name?, text?, media?: { type: "document"|"image", filename, mime, base64 } }
// 200  { ok, provider_message_id, results: [{ provider_message_id, ok, correlation_id, result: { duplicate, message_id,
//        conversation_id, prospect_id, turn_id, consent, po_id, new_prospect }, error? }] }

import { requireCaller, requireRole } from "../_shared/auth.ts";
import { buildMetaInboundPayload } from "../_shared/channel/meta_format.ts";
import { getAdapter } from "../_shared/channel/providers.ts";
import { config } from "../_shared/env.ts";
import { AppError, errorResponse, json, preflight, readJson, requireString, requireUuid } from "../_shared/http.ts";
import { extensionFor, mediaKey, type PreuploadedMedia, processWebhookPayload } from "../_shared/inbound.ts";
import { logger } from "../_shared/log.ts";
import { serviceClient } from "../_shared/supabase.ts";

const log = logger({ fn: "simulate-inbound" });
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw new AppError(405, "method_not_allowed", "POST only");
    if (config.whatsappProvider() !== "sandbox") {
      throw new AppError(403, "sandbox_only", "The buyer simulator only runs with WHATSAPP_PROVIDER=sandbox");
    }
    const caller = await requireCaller(req);
    requireRole(caller, ["owner", "sales_head"]);
    const body = await readJson<Record<string, unknown>>(req);
    const mid = requireUuid(body.manufacturer_id, "manufacturer_id");
    if (mid !== caller.manufacturerId) {
      throw new AppError(403, "forbidden", "You can only test your own business number", "manufacturer_id");
    }
    const phoneRaw = requireString(body.from_phone, "from_phone", { max: 20 });
    const digits = phoneRaw.replace(/[^0-9]/g, "");
    const from = digits.length === 10 ? "91" + digits : digits;
    if (!/^[1-9]\d{9,14}$/.test(from)) throw new AppError(400, "invalid_from_phone", "Enter a valid phone number", "from_phone");
    const text = typeof body.text === "string" ? body.text.slice(0, 4096) : null;
    const media = body.media as { type?: string; filename?: string; mime?: string; base64?: string } | undefined;
    if (!text && !media) throw new AppError(400, "invalid_text", "Send text or media", "text");

    const svc = serviceClient();
    const { data: mfr } = await svc.from("manufacturers").select("id, whatsapp_phone_number_id, whatsapp_display_number").eq("id", mid).maybeSingle();
    if (!mfr) throw new AppError(404, "not_found", "Manufacturer not found", "manufacturer_id");
    if (!mfr.whatsapp_phone_number_id) throw new AppError(400, "no_business_number", "This manufacturer has no WhatsApp phone_number_id", "manufacturer_id");

    const providerMessageId = `wamid.SIM-${crypto.randomUUID()}`;
    const preuploaded: Record<string, PreuploadedMedia> = {};
    let mediaRef: { type: "document" | "image"; id: string; mime: string; filename: string | null } | null = null;
    if (media) {
      const type = media.type === "image" ? "image" : media.type === "document" ? "document" : null;
      if (!type) throw new AppError(400, "invalid_media_type", "media.type must be document or image", "media.type");
      if (!media.base64) throw new AppError(400, "invalid_media", "media.base64 is required", "media.base64");
      const bytes = fromBase64(media.base64);
      if (bytes.length > MAX_MEDIA_BYTES) throw new AppError(413, "media_too_large", "Media must be under 10 MB", "media.base64");
      const mime = media.mime || (type === "image" ? "image/jpeg" : "application/pdf");
      const filename = media.filename ? String(media.filename).slice(0, 120) : null;
      const key = mediaKey(mid, providerMessageId, extensionFor(mime, filename));
      const up = await svc.storage.from("whatsapp-media").upload(key, bytes, { contentType: mime, upsert: true });
      if (up.error) throw new AppError(500, "media_upload_failed", up.error.message);
      const mediaId = `sim-media-${crypto.randomUUID()}`;
      preuploaded[mediaId] = { path: `whatsapp-media/${key}`, mime, filename };
      mediaRef = { type, id: mediaId, mime, filename };
    }

    const payload = buildMetaInboundPayload({
      phoneNumberId: mfr.whatsapp_phone_number_id,
      displayNumber: mfr.whatsapp_display_number,
      from,
      profileName: typeof body.profile_name === "string" ? body.profile_name.slice(0, 120) : null,
      providerMessageId,
      text,
      media: mediaRef,
    });
    const result = await processWebhookPayload(svc, getAdapter("whatsapp"), payload, log.child({ simulated: true, by: caller.userId }), preuploaded);
    return json({ ok: result.messages.every((m) => m.ok), provider_message_id: providerMessageId, results: result.messages });
  } catch (e) {
    return errorResponse(e);
  }
});
