// erase-contact (authenticated, company owner only; DPDP erasure): runs
// erase_contact as the calling user (the SQL checks the owner role and tenant
// and writes the audit row), then
// deletes the contact's media files from storage with the service client.
//
// POST { contact_id: uuid, reason: string }
// 200  { ok, messages_erased, media_deleted, media_failed: string[], media_retained: number }

import { requireCaller, requireRole } from "../_shared/auth.ts";
import { AppError, errorResponse, json, preflight, readJson, requireString, requireUuid } from "../_shared/http.ts";
import { logger } from "../_shared/log.ts";
import { rpc, serviceClient, splitStoragePath, userClient } from "../_shared/supabase.ts";

const log = logger({ fn: "erase-contact" });

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw new AppError(405, "method_not_allowed", "POST only");
    const caller = await requireCaller(req);
    requireRole(caller, ["owner"]);
    const body = await readJson<{ contact_id?: unknown; reason?: unknown }>(req);
    const contactId = requireUuid(body.contact_id, "contact_id");
    const reason = requireString(body.reason, "reason", { min: 5, max: 500 });

    const result = await rpc<{ ok: boolean; messages_erased: number; media_paths: string[] }>(
      userClient(caller.token),
      "erase_contact",
      { p_contact: contactId, p_reason: reason },
    );

    // Only the person's own files are erased: media they sent (whatsapp-media).
    // Shared catalogues and quotation PDFs (GST business records) referenced by
    // outbound messages are retained; the message rows no longer point to them.
    const byBucket = new Map<string, string[]>();
    const retained: string[] = [];
    for (const path of result?.media_paths ?? []) {
      try {
        const { bucket, key } = splitStoragePath(path);
        if (bucket !== "whatsapp-media") {
          retained.push(path);
          continue;
        }
        byBucket.set(bucket, [...new Set([...(byBucket.get(bucket) ?? []), key])]);
      } catch { /* malformed path: nothing to delete */ }
    }
    let deleted = 0;
    const failed: string[] = [];
    const svc = serviceClient();
    for (const [bucket, keys] of byBucket) {
      const { data, error } = await svc.storage.from(bucket).remove(keys);
      if (error) failed.push(...keys.map((k) => `${bucket}/${k}`));
      else deleted += data?.length ?? 0;
    }
    log.info("contact_erased", { contact_id: contactId, by: caller.userId, messages: result?.messages_erased ?? 0, media_deleted: deleted, media_failed: failed.length, retained: retained.length });
    return json({ ok: true, messages_erased: result?.messages_erased ?? 0, media_deleted: deleted, media_failed: failed, media_retained: retained.length });
  } catch (e) {
    return errorResponse(e);
  }
});
