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

function getKindMeta(kind: string | null | undefined): { label: string; color: string; bg: string; buttonText: string } {
  switch (kind) {
    case "approval_needed":
      return { label: "Action Required", color: "#b91c1c", bg: "#fef2f2", buttonText: "Review & Approve →" };
    case "lead_assigned":
      return { label: "New Lead", color: "#0f766e", bg: "#f0fdfa", buttonText: "Open Lead Details →" };
    case "po_verified":
    case "po_discrepancy":
      return { label: "Purchase Order", color: "#1d4ed8", bg: "#eff6ff", buttonText: "View Purchase Order →" };
    case "reorder_ready":
      return { label: "Reorder Alert", color: "#6d28d9", bg: "#f5f3ff", buttonText: "Review Reorder →" };
    case "tenant_application":
      return { label: "New Application", color: "#b45309", bg: "#fffbeb", buttonText: "Review Application →" };
    default:
      return { label: "Distrik Alert", color: "#0f766e", bg: "#f0fdfa", buttonText: "Open in Distrik →" };
  }
}

function renderNotificationEmail(opts: {
  title: string;
  body: string;
  link: string;
  kind?: string | null;
  recipientName?: string | null;
}): string {
  const meta = getKindMeta(opts.kind);
  const title = escapeHtml(opts.title);
  const body = escapeHtml(opts.body || "");
  const link = escapeHtml(opts.link);
  const greeting = opts.recipientName ? `Namaste ${escapeHtml(opts.recipientName)},` : "Namaste,";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
  <div style="display: none; max-height: 0px; overflow: hidden;">
    ${title} &mdash; ${body}
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 36px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);">
          
          <!-- Top Accent Stripe -->
          <tr>
            <td style="height: 6px; background-color: ${meta.color};"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px 18px; border-bottom: 1px solid #f1f5f9;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background-color: #0f766e; color: #ffffff; width: 32px; height: 32px; border-radius: 8px; text-align: center; font-weight: 800; font-size: 18px; line-height: 32px;">
                          D
                        </td>
                        <td style="padding-left: 10px;">
                          <span style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">Distrik</span>
                          <span style="font-size: 11px; font-weight: 500; color: #64748b; margin-left: 8px; text-transform: uppercase;">Sales OS</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background-color: ${meta.bg}; color: ${meta.color}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 4px 10px; border-radius: 9999px;">
                      ${meta.label}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 32px 28px;">
              <p style="margin: 0 0 12px; font-size: 14px; font-weight: 500; color: #64748b;">
                ${greeting}
              </p>

              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.4;">
                ${title}
              </h2>

              <div style="background-color: #f8fafc; border-left: 4px solid ${meta.color}; border-radius: 4px 8px 8px 4px; padding: 16px 18px; margin: 18px 0 24px;">
                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #334155;">
                  ${body}
                </p>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 32px 0 16px;">
                <a href="${link}"
                   style="display: inline-block; background-color: #0f766e; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 28px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(15, 118, 110, 0.25);">
                  ${meta.buttonText}
                </a>
              </div>

              <p style="margin: 24px 0 0; font-size: 12px; color: #94a3b8; text-align: center;">
                Or paste this link into your browser: <a href="${link}" style="color: #0f766e; word-break: break-all;">${link}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
              <p style="margin: 0 0 4px; font-size: 12px; color: #64748b;">
                Distrik &middot; AI Sales OS for Indian Manufacturers &middot; <a href="https://distrik.in" style="color: #0f766e; text-decoration: none;">distrik.in</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                You received this notification because your account has notifications enabled.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
      let name = (profile as { full_name?: string } | null)?.full_name ?? null;
      if (!email) {
        const { data: u } = await svc.auth.admin.getUserById(n.user_id);
        email = u?.user?.email ?? null;
        name = (u?.user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? name;
      }
      if (email) {
        const html = renderNotificationEmail({
          title: n.title,
          body: n.body ?? "",
          link,
          kind: n.kind,
          recipientName: name,
        });

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${config.resendKey()}`, "Content-Type": "application/json", "Idempotency-Key": `notification-${n.id}` },
          body: JSON.stringify({
            from: config.emailFrom(),
            to: [email],
            subject: n.title,
            text: `${n.title}\n\n${n.body ?? ""}\n\nOpen: ${link}`,
            html,
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
