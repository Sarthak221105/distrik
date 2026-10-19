import { createClient, type SupabaseClient } from "./deps.ts";
import { anonKey, serviceKey, supabaseUrl } from "./env.ts";
import { AppError, fromPg } from "./http.ts";

let svc: SupabaseClient | null = null;

/** Service role client (bypasses RLS). Lives only inside Edge Functions. */
export function serviceClient(): SupabaseClient {
  if (!svc) {
    svc = createClient(supabaseUrl(), serviceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-client-info": "distrik-edge" } },
    });
  }
  return svc;
}

/** Client acting as the signed in user, so RLS and RPC role checks apply. */
export function userClient(token: string): SupabaseClient {
  return createClient(supabaseUrl(), anonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}`, "x-client-info": "distrik-edge-user" } },
  });
}

/** Calls an RPC and throws an AppError (with the SQL code) on failure. */
export async function rpc<T = unknown>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw fromPg(error);
  return data as T;
}

/** First row of an RPC that returns a table (or null). */
export async function rpcRow<T = Record<string, unknown>>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T | null> {
  const data = await rpc<T[] | T | null>(client, fn, args);
  if (Array.isArray(data)) return (data[0] ?? null) as T | null;
  return (data ?? null) as T | null;
}

export function must<T>(res: { data: T | null; error: unknown }, what: string): T {
  if (res.error) throw fromPg(res.error);
  if (res.data === null || res.data === undefined) throw new AppError(404, "not_found", `${what} not found`);
  return res.data;
}

/** Splits "<bucket>/<key...>" into its parts. */
export function splitStoragePath(path: string): { bucket: string; key: string } {
  const clean = path.replace(/^\/+/, "");
  const i = clean.indexOf("/");
  if (i <= 0) throw new AppError(400, "invalid_path", `Storage path must be <bucket>/<key>: ${path}`);
  return { bucket: clean.slice(0, i), key: clean.slice(i + 1) };
}

export async function downloadBytes(client: SupabaseClient, bucket: string, key: string): Promise<Uint8Array> {
  const { data, error } = await client.storage.from(bucket).download(key);
  if (error || !data) throw new AppError(404, "file_not_found", `Could not download ${bucket}/${key}: ${error?.message ?? "missing"}`);
  return new Uint8Array(await data.arrayBuffer());
}
