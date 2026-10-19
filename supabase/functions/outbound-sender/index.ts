// outbound-sender (PRD 8): claims queued messages, re-checks consent and the
// session window at send time (claim_outbound_message), sends through the
// channel adapter and records the provider message id. Failures retry with
// backoff; the final failure marks the message failed and dead letters the job.

import { getAdapter } from "../_shared/channel/providers.ts";
import { ChannelError, type ChannelName, type OutboundMessage } from "../_shared/channel/types.ts";
import { background, sleep } from "../_shared/http.ts";
import { errorMessage } from "../_shared/log.ts";
import { rpc, splitStoragePath } from "../_shared/supabase.ts";
import { PermanentError, serveWorker } from "../_shared/worker.ts";

const MAX_ATTEMPTS = 5;

interface Claimed {
  message_id: string;
  manufacturer_id: string;
  channel: ChannelName;
  to: string;
  phone_number_id: string | null;
  body: string | null;
  media_path: string | null;
  media_type: "document" | "image" | "audio" | "video" | null;
  media_filename: string | null;
  template: { name: string; language: string; params: unknown } | null;
  attempts: number;
}

serveWorker<{ message_id: string }>({
  name: "outbound-sender",
  queue: "outbound_messages",
  vt: 60,
  batch: 10,
  maxAttempts: MAX_ATTEMPTS,
  budgetMs: 45_000,
  async handle(job, ctx) {
    const { svc } = ctx;
    if (!job?.message_id) throw new PermanentError("job has no message_id");
    const log = ctx.log.child({ message_id: job.message_id });

    const claimed = await rpc<Claimed | null>(svc, "claim_outbound_message", { p_message: job.message_id });
    if (!claimed || !claimed.message_id) {
      log.info("outbound_skipped", { reason: "not_queued_or_blocked" });
      return; // blocked (consent / window), cancelled or already sent: drop the job
    }

    const adapter = getAdapter(claimed.channel);
    try {
      let media: OutboundMessage["media"] = null;
      if (claimed.media_path) {
        const { bucket, key } = splitStoragePath(claimed.media_path);
        const { data, error } = await svc.storage.from(bucket).createSignedUrl(key, 24 * 3600);
        if (error || !data?.signedUrl) {
          if (adapter.provider !== "sandbox") throw new Error(`signed url failed: ${error?.message ?? "missing"}`);
          log.warn("sandbox_media_missing", { bucket });
        }
        media = {
          type: claimed.media_type ?? "document",
          url: data?.signedUrl ?? `sandbox://missing/${claimed.media_path}`,
          filename: claimed.media_filename,
        };
      }
      const params = Array.isArray(claimed.template?.params) ? (claimed.template!.params as unknown[]).map(String) : [];
      const message: OutboundMessage = {
        messageId: claimed.message_id,
        channel: claimed.channel,
        to: claimed.to,
        from: claimed.phone_number_id,
        body: claimed.body,
        template: claimed.template ? { name: claimed.template.name, language: claimed.template.language, params } : null,
        media,
      };
      const sent = await adapter.send(message);
      await rpc(svc, "mark_message_sent", { p_message: claimed.message_id, p_provider_message_id: sent.providerMessageId });
      log.info("outbound_sent", { provider: adapter.provider, template: Boolean(claimed.template), media: Boolean(media) });

      if (sent.simulated) {
        // Sandbox: simulate the provider's delivered and read callbacks a moment later.
        background((async () => {
          await sleep(1500);
          await rpc(svc, "update_message_status", { p_provider_message_id: sent.providerMessageId, p_status: "delivered", p_at: new Date().toISOString() });
          await sleep(1500);
          await rpc(svc, "update_message_status", { p_provider_message_id: sent.providerMessageId, p_status: "read", p_at: new Date().toISOString() });
        })().catch((e) => log.warn("sandbox_status_failed", { error: errorMessage(e) })));
      }
    } catch (e) {
      const permanent = e instanceof ChannelError && !e.retryable;
      const final = permanent || ctx.readCt >= MAX_ATTEMPTS;
      await rpc(svc, "mark_message_failed", { p_message: claimed.message_id, p_error: errorMessage(e), p_final: final });
      if (permanent) throw new PermanentError(errorMessage(e));
      throw e;
    }
  },
});
