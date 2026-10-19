// Queue worker plumbing. pg_cron wakes a worker through pg_net with the
// x-worker-secret header; the worker claims a small batch with a visibility
// timeout, does one bounded unit of work per message, deletes on success and
// retries (exponential backoff, dead letter past the limit) on failure.

import type { SupabaseClient } from "./deps.ts";
import { config } from "./env.ts";
import { AppError, errorResponse, json, timingSafeEqual } from "./http.ts";
import { errorMessage, type Logger, logger } from "./log.ts";
import { rpc, serviceClient } from "./supabase.ts";

export interface QueueMessage<T = Record<string, unknown>> {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  message: T;
}

export interface JobContext {
  svc: SupabaseClient;
  log: Logger;
  readCt: number;
  msgId: number;
  /** Seconds left in this invocation's budget. */
  remainingMs(): number;
}

/** Throw this to stop retrying a job (it is deleted and recorded as failed by the handler). */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

export function checkWorkerSecret(req: Request): void {
  const expected = config.workerSecret();
  const got = req.headers.get("x-worker-secret") ?? "";
  if (!expected || !timingSafeEqual(got, expected)) {
    throw new AppError(401, "unauthorized", "Missing or invalid worker secret");
  }
}

export interface WorkerOptions<T> {
  name: string;
  queue: string;
  vt: number;
  batch: number;
  maxAttempts?: number;
  /** Wall clock budget for starting new jobs, in ms. */
  budgetMs?: number;
  handle: (msg: T, ctx: JobContext) => Promise<unknown>;
}

export function serveWorker<T = Record<string, unknown>>(opts: WorkerOptions<T>) {
  Deno.serve(async (req) => {
    if (req.method !== "POST") return json({ code: "method_not_allowed", message: "POST only", field: null }, 405);
    try {
      checkWorkerSecret(req);
    } catch (e) {
      return errorResponse(e);
    }
    const result = await runQueue(opts);
    return json(result);
  });
}

export async function runQueue<T>(opts: WorkerOptions<T>) {
  const started = Date.now();
  const budget = opts.budgetMs ?? 100_000;
  const svc = serviceClient();
  const base = logger({ fn: opts.name, queue: opts.queue });
  const maxAttempts = opts.maxAttempts ?? 5;
  let processed = 0, failed = 0, deleted = 0;

  let batch: QueueMessage<T>[] = [];
  try {
    batch = (await rpc<QueueMessage<T>[]>(svc, "queue_read", {
      p_queue: opts.queue,
      p_vt: opts.vt,
      p_qty: opts.batch,
    })) ?? [];
  } catch (e) {
    base.error("queue_read_failed", { error: errorMessage(e) });
    return { ok: false, error: "queue_read_failed" };
  }

  for (const m of batch) {
    if (Date.now() - started > budget) {
      base.warn("budget_exhausted", { remaining_in_batch: batch.length - processed - failed });
      break; // the rest become visible again after the visibility timeout
    }
    const log = base.child({ msg_id: m.msg_id, read_ct: m.read_ct });
    const ctx: JobContext = {
      svc,
      log,
      readCt: m.read_ct,
      msgId: m.msg_id,
      remainingMs: () => budget - (Date.now() - started),
    };
    const t0 = Date.now();
    try {
      await opts.handle(m.message, ctx);
      await rpc(svc, "queue_delete", { p_queue: opts.queue, p_msg_id: m.msg_id });
      deleted++;
      processed++;
      log.info("job_done", { ms: Date.now() - t0 });
    } catch (e) {
      failed++;
      const msg = errorMessage(e);
      if (e instanceof PermanentError) {
        log.error("job_failed_permanently", { error: msg, ms: Date.now() - t0 });
        try {
          await rpc(svc, "queue_delete", { p_queue: opts.queue, p_msg_id: m.msg_id });
        } catch (de) {
          log.error("queue_delete_failed", { error: errorMessage(de) });
        }
        continue;
      }
      log.error("job_failed", { error: msg, ms: Date.now() - t0 });
      try {
        const outcome = await rpc<string>(svc, "queue_retry", {
          p_queue: opts.queue,
          p_msg_id: m.msg_id,
          p_read_ct: m.read_ct,
          p_error: `${opts.name}: ${msg}`.slice(0, 500),
          p_max_attempts: maxAttempts,
        });
        log.warn("job_retry", { outcome });
      } catch (re) {
        log.error("queue_retry_failed", { error: errorMessage(re) });
      }
    }
  }
  return { ok: true, read: batch.length, processed, failed, deleted, ms: Date.now() - started };
}
