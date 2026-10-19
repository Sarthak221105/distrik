// admin-users (authenticated): team invites by an owner, and tenant creation
// by ops. Roles and tenant come from the caller's JWT claims (app_role,
// manufacturer_id) and the active profile, never from the request body.
//
// POST { action: "invite", email, full_name, role: "sales_head" | "rep", approval_limit_paise?, phone? }
//   owner only -> 200 { ok, user_id, email, role, manufacturer_id, invited: true }
// POST { action: "create_tenant", manufacturer: {...}, owner: { email, full_name, phone? } }
//   system_admin only -> 200 { ok, manufacturer_id, owner_user_id, invited: true }

import { type Caller, requireCaller, requireRole } from "../_shared/auth.ts";
import type { SupabaseClient } from "../_shared/deps.ts";
import { config } from "../_shared/env.ts";
import { AppError, errorResponse, json, preflight, readJson, requireString } from "../_shared/http.ts";
import { errorMessage, logger } from "../_shared/log.ts";
import { serviceClient } from "../_shared/supabase.ts";

const log = logger({ fn: "admin-users" });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{13}$/;

function requireEmail(v: unknown, field = "email"): string {
  const s = requireString(v, field, { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(s)) throw new AppError(400, "invalid_" + field, "Enter a valid email address", field);
  return s;
}

function optionalPhone(v: unknown, field = "phone"): string | null {
  if (v === null || v === undefined || v === "") return null;
  const digits = String(v).replace(/[^0-9]/g, "");
  const d = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  if (d.length !== 10) throw new AppError(400, "invalid_" + field, "Enter a 10 digit Indian mobile number", field);
  return "+91" + d;
}

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

/** Rolls back an auth user only when this request created it (never an existing account). */
async function rollbackUser(svc: SupabaseClient, userId: string, startedAt: number) {
  const { data } = await svc.auth.admin.getUserById(userId);
  const created = data?.user?.created_at ? Date.parse(data.user.created_at) : 0;
  if (created >= startedAt - 1_000) await svc.auth.admin.deleteUser(userId).catch(() => {});
}

async function inviteUser(svc: SupabaseClient, email: string, fullName: string): Promise<string> {
  const { data: existing } = await svc.from("profiles").select("user_id").ilike("email", email).limit(1);
  if (existing?.length) throw new AppError(409, "user_exists", "A user with this email already exists", "email");
  const { data, error } = await svc.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${config.appUrl()}/login`,
  });
  if (error || !data?.user) {
    const msg = error?.message ?? "invite failed";
    if (/already|registered|exists/i.test(msg)) throw new AppError(409, "user_exists", "A user with this email already exists", "email");
    throw new AppError(502, "invite_failed", msg);
  }
  return data.user.id;
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

async function createTenant(svc: SupabaseClient, caller: Caller, body: Record<string, unknown>) {
  requireRole(caller, ["system_admin"]);
  await activeProfile(svc, caller);
  const m = (body.manufacturer ?? {}) as Record<string, unknown>;
  const o = (body.owner ?? {}) as Record<string, unknown>;
  const name = requireString(m.name, "manufacturer.name", { max: 160 });
  const state = requireString(m.state, "manufacturer.state", { max: 80 });
  const gstin = m.gstin ? String(m.gstin).trim().toUpperCase() : null;
  if (gstin && !GSTIN_RE.test(gstin)) throw new AppError(400, "invalid_gstin", "GSTIN must be 15 characters", "manufacturer.gstin");
  const prefix = m.quote_prefix ? String(m.quote_prefix).trim().toUpperCase().slice(0, 6) : undefined;
  if (prefix && !/^[A-Z0-9]{1,6}$/.test(prefix)) throw new AppError(400, "invalid_quote_prefix", "Use up to 6 letters or digits", "manufacturer.quote_prefix");
  const ownerEmail = requireEmail(o.email, "owner.email");
  const ownerName = requireString(o.full_name, "owner.full_name", { max: 120 });
  const ownerPhone = optionalPhone(o.phone, "owner.phone");

  const { data: mfr, error: mErr } = await svc.from("manufacturers").insert({
    name,
    legal_name: m.legal_name ? String(m.legal_name).slice(0, 200) : null,
    gstin,
    state,
    city: m.city ? String(m.city).slice(0, 80) : null,
    address: m.address ? String(m.address).slice(0, 400) : null,
    phone: optionalPhone(m.phone, "manufacturer.phone"),
    email: m.email ? requireEmail(m.email, "manufacturer.email") : null,
    whatsapp_phone_number_id: m.whatsapp_phone_number_id ? String(m.whatsapp_phone_number_id).trim() : null,
    whatsapp_display_number: m.whatsapp_display_number ? String(m.whatsapp_display_number).trim() : null,
    ...(prefix ? { quote_prefix: prefix } : {}),
  }).select("id").single();
  if (mErr || !mfr) {
    if (mErr?.code === "23505") throw new AppError(409, "duplicate", "A manufacturer with this WhatsApp number id already exists", "manufacturer.whatsapp_phone_number_id");
    throw new AppError(400, "manufacturer_failed", mErr?.message ?? "Could not create manufacturer");
  }
  let userId: string | null = null;
  const startedAt = Date.now();
  try {
    userId = await inviteUser(svc, ownerEmail, ownerName);
    const { error: pErr } = await svc.from("profiles").insert({
      user_id: userId,
      manufacturer_id: mfr.id,
      role: "owner",
      full_name: ownerName,
      phone: ownerPhone,
      email: ownerEmail,
      approval_limit_paise: null,
    });
    if (pErr) throw new AppError(500, "profile_failed", pErr.message);
  } catch (e) {
    if (userId) await rollbackUser(svc, userId, startedAt);
    await svc.from("manufacturers").delete().eq("id", mfr.id);
    throw e;
  }
  await audit(svc, caller, mfr.id, "create_tenant", "manufacturer", mfr.id, { name, state });
  await audit(svc, caller, mfr.id, "invite_user", "profile", userId!, { role: "owner" });
  log.info("tenant_created", { by: caller.userId, manufacturer_id: mfr.id, owner_user_id: userId });
  return { ok: true, manufacturer_id: mfr.id, owner_user_id: userId, invited: true };
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
      case "create_tenant":
        return json(await createTenant(svc, caller, body));
      default:
        throw new AppError(400, "invalid_action", "action must be invite or create_tenant", "action");
    }
  } catch (e) {
    if (!(e instanceof AppError)) log.error("admin_users_failed", { error: errorMessage(e) });
    return errorResponse(e);
  }
});
