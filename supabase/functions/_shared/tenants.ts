// Shared account provisioning for team invites (admin-users) and tenant
// activation (activate-application). The invite email links to
// APP_URL/auth/confirm (see supabase/templates/invite.html), which signs the
// person in and continues to /welcome.

import type { SupabaseClient } from "./deps.ts";
import { config } from "./env.ts";
import { AppError, requireString } from "./http.ts";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{13}$/;

export function requireEmail(v: unknown, field = "email"): string {
  const s = requireString(v, field, { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(s)) throw new AppError(400, "invalid_" + field, "Enter a valid email address", field);
  return s;
}

export function optionalPhone(v: unknown, field = "phone"): string | null {
  if (v === null || v === undefined || v === "") return null;
  const digits = String(v).replace(/[^0-9]/g, "");
  const d = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  if (d.length !== 10) throw new AppError(400, "invalid_" + field, "Enter a 10 digit Indian mobile number", field);
  return "+91" + d;
}

/** Rolls back an auth user only when this request created it (never an existing account). */
export async function rollbackUser(svc: SupabaseClient, userId: string, startedAt: number) {
  const { data } = await svc.auth.admin.getUserById(userId);
  const created = data?.user?.created_at ? Date.parse(data.user.created_at) : 0;
  if (created >= startedAt - 1_000) await svc.auth.admin.deleteUser(userId).catch(() => {});
}

/** Creates the auth user and sends the invite email. Refuses an email that already has an account. */
export async function inviteUser(svc: SupabaseClient, email: string, fullName: string): Promise<string> {
  const { data: existing } = await svc.from("profiles").select("user_id").ilike("email", email).limit(1);
  if (existing?.length) throw new AppError(409, "user_exists", "A user with this email already exists", "email");
  const { data, error } = await svc.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${config.appUrl()}/auth/confirm`,
  });
  if (error || !data?.user) {
    const msg = error?.message ?? "invite failed";
    if (/already|registered|exists/i.test(msg)) throw new AppError(409, "user_exists", "A user with this email already exists", "email");
    throw new AppError(502, "invite_failed", msg);
  }
  return data.user.id;
}
