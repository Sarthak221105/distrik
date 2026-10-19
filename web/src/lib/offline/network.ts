import { RpcError } from "@/lib/errors";

/** Thrown when a request never reached the server (no signal, DNS, CORS drop). */
export class OfflineError extends Error {
  constructor(message = "No connection") {
    super(message);
    this.name = "OfflineError";
  }
}

type ErrLike = { name?: string; code?: string; message?: string; status?: number };

// supabase-js does not throw on a network failure: it resolves with
// { status: 0, error: { code: "", message: "TypeError: Failed to fetch" } }.
export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof OfflineError) return true;
  const e = err as ErrLike;
  if (e.code === "offline") return true;
  const msg = e.message ?? "";
  const looksLikeFetch = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected/i.test(
    msg,
  );
  if (e.name === "TypeError" && looksLikeFetch) return true;
  if ((e.code === "" || e.code === undefined) && (looksLikeFetch || /^(TypeError|FetchError):/.test(msg))) return true;
  if (err instanceof RpcError && (err.code === "" || err.code === "unknown") && looksLikeFetch) return true;
  return false;
}

/** Session expired while offline: refresh and retry rather than fail the write. */
export function isAuthExpired(err: unknown): boolean {
  const e = err as ErrLike;
  return e?.code === "PGRST301" || e?.code === "PGRST302" || /jwt expired|invalid jwt/i.test(e?.message ?? "");
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
