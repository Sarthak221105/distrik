// Claude wrapper. Claude is called only from Edge Functions. Every AI feature
// checks aiEnabled() and has a deterministic fallback when ANTHROPIC_API_KEY is
// empty, so the whole loop runs locally without a key.

import Anthropic from "npm:@anthropic-ai/sdk@0.135.0";
import { config } from "./env.ts";

export { Anthropic };

export function aiEnabled(): boolean {
  return config.anthropicKey().length > 0;
}

export function aiModel(override?: string | null): string {
  return (override && override.trim()) || config.aiModel() || "claude-sonnet-5-5";
}

let client: Anthropic | null = null;
export function claude(): Anthropic {
  if (!aiEnabled()) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!client) client = new Anthropic({ apiKey: config.anthropicKey(), maxRetries: 2, timeout: 90_000 });
  return client;
}

export type Effort = "low" | "medium" | "high";

export interface CreateArgs {
  model?: string | null;
  system?: string;
  messages: Anthropic.MessageParam[];
  tools?: unknown[];
  maxTokens?: number;
  effort?: Effort;
  /** JSON schema for structured output (output_config.format). */
  schema?: Record<string, unknown>;
}

/**
 * One Messages API call. Uses the server side refusal fallback (routes a
 * classifier decline to Anthropic's recommended fallback model) and returns the
 * raw message so callers can run their own tool loop.
 */
export async function createMessage(args: CreateArgs): Promise<Anthropic.Message> {
  const outputConfig: Record<string, unknown> = {};
  if (args.effort) outputConfig.effort = args.effort;
  if (args.schema) outputConfig.format = { type: "json_schema", schema: args.schema };
  const params: Record<string, unknown> = {
    model: aiModel(args.model),
    max_tokens: args.maxTokens ?? 4096,
    messages: args.messages,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
  if (args.system) params.system = args.system;
  if (args.tools?.length) params.tools = args.tools;
  if (Object.keys(outputConfig).length) params.output_config = outputConfig;
  // deno-lint-ignore no-explicit-any
  const res = await (claude().beta.messages as any).create(params);
  return res as Anthropic.Message;
}

export function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Parses a JSON object from a structured output response (tolerates stray prose). */
export function parseJsonText<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as T;
    throw new Error("Model did not return JSON");
  }
}

/**
 * Single structured call: returns the parsed object matching the schema.
 * Throws on refusal or unparsable output so callers fall back deterministically.
 */
export async function structuredCall<T>(args: CreateArgs & { schema: Record<string, unknown> }): Promise<{ data: T; message: Anthropic.Message }> {
  let messages = args.messages;
  let msg = await createMessage({ ...args, messages });
  // Server tools (web search) may pause a long turn; resume a few times.
  for (let i = 0; i < 3 && msg.stop_reason === "pause_turn"; i++) {
    messages = [...messages, { role: "assistant", content: msg.content as Anthropic.ContentBlockParam[] }];
    msg = await createMessage({ ...args, messages });
  }
  if (msg.stop_reason === "refusal") throw new Error("model_refused");
  if (msg.stop_reason === "max_tokens") throw new Error("model_output_truncated");
  return { data: parseJsonText<T>(textOf(msg)), message: msg };
}

export function isRetryableAiError(e: unknown): boolean {
  if (e instanceof Anthropic.RateLimitError) return true;
  if (e instanceof Anthropic.InternalServerError) return true;
  if (e instanceof Anthropic.APIConnectionError) return true;
  if (e instanceof Anthropic.APIError && typeof e.status === "number" && e.status >= 500) return true;
  return false;
}

/** Base64 encode without blowing the stack on large files. */
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** A document or image content block for a file (PDF or image). */
export function fileBlock(bytes: Uint8Array, mime: string): Anthropic.ContentBlockParam {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) {
    const media = (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(m) ? m : "image/jpeg") as
      | "image/jpeg"
      | "image/png"
      | "image/gif"
      | "image/webp";
    return { type: "image", source: { type: "base64", media_type: media, data: toBase64(bytes) } };
  }
  return { type: "document", source: { type: "base64", media_type: "application/pdf", data: toBase64(bytes) } };
}
