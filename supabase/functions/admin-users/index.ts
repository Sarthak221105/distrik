// admin-users (authenticated): team invites by an owner. Tenants are no longer
// created here: manufacturers sign up themselves (public-signup) and are
// activated by activate-application. Roles and tenant come from the caller's
// JWT claims (app_role, manufacturer_id) and the active profile, never from the
// request body.
//
// POST { action: "invite", email, full_name, role: "sales_head" | "rep", approval_limit_paise?, phone? }
//   owner only -> 200 { ok, user_id, email, role, manufacturer_id, invited: true }

import { type Caller, requireCaller, requireRole } from "../_shared/auth.ts";
import type { SupabaseClient } from "../_shared/deps.ts";
import { AppError, errorResponse, json, preflight, readJson, requireString } from "../_shared/http.ts";
import { errorMessage, logger } from "../_shared/log.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { inviteUser, optionalPhone, requireEmail, rollbackUser } from "../_shared/tenants.ts";

const log = logger({ fn: "admin-users" });

async function activeProfile(svc: SupabaseClient, caller: Caller) {
  const { data } = await svc.from("profiles").select("role, manufacturer_id, active").eq("user_id", caller.userId).maybeSingle();
  const p = data as { role: string; manufacturer_id: string | null; active: boolean } | null;
  if (!p || !p.active || p.role !== caller.role || (p.manufacturer_id ?? null) !== (caller.manufacturerId ?? null)) {
    throw new AppError(403, "forbidden", "Your session is out of date; sign in again");
  }
  return p;
}

async function audit(svc: SupabaseClient, caller: Caller, mid: string | null, action: string, entity: string, entityId: string, details: Record<string, unknown>) {
  const { error } = await svc.from("audit_log").insert({
    manufacturer_id: mid,
    actor_id: caller.userId,
    actor_role: caller.role,
    action,
    entity,
    entity_id: entityId,
    details,
  });
  if (error) log.error("audit_failed", { action, error: error.message });
}

async function invite(svc: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  requireRole(caller, ["owner"]);
  await activeProfile(svc, caller);
  const mid = caller.manufacturerId;
  if (!mid) throw new AppError(403, "forbidden", "No tenant on your account");
  const email = requireEmail(body.email);
  const fullName = requireString(body.full_name, "full_name", { max: 120 });
  const role = String(body.role ?? "");
  if (!["sales_head", "rep"].includes(role)) throw new AppError(400, "invalid_role", "Role must be sales_head or rep", "role");
  let limit: number | null = 0;
  if (body.approval_limit_paise !== undefined && body.approval_limit_paise !== null && body.approval_limit_paise !== "") {
    const n = Number(body.approval_limit_paise);
    if (!Number.isInteger(n) || n < 0) throw new AppError(400, "invalid_approval_limit_paise", "Approval limit must be a whole number of paise", "approval_limit_paise");
    limit = role === "rep" ? 0 : n;
  }
  const phone = optionalPhone(body.phone);

  const startedAt = Date.now();
  const userId = await inviteUser(svc, email, fullName);
  const { error } = await svc.from("profiles").insert({
    user_id: userId,
    manufacturer_id: mid,
    role,
    full_name: fullName,
    phone,
    email,
    approval_limit_paise: limit,
  });
  if (error) {
    await rollbackUser(svc, userId, startedAt);
    throw new AppError(500, "profile_failed", error.message);
  }
  await audit(svc, caller, mid, "invite_user", "profile", userId, { role, approval_limit_paise: limit });
  log.info("user_invited", { by: caller.userId, user_id: userId, role, manufacturer_id: mid });
  return { ok: true, user_id: userId, email, role, manufacturer_id: mid, approval_limit_paise: limit, invited: true };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw new AppError(405, "method_not_allowed", "POST only");
    const caller = await requireCaller(req);
    const body = await readJson<Record<string, unknown>>(req);
    const svc = serviceClient();
    switch (body.action) {
      case "invite":
        return json(await invite(svc, caller, body));
      default:
        throw new AppError(400, "invalid_action", "action must be invite", "action");
    }
  } catch (e) {
    if (!(e instanceof AppError)) log.error("admin_users_failed", { error: errorMessage(e) });
    return errorResponse(e);
  }
});
