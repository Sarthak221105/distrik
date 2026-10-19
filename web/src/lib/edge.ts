"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { RpcError } from "@/lib/errors";

/**
 * Calls an Edge Function and maps failures to the app's { code, message,
 * field } error shape (functions answer non 2xx with a JSON body).
 */
export async function invokeFn<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseBrowser().functions.invoke(name, { body });
  if (error) {
    let message = error.message || "The function failed";
    let code = "function_error";
    let field: string | undefined;
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try {
        const j = (await ctx.clone().json()) as Record<string, unknown>;
        const inner = (typeof j.error === "object" && j.error ? j.error : j) as Record<string, unknown>;
        if (typeof inner.message === "string") message = inner.message;
        else if (typeof j.error === "string") message = j.error;
        if (typeof inner.code === "string") code = inner.code;
        if (typeof inner.field === "string") field = inner.field;
      } catch {
        try {
          const text = await ctx.clone().text();
          if (text) message = text.slice(0, 300);
        } catch {
          /* keep default */
        }
      }
    } else if (/failed to send|fetch/i.test(message)) {
      code = "offline";
      message = `Could not reach the ${name} function. Is it deployed and running?`;
    }
    throw new RpcError({ code, message, field });
  }
  return data as T;
}

/** Indian numbers to E.164 (mirrors normalize_phone_e164 in SQL for lookups). */
export function toE164(raw: string): string | null {
  const s = raw.trim();
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  if (s.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return null;
}
