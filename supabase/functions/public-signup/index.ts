// public-signup (public, verify_jwt = false): the landing page's only write
// path. Rate limited per IP, honeypot protected, service role inside; every
// rule is repeated in SQL.
//
// POST { action: "stats" }                                  -> { waitlist_count, plans }
// POST { action: "join_waitlist", email, name?, company? }  -> { joined, position, waitlist_count }
// POST { action: "submit_application", plan_code, billing_cycle, company_name, legal_name?, gstin?, state, city?,
//        address?, company_phone?, company_email?, whatsapp_display_number?, owner_name, owner_email, owner_phone,
//        accept_terms: true }
//   -> { ok, status_token, plan_name, billing_cycle, amount_paise, waitlist_position, waitlist_count, payment }
// POST { action: "status", token }                          -> application status for the public status page

import { config } from "../_shared/env.ts";
import { AppError, errorResponse, json, preflight, readJson, requireString } from "../_shared/http.ts";
import { errorMessage, logger } from "../_shared/log.ts";
import { getPaymentProvider } from "../_shared/payments/mod.ts";
import { clientIp, honeypotTripped, newStatusToken, RateLimiter, sha256Hex, validateApplication } from "../_shared/signup.ts";
import { rpc, serviceClient } from "../_shared/supabase.ts";

const log = logger({ fn: "public-signup" });
const waitlistLimiter = new RateLimiter(10, 10 * 60_000);
const applicationLimiter = new RateLimiter(5, 60 * 60_000);

type SubmitResult = {
  application_id: string;
  plan_name: string;
  billing_cycle: string;
  amount_paise: number;
  waitlist_position: number;
  waitlist_count: number;
  updated: boolean;
};

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

