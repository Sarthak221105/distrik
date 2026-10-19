"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { RpcError, toAppError } from "@/lib/errors";
import type { Json } from "@/lib/database.types";
import { getOfflineDb } from "@/lib/offline/db";
import { OfflineError, isAuthExpired, isNetworkError, isOnline } from "@/lib/offline/network";
import type { MutationInput, QueuedMutation } from "@/lib/offline/types";

type Executable = Pick<QueuedMutation, "prospectId" | "clientTs" | "idempotencyKey"> & MutationInput;

async function callRpc(m: Executable) {
  const supabase = getSupabaseBrowser();
  switch (m.kind) {
    case "call_log":
      return supabase.rpc("log_prospect_event", {
        p_prospect: m.prospectId,
        p_kind: "call_log",
        p_body: m.payload.notes,
        p_data: { outcome: m.payload.outcome, next_followup: m.payload.nextFollowup } as Json,
        p_client_ts: m.clientTs,
        p_idempotency_key: m.idempotencyKey,
      });
    case "note":
      return supabase.rpc("log_prospect_event", {
        p_prospect: m.prospectId,
        p_kind: "note",
        p_body: m.payload.body,
        p_data: {} as Json,
        p_client_ts: m.clientTs,
        p_idempotency_key: m.idempotencyKey,
      });
    case "stage":
      return supabase.rpc("set_stage", {
        p_prospect: m.prospectId,
        p_to: m.payload.to,
        p_note: m.payload.note ?? undefined,
        p_client_ts: m.clientTs,
        p_idempotency_key: m.idempotencyKey,
      });
  }
}

/**
 * Runs one write against its RPC. The RPCs store the idempotency key with
 * their result, so replaying a write that already landed returns the stored
 * result instead of writing twice. Throws OfflineError when the request did
 * not reach the server and RpcError when the server refused it.
 */
export async function executeMutation(m: Executable): Promise<Json> {
  let res = await callRpc(m);
  if (res.error && isAuthExpired(res.error)) {
    const refreshed = await getSupabaseBrowser().auth.refreshSession();
    if (refreshed.error) throw new OfflineError("Session needs a refresh");
    res = await callRpc(m);
  }
  if (res.error) {
    if (isNetworkError(res.error) || res.status === 0) throw new OfflineError();
    throw new RpcError(toAppError(res.error));
  }
  return res.data as Json;
}

export async function enqueueMutation(m: QueuedMutation): Promise<void> {
  const db = getOfflineDb();
  if (!db) throw new RpcError({ code: "offline", message: "No connection, and this browser cannot store offline changes" });
  await db.mutations.put(m);
}

export type SubmitResult = { queued: boolean; mutation: QueuedMutation; result?: Json };

/**
 * Call log, note and stage forms submit through here: online, the RPC runs
 * now; offline (or when the request fails on the network), the write is
 * queued with a client timestamp and synced when the connection returns.
 */
export async function submitOrQueue(input: MutationInput & { userId: string; prospectId: string; prospectName?: string | null }) {
  const mutation = {
    id: crypto.randomUUID(),
    userId: input.userId,
    prospectId: input.prospectId,
    prospectName: input.prospectName ?? null,
    clientTs: new Date().toISOString(),
    idempotencyKey: crypto.randomUUID(),
    status: "pending",
    error: null,
    attempts: 0,
    createdAt: Date.now(),
    syncedAt: null,
    kind: input.kind,
    payload: input.payload,
  } as QueuedMutation;

  if (!isOnline()) {
    await enqueueMutation(mutation);
    return { queued: true, mutation } satisfies SubmitResult;
  }
  try {
    const result = await executeMutation(mutation);
    return { queued: false, mutation, result } satisfies SubmitResult;
  } catch (e) {
    if (e instanceof OfflineError) {
      await enqueueMutation({ ...mutation, attempts: 1 });
      return { queued: true, mutation } satisfies SubmitResult;
    }
    throw e;
  }
}
