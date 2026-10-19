"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { useRealtime } from "@/hooks/use-realtime";
import { useViewer } from "@/components/providers";
import type { Json } from "@/lib/database.types";

// Shared types and copy for the manufacturer's Lead Review workflow:
// discovery -> automatic cleaning, dedupe, scoring -> Lead Review -> outreach.

export type ReviewTab = "pending" | "needs_review" | "approved" | "rejected" | "all";

export const REVIEW_TABS: { value: ReviewTab; label: string }[] = [
  { value: "pending", label: "Pending Review" },
  { value: "needs_review", label: "Needs Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

export function isReviewTab(v: string | null | undefined): v is ReviewTab {
  return !!v && REVIEW_TABS.some((t) => t.value === v);
}

export const BUYER_TYPES = [
  "distributor",
  "super_stockist",
  "wholesaler",
  "dealer",
  "retailer",
  "modern_trade",
  "other",
] as const;

export type LeadContact = {
  id: string;
  name: string | null;
  role?: string | null;
  email?: string | null;
  phone_e164: string | null;
  is_primary: boolean;
  erased_at?: string | null;
  consents: { status: string; channel: string }[];
};

export type LeadRow = {
  id: string;
  name: string;
  type: string;
  category: string | null;
  city: string | null;
  state: string | null;
  fit_score: number | null;
  confidence: string;
  review_status: string;
  review_flags: string[];
  pipeline_step: string;
  attention_reason: string | null;
  assigned_rep_id: string | null;
  last_checked_at: string | null;
  created_at: string;
  campaign_id: string | null;
  outreach_approved: boolean;
  contacts: LeadContact[];
};

export const LEAD_ROW_SELECT =
  "id, name, type, category, city, state, fit_score, confidence, review_status, review_flags, pipeline_step, attention_reason, assigned_rep_id, last_checked_at, created_at, campaign_id, outreach_approved, contacts(id, name, phone_e164, is_primary, consents(status, channel))";

export function primaryContact(contacts: LeadContact[] | null | undefined): LeadContact | null {
  if (!contacts || contacts.length === 0) return null;
  return contacts.find((c) => c.is_primary) ?? contacts[0] ?? null;
}

export function whatsappConsent(contact: LeadContact | null): string | null {
  if (!contact) return null;
  return contact.consents.find((c) => c.channel === "whatsapp")?.status ?? "none";
}

/** Only prospects whose automatic processing finished can be reviewed. */
export function isProcessing(p: { pipeline_step: string; review_status: string }) {
  return p.pipeline_step !== "done" && p.review_status !== "merged";
}

export function isDecided(status: string) {
  return status === "approved" || status === "rejected";
}

/** Plain words for the skip reasons returned by review_prospects and assign_prospects. */
export const SKIP_REASON: Record<string, string> = {
  still_processing: "Still being processed. Research and scoring have not finished yet.",
  merged: "Already merged into another record.",
  already_decided: "Already decided. Changing an earlier decision needs the Override decisions permission.",
  override_needs_reason: "Already decided. Give a reason to override the earlier decision.",
  unresolved_duplicate: "Possible duplicate. Merge it or keep it separate before approving.",
  not_approved: "Not approved yet. Only approved prospects can be assigned to a rep.",
};

export function skipReasonText(code: string) {
  return SKIP_REASON[code] ?? code.replace(/_/g, " ");
}

export type SkippedItem = { id: string; name: string; reason: string };

export function parseSkipped(raw: Json | undefined | null): SkippedItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, Json> => !!r && typeof r === "object" && !Array.isArray(r))
    .map((r) => ({ id: String(r.id ?? ""), name: String(r.name ?? "Prospect"), reason: String(r.reason ?? "") }));
}

export type BulkResult = {
  title: string;
  done: number;
  doneLabel: string;
  unchanged: number;
  skipped: SkippedItem[];
};

export const REVIEW_ACTION_LABEL: Record<string, string> = {
  approve: "Approved",
  reject: "Rejected",
  override: "Decision overridden (audited)",
  edit: "Details edited",
  merge: "Merged another record into this one",
  merged_into: "Merged into another record",
  keep_separate: "Kept separate from a possible duplicate",
  assign: "Assigned to a rep",
  flag: "Flagged for a closer look",
  reopen: "Reopened for review",
  import: "Imported from a file",
};

/** Strips characters that would break a PostgREST filter expression. */
export function sanitizeSearch(s: string) {
  return s.replace(/[^\p{L}\p{N} .&'/-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * Leads awaiting the team's review (pending + needs review, processing
 * finished). Used for the nav badge and the dashboard KPI.
 */
export function useAwaitingReviewCount() {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const key = qk.leads({ badge: "awaiting" });
  const query = useQuery({
    queryKey: key,
    enabled: !!viewer.manufacturerId,
    queryFn: async () => {
      const res = await supabase
        .from("prospects")
        .select("id", { count: "exact", head: true })
        .in("review_status", ["pending", "needs_review"])
        .eq("pipeline_step", "done");
      unwrap(res);
      return res.count ?? 0;
    },
  });
  useRealtime({
    table: "prospects",
    filter: viewer.manufacturerId ? `manufacturer_id=eq.${viewer.manufacturerId}` : undefined,
    enabled: !!viewer.manufacturerId,
    invalidate: [key],
  });
  return query;
}

/** Broad prefixes so a review action refreshes every list, drawer and count. */
export const LEAD_INVALIDATE: readonly (readonly unknown[])[] = [
  ["leads"],
  ["lead"],
  ["lead-reviews"],
  ["lead-raw"],
  ["duplicates"],
  ["prospects"],
  ["prospect"],
  ["review-stats"],
  ["campaign"],
  ["campaigns"],
];
