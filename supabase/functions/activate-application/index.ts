// activate-application (authenticated system admin): the single path that
// turns a paid self-serve application into a live tenant. Today the system
// admin presses Activate (recording a manual payment reference) because online
// payment is a placeholder; a payment gateway webhook will call the same steps.
//
// POST { application_id, payment_ref? }
// 200  { ok, manufacturer_id, owner_user_id, invited: true }
//
// 1. provision_tenant_from_application: payment paid, manufacturer, subscription
// 2. Auth invite to the owner (email with a link to /auth/confirm -> /welcome)
// 3. complete_tenant_activation: owner profile, application active
// Any failure after step 1 undoes it so the admin can simply retry.

import { requireCaller, requireRole } from "../_shared/auth.ts";
import { AppError, errorResponse, json, preflight, readJson, requireUuid } from "../_shared/http.ts";
import { errorMessage, logger } from "../_shared/log.ts";
import { rpc, serviceClient } from "../_shared/supabase.ts";
import { inviteUser, rollbackUser } from "../_shared/tenants.ts";

const log = logger({ fn: "activate-application" });

type Provisioned = { manufacturer_id: string; owner_email: string; owner_name: string; owner_phone: string; company_name: string };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw new AppError(405, "method_not_allowed", "POST only");
    const caller = await requireCaller(req);
    requireRole(caller, ["system_admin"]);
    const svc = serviceClient();
    const { data: profile } = await svc.from("profiles").select("role, active").eq("user_id", caller.userId).maybeSingle();
    if (!profile?.active || profile.role !== "system_admin") throw new AppError(403, "forbidden", "Your session is out of date; sign in again");

    const body = await readJson<{ application_id?: unknown; payment_ref?: unknown }>(req);
    const applicationId = requireUuid(body.application_id, "application_id");
    const paymentRef = typeof body.payment_ref === "string" && body.payment_ref.trim() ? body.payment_ref.trim().slice(0, 120) : "manual";

    const prov = await rpc<Provisioned>(svc, "provision_tenant_from_application", {
      p_application: applicationId,
      p_payment_ref: paymentRef,
      p_provider: "manual",
    });

    const startedAt = Date.now();
    let userId: string | null = null;
    try {
      userId = await inviteUser(svc, prov.owner_email, prov.owner_name);
      await rpc(svc, "complete_tenant_activation", { p_application: applicationId, p_owner_user: userId, p_actor: caller.userId });
    } catch (e) {
      if (userId) await rollbackUser(svc, userId, startedAt);
      await rpc(svc, "undo_tenant_provision", { p_application: applicationId }).catch((u) =>
        log.error("undo_failed", { application_id: applicationId, error: errorMessage(u) })
      );
      throw e;
    }

    log.info("tenant_activated", { by: caller.userId, application_id: applicationId, manufacturer_id: prov.manufacturer_id });
    return json({ ok: true, manufacturer_id: prov.manufacturer_id, owner_user_id: userId, invited: true });
  } catch (e) {
    if (!(e instanceof AppError)) log.error("activation_failed", { error: errorMessage(e) });
    return errorResponse(e);
  }
});
