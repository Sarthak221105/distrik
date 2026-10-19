// HTTP helpers: one error shape { code, message, field } (PRD 12), CORS for
// the functions the web app calls, and mapping of SQL errors raised through
// public.app_error (message = code, detail = message, hint = field).

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field: string | null = null,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export interface PgLikeError {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
}

/** True when a PostgREST error came from public.app_error with this code. */
export function isAppCode(err: unknown, ...codes: string[]): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as PgLikeError & { code?: string };
  return codes.includes(String(e.message ?? "")) || (err instanceof AppError && codes.includes(err.code));
}

/** Converts a PostgREST/RPC error into an AppError with the SQL code. */
export function fromPg(err: unknown, status = 400): AppError {
  if (err instanceof AppError) return err;
  const e = (err ?? {}) as PgLikeError;
  // app_error raises SQLSTATE P0001 with message = code.
  if (e.code === "P0001" && e.message) {
    const code = e.message;
    const st = code === "forbidden" ? 403 : code === "not_found" ? 404 : status;
    return new AppError(st, code, e.details || code, e.hint || null);
  }
  if (e.code === "42501") return new AppError(403, "forbidden", e.message || "Permission denied");
  return new AppError(500, "database_error", e.message || "Database error");
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...extra },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return json({ code: err.code, message: err.message, field: err.field }, err.status);
  }
  const msg = err instanceof Error ? err.message : String(err);
  return json({ code: "internal_error", message: msg, field: null }, 500);
}

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") throw new Error("not an object");
    return body as T;
  } catch {
    throw new AppError(400, "invalid_json", "Request body must be a JSON object");
  }
}

export function requireString(v: unknown, field: string, opts: { max?: number; min?: number } = {}): string {
  if (typeof v !== "string" || v.trim().length < (opts.min ?? 1)) {
    throw new AppError(400, "invalid_" + field, `${field} is required`, field);
  }
  const s = v.trim();
  if (opts.max && s.length > opts.max) throw new AppError(400, "invalid_" + field, `${field} is too long`, field);
  return s;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
export function requireUuid(v: unknown, field: string): string {
  if (!isUuid(v)) throw new AppError(400, "invalid_" + field, `${field} must be a uuid`, field);
  return v;
}

/** Constant time string comparison (for shared secrets). */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0 && ab.length > 0;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Runs work after the response when the runtime supports it (EdgeRuntime.waitUntil). */
export function background(p: Promise<unknown>): void {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(p.catch(() => {}));
  else p.catch(() => {});
}
