// Inbound processing shared by whatsapp-webhook and simulate-inbound. Stores
// each message once (ingest_inbound_message is idempotent on
// provider_message_id), mirrors media into private storage, and applies
// delivery status callbacks. Heavy work (AI) happens later in ai-reply.

import type { SupabaseClient } from "./deps.ts";
import type { ChannelAdapter, InboundMessage } from "./channel/types.ts";
import { errorMessage, type Logger } from "./log.ts";
import { isAppCode } from "./http.ts";
import { rpc } from "./supabase.ts";

export interface PreuploadedMedia {
  path: string; // "<bucket>/<manufacturer_id>/..."
  mime: string | null;
  filename: string | null;
}

export interface InboundResult {
  provider_message_id: string;
  ok: boolean;
  /** Permanent problems (unknown business number) are not retried by the provider. */
  permanent?: boolean;
  correlation_id?: string;
  result?: Record<string, unknown>;
  error?: string;
}

export interface StatusResult {
  provider_message_id: string;
  status: string;
  applied: boolean;
  error?: string;
}

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/aac": "aac",
  "video/mp4": "mp4",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/csv": "csv",
};

export function extensionFor(mime: string | null | undefined, filename?: string | null): string {
  const fromName = filename?.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  return EXT_BY_MIME[m] ?? "bin";
}

export function safeFileId(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
}

