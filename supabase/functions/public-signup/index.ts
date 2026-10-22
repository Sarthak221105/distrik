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
  const html = `<p>Namaste ${name},</p>
<p>Thank you for choosing Distrik. We have received your application for the <strong>${r.plan_name}</strong> plan
(${r.billing_cycle}, ${rupees(r.amount_paise)} + GST).</p>
<p>Online payment is coming soon. You are <strong>#${r.waitlist_position}</strong> on the waitlist, and we will email you
a sign in link as soon as your workspace is ready.</p>
<p><a href="${statusUrl}">Check your application status</a></p>
<p>Team Distrik</p>`;
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
