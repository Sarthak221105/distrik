// One error shape for every RPC: { code, message, field } (PRD 12).
// SQL raises with message = code, detail = human message, hint = field.
export type AppError = { code: string; message: string; field?: string };

type PostgrestLikeError = { code?: string; message?: string; details?: string | null; hint?: string | null };

export function toAppError(err: unknown): AppError {
  if (!err) return { code: "unknown", message: "Something went wrong" };
  if (typeof err === "string") return { code: "unknown", message: err };
  const e = err as PostgrestLikeError & { name?: string };
  if (e.code === "P0001") {
    return { code: e.message ?? "error", message: e.details || humanize(e.message), field: e.hint || undefined };
  }
  if (e.code === "42501") return { code: "forbidden", message: "You do not have access to do that" };
  if (e.name === "TypeError" && /fetch/i.test(e.message ?? "")) {
    return { code: "offline", message: "No connection. Check your network and try again." };
  }
  return { code: e.code ?? "unknown", message: e.message ?? "Something went wrong" };
}

function humanize(code: string | undefined): string {
  if (!code) return "Something went wrong";
  return code.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export class RpcError extends Error {
  code: string;
  field?: string;
  constructor(e: AppError) {
    super(e.message);
    this.code = e.code;
    this.field = e.field;
  }
}

// Throws an RpcError for a Supabase { data, error } result, returns data otherwise.
export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new RpcError(toAppError(result.error));
  return result.data;
}