/** whatsapp-media/<mid>/<yyyy-mm>/<provider_message_id>.<ext> */
export function mediaKey(manufacturerId: string, providerMessageId: string, ext: string, at = new Date()): string {
  const ym = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${manufacturerId}/${ym}/${safeFileId(providerMessageId)}.${ext}`;
}

const midCache = new Map<string, { id: string | null; at: number }>();

async function manufacturerFor(svc: SupabaseClient, phoneNumberId: string): Promise<string | null> {
  const hit = midCache.get(phoneNumberId);
  if (hit && Date.now() - hit.at < 60_000) return hit.id;
  const { data, error } = await svc.from("manufacturers").select("id").eq("whatsapp_phone_number_id", phoneNumberId)
    .maybeSingle();
  if (error) throw error;
  const id = (data as { id: string } | null)?.id ?? null;
  midCache.set(phoneNumberId, { id, at: Date.now() });
  return id;
}

async function storeMedia(
  svc: SupabaseClient,
  adapter: ChannelAdapter,
  mid: string,
  msg: InboundMessage,
  log: Logger,
): Promise<{ path: string; mime: string | null } | null> {
  if (!msg.media) return null;
  const downloaded = await adapter.downloadMedia(msg.media.id);
  if (!downloaded) {
    log.warn("media_not_available", { provider: adapter.provider, type: msg.media.type });
    return null;
  }
  const mime = msg.media.mime ?? downloaded.mime ?? "application/octet-stream";
  const key = mediaKey(mid, msg.providerMessageId, extensionFor(mime, msg.media.filename), new Date(msg.sentAt));
  const { error } = await svc.storage.from("whatsapp-media").upload(key, downloaded.bytes, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw new Error(`media upload failed: ${error.message}`);
  return { path: `whatsapp-media/${key}`, mime };
}

export async function processInboundMessage(
  svc: SupabaseClient,
  adapter: ChannelAdapter,
  msg: InboundMessage,
  log: Logger,
  preuploaded: Record<string, PreuploadedMedia> = {},
): Promise<InboundResult> {
  const correlationId = crypto.randomUUID();
  const l = log.child({ correlation_id: correlationId, provider_message_id: msg.providerMessageId, type: msg.type });
  try {
    // Duplicate deliveries are harmless; skip the media download for them.
    const { data: existing } = await svc.from("messages").select("id").eq("provider_message_id", msg.providerMessageId)
      .maybeSingle();
    if (existing) {
      l.info("inbound_duplicate");
      return { provider_message_id: msg.providerMessageId, ok: true, result: { duplicate: true, message_id: (existing as { id: string }).id } };
    }

    const mid = await manufacturerFor(svc, msg.phoneNumberId);
    if (!mid) {
      l.warn("unknown_business_number");
      return { provider_message_id: msg.providerMessageId, ok: false, permanent: true, error: "unknown_business_number" };
    }

    let mediaPath: string | null = null;
    let mediaMime: string | null = msg.media?.mime ?? null;
    let mediaFilename: string | null = msg.media?.filename ?? null;
    if (msg.media) {
      const pre = preuploaded[msg.media.id];
      if (pre) {
        mediaPath = pre.path;
        mediaMime = pre.mime ?? mediaMime;
        mediaFilename = pre.filename ?? mediaFilename;
      } else {
        const stored = await storeMedia(svc, adapter, mid, msg, l);
        mediaPath = stored?.path ?? null;
        mediaMime = stored?.mime ?? mediaMime;
      }
    }

    const result = await rpc<Record<string, unknown>>(svc, "ingest_inbound_message", {
      p_phone_number_id: msg.phoneNumberId,
      p_from: msg.from,
      p_provider_message_id: msg.providerMessageId,
      p_body: msg.body,
      p_sent_at: msg.sentAt,
      p_profile_name: msg.profileName,
      p_media_path: mediaPath,
      p_media_type: mediaPath ? msg.media?.type ?? null : null,
      p_media_mime: mediaPath ? mediaMime : null,
      p_media_filename: mediaPath ? mediaFilename : null,
    });

    const turnId = result?.turn_id as string | null | undefined;
    if (turnId) {
      // Carry the correlation id from webhook to reply.
      const { data: turn } = await svc.from("ai_turns").select("context").eq("id", turnId).maybeSingle();
      const ctx = ((turn as { context?: Record<string, unknown> } | null)?.context) ?? {};
      await svc.from("ai_turns").update({ context: { ...ctx, correlation_id: correlationId } }).eq("id", turnId);
    }
    l.info("inbound_stored", {
      message_id: result?.message_id,
      conversation_id: result?.conversation_id,
      turn_id: turnId ?? null,
      duplicate: result?.duplicate ?? false,
      consent: result?.consent,
      po_id: result?.po_id ?? null,
      has_media: Boolean(mediaPath),
    });
    return { provider_message_id: msg.providerMessageId, ok: true, correlation_id: correlationId, result };
  } catch (e) {
    const permanent = isAppCode(e, "unknown_business_number", "forbidden");
    l.error("inbound_failed", { error: errorMessage(e), permanent });
    return { provider_message_id: msg.providerMessageId, ok: false, permanent, error: errorMessage(e) };
  }
}

export async function processWebhookPayload(
  svc: SupabaseClient,
  adapter: ChannelAdapter,
  payload: unknown,
  log: Logger,
  preuploaded: Record<string, PreuploadedMedia> = {},
): Promise<{ messages: InboundResult[]; statuses: StatusResult[] }> {
  const inbound = adapter.parseInbound(payload);
  const statuses = adapter.parseStatus(payload);
  const messages: InboundResult[] = [];
  for (const m of inbound) messages.push(await processInboundMessage(svc, adapter, m, log, preuploaded));
  const statusResults: StatusResult[] = [];
  for (const s of statuses) {
    try {
      const applied = await rpc<boolean>(svc, "update_message_status", {
        p_provider_message_id: s.providerMessageId,
        p_status: s.status,
        p_at: s.at,
        p_error: s.error,
      });
      statusResults.push({ provider_message_id: s.providerMessageId, status: s.status, applied: Boolean(applied) });
    } catch (e) {
      log.error("status_failed", { provider_message_id: s.providerMessageId, error: errorMessage(e) });
      statusResults.push({ provider_message_id: s.providerMessageId, status: s.status, applied: false, error: errorMessage(e) });
    }
  }
  return { messages, statuses: statusResults };
}
