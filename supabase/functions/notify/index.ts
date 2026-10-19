// notify (PRD 11): delivers a notification row by web push (VAPID) and email
// (Resend). Each channel is skipped silently when not configured; sent
// channels are stamped (pushed_at / emailed_at) so retries never resend.

import webpush from "npm:web-push@3.6.7";
import { config } from "../_shared/env.ts";
import { errorMessage } from "../_shared/log.ts";
import { PermanentError, serveWorker } from "../_shared/worker.ts";

let vapidReady = false;
function setupVapid(): boolean {
  if (!config.vapidPublic() || !config.vapidPrivate()) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(config.vapidSubject(), config.vapidPublic(), config.vapidPrivate());
    vapidReady = true;
  }
  return true;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

serveWorker<{ notification_id: string }>({
  name: "notify",
  queue: "notifications",
  vt: 60,
  batch: 10,
  async handle(job, { svc, log: base }) {
    if (!job?.notification_id) throw new PermanentError("job has no notification_id");
    const log = base.child({ notification_id: job.notification_id });
    const { data: n, error } = await svc.from("notifications").select("*").eq("id", job.notification_id).maybeSingle();
    if (error) throw error;
    if (!n) return;
    const channels: string[] = n.channels ?? [];
    const link = n.link ? (n.link.startsWith("http") ? n.link : config.appUrl() + n.link) : config.appUrl();
    const update: Record<string, string> = {};

    if (channels.includes("push") && !n.pushed_at) {
      if (setupVapid()) {
        const { data: subs } = await svc.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", n.user_id);
        let delivered = 0;
        for (const s of subs ?? []) {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ title: n.title, body: n.body ?? "", url: link, kind: n.kind, id: n.id }),
              { TTL: 3600, urgency: n.kind?.startsWith("approval") ? "high" : "normal" },
            );
            delivered++;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await svc.from("push_subscriptions").delete().eq("id", s.id);
              log.info("push_subscription_removed", { status });
            } else {
              log.warn("push_failed", { status, error: errorMessage(e) });
            }
          }
        }
        await svc.from("notifications").update({ pushed_at: new Date().toISOString() }).eq("id", n.id);
        log.info("push_done", { subscriptions: subs?.length ?? 0, delivered });
      }
    }

    if (channels.includes("email") && !n.emailed_at && config.resendKey()) {
      const { data: profile } = await svc.from("profiles").select("email, full_name").eq("user_id", n.user_id).maybeSingle();
      let email = (profile as { email?: string } | null)?.email ?? null;
      if (!email) {
        const { data: u } = await svc.auth.admin.getUserById(n.user_id);
        email = u?.user?.email ?? null;
      }
      if (email) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${config.resendKey()}`, "Content-Type": "application/json", "Idempotency-Key": `notification-${n.id}` },
          body: JSON.stringify({
            from: config.emailFrom(),
            to: [email],
            subject: n.title,
            text: `${n.body ?? ""}\n\nOpen: ${link}`,
            html: `<p>${escapeHtml(n.body ?? "")}</p><p><a href="${escapeHtml(link)}">Open in AI Sales OS</a></p>`,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          if (res.status === 429 || res.status >= 500) throw new Error(`resend ${res.status}: ${body.slice(0, 200)}`);
          log.warn("email_rejected", { status: res.status });
        }
        update.emailed_at = new Date().toISOString();
        log.info("email_done", { ok: res.ok });
      }
    }

    if (Object.keys(update).length) await svc.from("notifications").update(update).eq("id", n.id);
  },
});
