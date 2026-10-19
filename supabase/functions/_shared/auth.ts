// Caller identity for authenticated functions. The token is validated with the
// auth server; tenant and role come from the JWT claims the Custom Access Token
// Hook adds (app_role, manufacturer_id). Request bodies are never trusted for
// identity or role.

import { AppError } from "./http.ts";
import { serviceClient } from "./supabase.ts";

export type AppRole = "owner" | "sales_head" | "rep" | "system_admin";

export interface Caller {
  userId: string;
  email: string | null;
  role: AppRole | null;
  manufacturerId: string | null;
  token: string;
}

export function bearerToken(req: Request): string | null {
  const h = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AppError(401, "unauthorized", "Malformed token");
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError(401, "unauthorized", "Malformed token");
  }
}

export async function requireCaller(req: Request): Promise<Caller> {
  const token = bearerToken(req);
  if (!token || token.startsWith("sb_")) throw new AppError(401, "unauthorized", "Sign in required");
  const claims = decodeJwtPayload(token);
  if (claims.role !== "authenticated") throw new AppError(401, "unauthorized", "A signed in user token is required");
  const { data, error } = await serviceClient().auth.getUser(token);
  if (error || !data?.user) throw new AppError(401, "unauthorized", "Invalid or expired session");
  if (data.user.id !== claims.sub) throw new AppError(401, "unauthorized", "Token subject mismatch");
  const role = typeof claims.app_role === "string" ? (claims.app_role as AppRole) : null;
  const mid = typeof claims.manufacturer_id === "string" ? claims.manufacturer_id : null;
  return { userId: data.user.id, email: data.user.email ?? null, role, manufacturerId: mid, token };
}

export function requireRole(caller: Caller, roles: AppRole[]): void {
  if (!caller.role || !roles.includes(caller.role)) {
    throw new AppError(403, "forbidden", `This action needs one of: ${roles.join(", ")}`);
  }
}
