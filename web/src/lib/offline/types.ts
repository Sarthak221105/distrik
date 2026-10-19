import type { Database, Tables } from "@/lib/database.types";

export type ProspectStage = Database["public"]["Enums"]["prospect_stage"];

export const CALL_OUTCOMES = [
  "connected",
  "no_answer",
  "busy",
  "interested",
  "not_interested",
  "callback",
  "wrong_number",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  connected: "Connected",
  no_answer: "No answer",
  busy: "Busy",
  interested: "Interested",
  not_interested: "Not interested",
  callback: "Call back later",
  wrong_number: "Wrong number",
};

export type MutationKind = "call_log" | "note" | "stage";
export type MutationStatus = "pending" | "synced" | "failed";

export type CallLogPayload = { outcome: CallOutcome; notes: string; nextFollowup: string | null };
export type NotePayload = { body: string };
export type StagePayload = { to: ProspectStage; from: ProspectStage | null; note: string | null };

type MutationBase = {
  id: string;
  userId: string;
  prospectId: string;
  prospectName: string | null;
  clientTs: string;
  idempotencyKey: string;
  status: MutationStatus;
  error: string | null;
  attempts: number;
  createdAt: number;
  syncedAt: number | null;
};

// One row per offline write (PRD 13): replayed in order with the same
// idempotency key, so a write that reached the server once is never doubled.
export type QueuedMutation =
  | (MutationBase & { kind: "call_log"; payload: CallLogPayload })
  | (MutationBase & { kind: "note"; payload: NotePayload })
  | (MutationBase & { kind: "stage"; payload: StagePayload });

export type MutationInput =
  | { kind: "call_log"; payload: CallLogPayload }
  | { kind: "note"; payload: NotePayload }
  | { kind: "stage"; payload: StagePayload };

// The lead page shape, cached so the page still renders without signal.
export type LeadContact = Pick<Tables<"contacts">, "id" | "name" | "role" | "phone_e164" | "is_primary" | "erased_at"> & {
  consents: { status: Database["public"]["Enums"]["consent_status"]; channel: Database["public"]["Enums"]["channel"] }[];
};
export type LeadConversation = Pick<
  Tables<"conversations">,
  "id" | "contact_id" | "ai_paused" | "paused_reason" | "unread_count" | "last_inbound_at" | "channel"
>;
export type LeadRecord = Pick<
  Tables<"prospects">,
  | "id"
  | "name"
  | "type"
  | "category"
  | "address"
  | "city"
  | "state"
  | "pincode"
  | "stage"
  | "stage_changed_at"
  | "fit_score"
  | "research"
  | "qualification"
  | "ref_code"
  | "is_stale"
  | "is_customer"
  | "assigned_rep_id"
  | "confidence"
  | "source_url"
> & { contacts: LeadContact[]; conversations: LeadConversation[] };

export type LeadEvent = Pick<
  Tables<"prospect_events">,
  "id" | "kind" | "from_stage" | "to_stage" | "body" | "data" | "created_at" | "client_ts" | "actor_id"
>;

export type CachedMessage = Pick<
  Tables<"messages">,
  "id" | "direction" | "body" | "actor" | "status" | "created_at" | "media_filename" | "media_type" | "template_id"
>;

export type LeadSnapshot = { id: string; userId: string; savedAt: number; lead: LeadRecord; events: LeadEvent[] };
export type ThreadSnapshot = {
  conversationId: string;
  userId: string;
  prospectId: string;
  savedAt: number;
  messages: CachedMessage[];
};