async function sendReceivedEmail(to: string, name: string, statusUrl: string, r: SubmitResult) {
  const key = config.resendKey();
  if (!key) return false;
  const safeName = name ? name.replace(/[&<>"']/g, "") : "Manufacturer";
  const safeStatusUrl = statusUrl.replace(/[&<>"']/g, "");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Application Received &mdash; Distrik</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
  <div style="display: none; max-height: 0px; overflow: hidden;">
    We have received your application for the ${r.plan_name} plan. You are #${r.waitlist_position} on the waitlist.
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 36px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);">
          
          <!-- Top Accent Banner -->
          <tr>
            <td style="height: 6px; background: linear-gradient(90deg, #0d9488 0%, #14b8a6 50%, #06b6d4 100%);"></td>
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
                    <span style="display: inline-block; background-color: #ccfbf1; color: #0f766e; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 4px 10px; border-radius: 9999px;">
                      Waitlist #${r.waitlist_position}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 32px 28px;">
              <p style="margin: 0 0 12px; font-size: 15px; color: #64748b;">
                Namaste <strong>${safeName}</strong>,
              </p>

              <h2 style="margin: 0 0 14px; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                We have received your application
              </h2>

              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #475569;">
                Thank you for applying to Distrik! We are onboarding manufacturers in carefully paced batches to ensure dedicated support and seamless setup.
              </p>

              <!-- Order Summary Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 20px 0 24px; padding: 18px 20px;">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">
                      Selected Plan
                    </div>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="font-size: 18px; font-weight: 700; color: #0f172a;">
                          ${r.plan_name} Plan
                        </td>
                        <td align="right" style="font-size: 18px; font-weight: 700; color: #0f766e;">
                          ${rupees(r.amount_paise)} <span style="font-size: 12px; font-weight: normal; color: #64748b;">+ GST</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; color: #64748b; padding-top: 4px;">
                          Billing: <span style="text-transform: capitalize; color: #334155; font-weight: 500;">${r.billing_cycle}</span>
                        </td>
                        <td align="right" style="font-size: 13px; color: #64748b; padding-top: 4px;">
                          Waitlist rank: <strong style="color: #0f172a;">#${r.waitlist_position}</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569;">
                Online payment is being enabled soon. You do not need to make any payment right now. As soon as your workspace is ready, we will email you an instant sign-in link to open your dashboard.
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 28px 0 16px;">
                <a href="${safeStatusUrl}"
                   style="display: inline-block; background-color: #0f766e; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 28px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(15, 118, 110, 0.25);">
                  Check Application Status &rarr;
                </a>
              </div>

              <p style="margin: 20px 0 0; font-size: 12px; color: #94a3b8; text-align: center;">
                Save this link to track your status anytime: <br>
                <a href="${safeStatusUrl}" style="color: #0f766e; word-break: break-all;">${safeStatusUrl}</a>
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
                Have questions? Reply to this email or visit our <a href="https://distrik.in" style="color: #64748b;">help center</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `application-${r.application_id}-${r.updated ? Date.now() : "new"}` },
    body: JSON.stringify({ from: config.emailFrom(), to: [to], subject: "We have received your Distrik application", html }),
  });
  if (!res.ok) log.warn("received_email_failed", { status: res.status });
  return res.ok;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw new AppError(405, "method_not_allowed", "POST only");
    const body = await readJson<Record<string, unknown>>(req);
    const svc = serviceClient();
    const ip = clientIp(req);

    switch (body.action) {
      case "stats":
        return json(await rpc(svc, "public_stats"));

      case "join_waitlist": {
        if (honeypotTripped(body)) throw new AppError(400, "invalid_request", "Please try again");
        if (!waitlistLimiter.allow(ip)) throw new AppError(429, "too_many_requests", "Too many requests. Try again in a few minutes.");
        const email = requireString(body.email, "email", { max: 254 });
        const result = await rpc(svc, "join_waitlist", {
          p_email: email,
          p_name: typeof body.name === "string" ? body.name : null,
          p_company: typeof body.company === "string" ? body.company : null,
          p_phone: null,
          p_source: "landing",
          p_application: null,
        });
        return json(result);
      }

      case "submit_application": {
        if (honeypotTripped(body)) throw new AppError(400, "invalid_request", "Please try again");
        if (!applicationLimiter.allow(ip)) throw new AppError(429, "too_many_requests", "Too many applications. Try again later.");
        const input = validateApplication(body);
        const token = newStatusToken();
        const result = await rpc<SubmitResult>(svc, "submit_tenant_application", {
          p: input,
          p_status_token_hash: await sha256Hex(token),
          p_ip_hash: await sha256Hex(`${config.workerSecret() ?? "distrik"}:${ip}`),
          p_user_agent: req.headers.get("user-agent"),
        });
        const payment = await getPaymentProvider().createCheckout({
          applicationId: result.application_id,
          amountPaise: result.amount_paise,
          currency: "INR",
          description: `Distrik ${result.plan_name} (${result.billing_cycle})`,
          customer: { name: input.owner_name, email: input.owner_email, phone: input.owner_phone },
        });
        const statusUrl = `${config.appUrl()}/signup/status/${token}`;
        const emailed = await sendReceivedEmail(input.owner_email, input.owner_name, statusUrl, result).catch((e) => {
          log.warn("received_email_error", { error: errorMessage(e) });
          return false;
        });
        log.info("application_submitted", { application_id: result.application_id, plan: input.plan_code, updated: result.updated, emailed });
        return json({
          ok: true,
          status_token: token,
          plan_name: result.plan_name,
          billing_cycle: result.billing_cycle,
          amount_paise: result.amount_paise,
          waitlist_position: result.waitlist_position,
          waitlist_count: result.waitlist_count,
          payment,
        });
      }

      case "status": {
        const token = requireString(body.token, "token", { max: 100 });
        return json(await rpc(svc, "application_status", { p_status_token_hash: await sha256Hex(token) }));
      }

      default:
        throw new AppError(400, "invalid_action", "Unknown action", "action");
    }
  } catch (e) {
    if (!(e instanceof AppError)) log.error("public_signup_failed", { error: errorMessage(e) });
    return errorResponse(e);
  }
});
