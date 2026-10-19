"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  CircleDashed,
  ExternalLink,
  Flag,
  GitMerge,
  History,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  RotateCcw,
  ShieldAlert,
  UserPlus,
  X,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatDateTime, formatPhone, timeAgo, titleCase } from "@/lib/format";
import { can } from "@/lib/permissions";
import { useRpc } from "@/hooks/use-rpc";
import { useViewer } from "@/components/providers";
import { Sheet } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/misc";
import { ConfidenceTag, ConsentTag, ReviewFlagBadge, ReviewStatusBadge, StagePill, consentHelp } from "@/components/domain/badges";
import { ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { FitBreakdownPanel } from "@/components/manufacturer/fit-breakdown-panel";
import { useTeam } from "@/components/manufacturer/hooks";
import { DuplicateCompare, type CompareRecord, type MergeCandidate } from "@/components/manufacturer/duplicate-compare";
import { AssignDialog, EditProspectDialog, MergeWithDialog, ReasonDialog } from "@/components/manufacturer/lead-dialogs";
import {
  LEAD_INVALIDATE,
  REVIEW_ACTION_LABEL,
  isDecided,
  isProcessing,
  parseSkipped,
  primaryContact,
  skipReasonText,
  whatsappConsent,
  type LeadContact,
} from "@/components/manufacturer/lead-shared";
import type { Json, Tables } from "@/lib/database.types";

type Lead = Tables<"prospects"> & {
  source: { name: string } | null;
  campaign: { id: string; name: string; status: string } | null;
  contacts: LeadContact[];
};

const COMPARE_SELECT =
  "id, name, type, category, address, city, state, pincode, gstin, website, fit_score, review_status, created_at, source:sources(name), contacts(id, name, phone_e164, is_primary, consents(status, channel))";

function obj(v: Json | null | undefined): Record<string, Json> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Json>) : {};
}

function asText(v: Json | undefined | null): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) {
    const parts = v.map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? Object.values(x).filter(Boolean).join(", ") : String(x)));
    return parts.length ? parts.join("; ") : null;
  }
  if (typeof v === "object") return Object.entries(v).map(([k, x]) => `${titleCase(k)}: ${String(x)}`).join(", ");
  return String(v);
}

type Decision = { kind: "reject" } | { kind: "override"; to: "approve" | "reject" } | { kind: "flag" };

/** Lead Review drawer: everything a reviewer needs to approve, reject, edit, merge or assign. */
export function LeadDrawer({
  prospectId,
  onClose,
  onOpenProspect,
}: {
  prospectId: string | null;
  onClose: () => void;
  onOpenProspect: (id: string) => void;
}) {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const team = useTeam();
  const id = prospectId ?? "none";
  const canReview = can(viewer, "review_leads");
  const canDupes = can(viewer, "resolve_duplicates");
  const canAssign = can(viewer, "assign_leads");
  const canOverride = can(viewer, "override_reviews");

  const [decision, setDecision] = useState<Decision | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergePhone, setMergePhone] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const lead = useQuery({
    enabled: !!prospectId,
    queryKey: qk.lead(id),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("prospects")
          .select(
            "*, source:sources(name), campaign:campaigns(id, name, status), contacts(id, name, role, email, phone_e164, is_primary, erased_at, consents(status, channel))",
          )
          .eq("id", id)
          .maybeSingle(),
      ) as unknown as Lead | null,
  });

  const duplicates = useQuery({
    enabled: !!prospectId,
    queryKey: qk.duplicates(id),
    queryFn: async () => {
      const mc = unwrap(
        await supabase
          .from("merge_candidates")
          .select("id, prospect_id, candidate_prospect_id, similarity, status")
          .eq("status", "pending")
          .or(`prospect_id.eq.${id},candidate_prospect_id.eq.${id}`)
          .order("similarity", { ascending: false }),
      ) as MergeCandidate[] | null;
      const list = mc ?? [];
      const ids = Array.from(new Set(list.flatMap((m) => [m.prospect_id, m.candidate_prospect_id]).filter((x): x is string => !!x)));
      const records = ids.length
        ? ((unwrap(await supabase.from("prospects").select(COMPARE_SELECT).in("id", ids)) ?? []) as unknown as CompareRecord[])
        : [];
      return { candidates: list, records: new Map(records.map((r) => [r.id, r])) };
    },
  });

  const raw = useQuery({
    enabled: !!prospectId,
    queryKey: ["lead-raw", id],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("raw_records")
          .select("id, payload, created_at, source:sources(name)")
          .eq("prospect_id", id)
          .order("created_at", { ascending: false })
          .limit(5),
      ) ?? [],
  });

  const history = useQuery({
    enabled: !!prospectId,
    queryKey: qk.leadReviews(id),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("prospect_reviews")
          .select("id, action, from_status, to_status, reason, data, actor_id, created_at")
          .eq("prospect_id", id)
          .order("created_at", { ascending: false })
          .limit(100),
      ) ?? [],
  });

  const review = useRpc(
    async (v: { decision: "approve" | "reject"; reason?: string }) =>
      unwrap(await supabase.rpc("review_prospects", { p_ids: [id], p_decision: v.decision, p_reason: v.reason || undefined })),
    {
      invalidate: LEAD_INVALIDATE.map((k) => [...k]),
      silentError: true,
      onSuccess: (data, v) => {
        const r = obj(data);
        const skipped = parseSkipped(r.skipped);
        if (skipped.length > 0) {
          const msg = skipReasonText(skipped[0]!.reason);
          setDecisionError(msg);
          toast.error(msg);
          return;
        }
        setDecision(null);
        setDecisionError(null);
        toast.success(Number(r.updated ?? 0) > 0 ? (v.decision === "approve" ? "Approved. It can now be released for outreach." : "Rejected") : "No change");
      },
      onError: (e) => {
        setDecisionError(e.message);
        toast.error(e.message);
      },
    },
  );

  const flag = useRpc(async (reason: string) => unwrap(await supabase.rpc("flag_prospect", { p_id: id, p_reason: reason })), {
    invalidate: LEAD_INVALIDATE.map((k) => [...k]),
    success: "Moved to Needs Review",
    onSuccess: () => {
      setDecision(null);
      setDecisionError(null);
    },
    onError: (e) => setDecisionError(e.message),
  });

  const assign = useRpc(async (rep: string) => unwrap(await supabase.rpc("assign_prospects", { p_ids: [id], p_rep: rep })), {
    invalidate: LEAD_INVALIDATE.map((k) => [...k]),
    silentError: true,
    onSuccess: (data) => {
      const skipped = parseSkipped(obj(data).skipped);
      if (skipped.length) return void toast.error(skipReasonText(skipped[0]!.reason));
      toast.success("Assigned. The rep has been notified.");
      setAssignOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const p = lead.data;
  const contact = primaryContact(p?.contacts);
  const consent = whatsappConsent(contact);
  const processing = p ? isProcessing(p) : false;
  const merged = p?.review_status === "merged";
  const decided = p ? isDecided(p.review_status) : false;
  const hasDupFlag = !!p?.review_flags.includes("possible_duplicate");
  const research = obj(p?.research);
  const repName = p?.assigned_rep_id ? (team.byId.get(p.assigned_rep_id)?.full_name ?? "A rep") : null;
  const actorName = (actor: string | null) =>
    actor ? (actor === viewer.userId ? "You" : (team.byId.get(actor)?.full_name ?? team.byId.get(actor)?.email ?? "A team member")) : "Distrik automation";

  const sources = Array.isArray(research.sources)
    ? research.sources
        .map((s) =>
          typeof s === "string" ? { url: s, label: s } : s && typeof s === "object" && !Array.isArray(s) && typeof s.url === "string" ? { url: s.url, label: typeof s.label === "string" ? s.label : s.url } : null,
        )
        .filter((s): s is { url: string; label: string } => !!s)
    : [];
  const inferred = research.inferred === true || sources.length === 0;

  return (
    <Sheet
      open={!!prospectId}
      onOpenChange={(o) => !o && onClose()}
      title={p?.name ?? "Prospect"}
      description={p ? [titleCase(p.type), p.category, p.city].filter(Boolean).join(" · ") : undefined}
      className="max-w-2xl"
    >
      {lead.isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : lead.error ? (
        <ErrorState error={lead.error} onRetry={() => lead.refetch()} />
      ) : !p ? (
        <ErrorState title="Prospect not found" error="It may belong to another account, or it was removed." />
      ) : (
        <div className="grid gap-5">
          {/* Status, flags and why it needs attention */}
          <section aria-label="Review status" className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {processing ? (
                <Badge tone="info">
                  <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> Processing
                </Badge>
              ) : (
                <ReviewStatusBadge status={p.review_status} />
              )}
              {p.review_flags.map((f) => (
                <ReviewFlagBadge key={f} flag={f} />
              ))}
              {p.outreach_approved && <Badge tone="primary">Released for outreach</Badge>}
              {p.stage !== "new" && <StagePill stage={p.stage} />}
            </div>
            {processing && (
              <p className="text-sm text-muted-foreground">
                Automatic cleaning, research and scoring are still running (step: {titleCase(p.pipeline_step)}). It can be reviewed once they finish.
              </p>
            )}
            {p.attention_reason && (
              <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  <span className="font-medium">Why it needs a look: </span>
                  {p.attention_reason}
                </span>
              </p>
            )}
            {decided && (
              <p className="text-sm text-muted-foreground">
                {titleCase(p.review_status)} by {actorName(p.reviewed_by)} {p.reviewed_at ? timeAgo(p.reviewed_at) : ""}
                {p.review_note ? ` · “${p.review_note}”` : ""}
              </p>
            )}
            {merged && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
                <span>This record was merged into another one and is hidden from lists.</span>
                {p.merged_into && (
                  <Button size="sm" variant="outline" onClick={() => onOpenProspect(p.merged_into!)}>
                    Open the kept record
                  </Button>
                )}
              </div>
            )}
          </section>

          {/* Actions (the database enforces each permission again) */}
          {!merged && (canReview || canDupes || canAssign) && (
            <section aria-label="Actions" className="flex flex-wrap gap-2">
              {canReview && !decided && (
                <>
                  <Button
                    variant="success"
                    size="sm"
                    disabled={processing || hasDupFlag}
                    loading={review.isPending && !decision}
                    title={hasDupFlag ? "Resolve the duplicate warning first" : processing ? "Still processing" : undefined}
                    onClick={() => {
                      setDecisionError(null);
                      review.mutate({ decision: "approve" });
                    }}
                  >
                    <Check aria-hidden /> Approve
                  </Button>
                  <Button variant="outline" size="sm" className="text-danger" disabled={processing} onClick={() => setDecision({ kind: "reject" })}>
                    <X aria-hidden /> Reject
                  </Button>
                </>
              )}
              {canReview && decided && canOverride && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDecision({ kind: "override", to: p.review_status === "approved" ? "reject" : "approve" })}
                >
                  <RotateCcw aria-hidden /> Override: {p.review_status === "approved" ? "reject" : "approve"} (audited)
                </Button>
              )}
              {canReview && (
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil aria-hidden /> Edit
                </Button>
              )}
              {canDupes && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMergePhone(null);
                    setMergeOpen(true);
                  }}
                >
                  <GitMerge aria-hidden /> Merge with…
                </Button>
              )}
              {canAssign && p.review_status === "approved" && (
                <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                  <UserPlus aria-hidden /> {p.assigned_rep_id ? "Reassign" : "Assign to rep"}
                </Button>
              )}
              {canReview && p.review_status !== "rejected" && p.review_status !== "needs_review" && !processing && (
                <Button variant="ghost" size="sm" onClick={() => setDecision({ kind: "flag" })}>
                  <Flag aria-hidden /> Flag for a closer look
                </Button>
              )}
            </section>
          )}
          {!merged && hasDupFlag && canReview && !decided && (
            <p className="text-xs text-muted-foreground">Approve is available once the duplicate warning below is merged or kept separate.</p>
          )}
          {!merged && decided && canReview && !canOverride && (
            <p className="text-xs text-muted-foreground">Changing an earlier decision needs the Override decisions permission from the owner.</p>
          )}
          {!canReview && !canDupes && !canAssign && (
            <p className="text-xs text-muted-foreground">You can view this prospect. The owner can give you permission to review leads in Settings, Team.</p>
          )}

          {/* Duplicate warnings */}
          {(duplicates.data?.candidates.length ?? 0) > 0 && (
            <section aria-labelledby="dup-h" className="grid gap-2">
              <h3 id="dup-h" className="flex items-center gap-2 text-sm font-semibold">
                <ShieldAlert className="size-4 text-accent" aria-hidden /> Duplicate warnings ({duplicates.data!.candidates.length})
              </h3>
              {duplicates.data!.candidates.map((mc) => (
                <DuplicateCompare
                  key={mc.id}
                  candidate={mc}
                  existing={duplicates.data!.records.get(mc.prospect_id)}
                  incoming={mc.candidate_prospect_id ? duplicates.data!.records.get(mc.candidate_prospect_id) : undefined}
                  currentId={p.id}
                  canResolve={canDupes}
                  invalidate={LEAD_INVALIDATE}
                  onResolved={(kept) => {
                    if (kept && kept !== p.id) onOpenProspect(kept);
                  }}
                />
              ))}
            </section>
          )}
          {duplicates.error && <ErrorState title="Could not load duplicate warnings" error={duplicates.error} onRetry={() => duplicates.refetch()} />}

          <Separator />

          {/* Contact and location */}
          <section aria-labelledby="contact-h" className="grid gap-2">
            <h3 id="contact-h" className="text-sm font-semibold">Contact and location</h3>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <Fact label="Contact name">{contact?.name ? `${contact.name}${contact.role ? `, ${contact.role}` : ""}` : null}</Fact>
              <Fact label="Phone">
                {contact?.phone_e164 ? (
                  <a href={`tel:${contact.phone_e164}`} className="inline-flex items-center gap-1 hover:underline">
                    <Phone className="size-3.5" aria-hidden /> {formatPhone(contact.phone_e164)}
                  </a>
                ) : contact?.erased_at ? (
                  "Erased on request"
                ) : null}
              </Fact>
              <Fact label="Email">{contact?.email}</Fact>
              <Fact label="WhatsApp consent">
                {consent ? (
                  <span className="grid gap-0.5">
                    <ConsentTag status={consent} />
                    <span className="text-xs text-muted-foreground">{consentHelp(consent)}</span>
                  </span>
                ) : (
                  "No contact yet"
                )}
              </Fact>
              <Fact label="Address" wide>
                {p.address || p.city ? (
                  <span className="inline-flex items-start gap-1">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {[p.address, p.city, p.state, p.pincode].filter(Boolean).join(", ")}
                  </span>
                ) : null}
              </Fact>
              <Fact label="GSTIN">{p.gstin}</Fact>
              <Fact label="Website">
                {p.website ? (
                  <a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {p.website}
                    <span className="sr-only"> (opens in new tab)</span>
                  </a>
                ) : null}
              </Fact>
              <Fact label="Campaign">
                {p.campaign ? (
                  <Link href={`/campaigns/${p.campaign.id}`} className="text-primary hover:underline">
                    {p.campaign.name}
                  </Link>
                ) : null}
              </Fact>
              <Fact label="Assigned rep">{repName ?? "Not assigned"}</Fact>
            </dl>
            {p.contacts.length > 1 && <p className="text-xs text-muted-foreground">{p.contacts.length - 1} more contact(s) on this record.</p>}
          </section>

          {/* Business profile */}
          <section aria-labelledby="biz-h" className="grid gap-2">
            <h3 id="biz-h" className="text-sm font-semibold">Business profile</h3>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <Fact label="Buyer type">{titleCase(p.type)}</Fact>
              <Fact label="Buyer category">
                {p.category
                  ? `${p.category}${p.category_confidence !== null ? ` (${Math.round(Number(p.category_confidence) * 100)}% confident)` : ""}`
                  : null}
              </Fact>
              <Fact label="Products and brands carried" wide>
                {asText(research.brands_carried)}
              </Fact>
              <Fact label="Estimated business size">{asText(research.estimated_scale)}</Fact>
              <Fact label="Distribution reach">{asText(research.retail_reach)}</Fact>
              <Fact label="Decision makers" wide>
                {asText(research.decision_makers)}
              </Fact>
            </dl>
            {typeof research.summary === "string" && <p className="text-sm">{research.summary}</p>}
            {typeof research.reason_to_switch === "string" && (
              <p className="rounded-lg bg-ai-soft px-3 py-2 text-sm">
                <span className="font-medium text-ai">Reason to switch: </span>
                {research.reason_to_switch}
              </p>
            )}
          </section>

          <Separator />

          <FitBreakdownPanel breakdown={p.fit_breakdown} score={p.fit_score} version={p.fit_config_version} />

          <Separator />

          {/* Data quality and sources */}
          <section aria-labelledby="quality-h" className="grid gap-2">
            <h3 id="quality-h" className="text-sm font-semibold">Data confidence and sources</h3>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <ConfidenceTag confidence={p.confidence} />
              {inferred ? (
                <Badge tone="warning">
                  <CircleDashed aria-hidden /> Research inferred, no source link
                </Badge>
              ) : (
                <Badge tone="success">
                  {sources.length} research source{sources.length === 1 ? "" : "s"}
                </Badge>
              )}
              <span className="text-muted-foreground">
                Last checked {p.last_checked_at ? `${timeAgo(p.last_checked_at)} (${formatDateTime(p.last_checked_at)})` : "never"}
              </span>
            </div>
            <ul className="grid gap-1 text-sm">
              {p.source?.name && <li>Found through: {p.source.name}</li>}
              {p.source_url && (
                <li>
                  <ExtLink href={p.source_url}>Original listing</ExtLink>
                </li>
              )}
              {sources.map((s) => (
                <li key={s.url}>
                  <ExtLink href={s.url}>{s.label}</ExtLink>
                </li>
              ))}
            </ul>
          </section>

          {/* Raw source vs cleaned */}
          <RawVsCleaned raw={raw.data ?? []} loading={raw.isLoading} error={raw.error} onRetry={() => raw.refetch()} lead={p} contact={contact} />

          <Separator />

          {/* Review history */}
          <section aria-labelledby="hist-h" className="grid gap-2">
            <h3 id="hist-h" className="flex items-center gap-2 text-sm font-semibold">
              <History className="size-4 text-muted-foreground" aria-hidden /> Review history
            </h3>
            {history.isLoading ? (
              <LoadingSkeleton rows={2} />
            ) : history.error ? (
              <ErrorState error={history.error} onRetry={() => history.refetch()} />
            ) : (history.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No decisions yet. Discovered {timeAgo(p.created_at)}.</p>
            ) : (
              <ol className="grid gap-3 border-l border-border pl-4">
                {history.data!.map((h) => {
                  const d = obj(h.data);
                  return (
                    <li key={h.id} className="relative grid gap-0.5 text-sm">
                      <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-surface bg-primary" aria-hidden />
                      <span className="font-medium">
                        {REVIEW_ACTION_LABEL[h.action] ?? titleCase(h.action)}
                        {h.action === "override" && h.from_status && h.to_status ? `: ${titleCase(h.from_status)} to ${titleCase(h.to_status)}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {actorName(h.actor_id)} · <time dateTime={h.created_at}>{formatDateTime(h.created_at)}</time>
                      </span>
                      {h.reason && <span className="text-muted-foreground">“{h.reason}”</span>}
                      {h.action === "edit" && Object.keys(d).length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Changed: {Object.keys(d).flatMap((k) => (k === "contact" ? Object.keys(obj(d.contact)) : [k])).map(titleCase).join(", ")}
                        </span>
                      )}
                      {h.action === "assign" && typeof d.rep_name === "string" && <span className="text-xs text-muted-foreground">To {d.rep_name}</span>}
                      {h.action === "merge" && typeof d.merged_name === "string" && (
                        <span className="text-xs text-muted-foreground">Merged in: {d.merged_name}</span>
                      )}
                      {h.action === "merged_into" && typeof d.kept_prospect_id === "string" && (
                        <button type="button" className="justify-self-start text-xs text-primary hover:underline" onClick={() => onOpenProspect(String(d.kept_prospect_id))}>
                          Kept record: {typeof d.kept_name === "string" ? d.kept_name : "open"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {p.review_status === "approved" && (
            <Button asChild variant="outline" className="justify-self-start">
              <Link href={`/prospects/${p.id}`}>Open sales profile</Link>
            </Button>
          )}

          {/* Dialogs */}
          <ReasonDialog
            open={decision?.kind === "reject"}
            onOpenChange={(o) => !o && setDecision(null)}
            title={`Reject ${p.name}`}
            description="Rejected prospects are never contacted. The reason helps your team and improves future discovery."
            label="Why is it not a fit?"
            confirmLabel="Reject"
            variant="danger"
            pending={review.isPending}
            error={decisionError}
            onSubmit={(reason) => review.mutate({ decision: "reject", reason })}
          />
          <ReasonDialog
            open={decision?.kind === "override"}
            onOpenChange={(o) => !o && setDecision(null)}
            title={decision?.kind === "override" ? `Override: ${decision.to === "approve" ? "approve" : "reject"} ${p.name}` : "Override"}
            description={`This prospect was already ${p.review_status}. Overriding changes that decision.`}
            label="Reason for the override"
            confirmLabel={decision?.kind === "override" && decision.to === "approve" ? "Override and approve" : "Override and reject"}
            variant={decision?.kind === "override" && decision.to === "reject" ? "danger" : "default"}
            audited
            pending={review.isPending}
            error={decisionError}
            onSubmit={(reason) => decision?.kind === "override" && review.mutate({ decision: decision.to, reason })}
          />
          <ReasonDialog
            open={decision?.kind === "flag"}
            onOpenChange={(o) => !o && setDecision(null)}
            title={`Flag ${p.name} for a closer look`}
            description="It moves to Needs Review and outreach is paused for it until someone approves it again."
            label="What looks wrong?"
            confirmLabel="Flag"
            pending={flag.isPending}
            error={decisionError}
            onSubmit={(reason) => flag.mutate(reason)}
          />
          {canReview && (
            <EditProspectDialog
              open={editOpen}
              onOpenChange={setEditOpen}
              prospect={{ ...p, contact }}
              invalidate={LEAD_INVALIDATE}
              onSuggestMerge={(phone) => {
                setMergePhone(phone);
                setMergeOpen(true);
              }}
            />
          )}
          {canDupes && (
            <MergeWithDialog
              open={mergeOpen}
              onOpenChange={setMergeOpen}
              prospect={{ id: p.id, name: p.name }}
              initialPhone={mergePhone}
              invalidate={LEAD_INVALIDATE}
              onMerged={(kept) => {
                if (kept !== p.id) onOpenProspect(kept);
              }}
            />
          )}
          {canAssign && <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} count={1} pending={assign.isPending} onSubmit={(rep) => assign.mutate(rep)} />}
        </div>
      )}
    </Sheet>
  );
}

function Fact({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{empty ? <span className="text-muted-foreground">No data</span> : children}</dd>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-primary hover:underline">
      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
      {children}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}

const RAW_FIELDS: { keys: string[]; label: string; cleaned: (p: Lead, c: LeadContact | null) => string | null }[] = [
  { keys: ["name"], label: "Company name", cleaned: (p) => p.name },
  { keys: ["phone"], label: "Phone", cleaned: (_p, c) => c?.phone_e164 ?? null },
  { keys: ["email"], label: "Email", cleaned: (_p, c) => c?.email ?? null },
  { keys: ["contact_name"], label: "Contact name", cleaned: (_p, c) => c?.name ?? null },
  { keys: ["contact_role"], label: "Contact role", cleaned: (_p, c) => c?.role ?? null },
  { keys: ["type"], label: "Buyer type", cleaned: (p) => p.type },
  { keys: ["category_hint", "category"], label: "Category", cleaned: (p) => p.category },
  { keys: ["address"], label: "Address", cleaned: (p) => p.address },
  { keys: ["city"], label: "City", cleaned: (p) => p.city },
  { keys: ["state"], label: "State", cleaned: (p) => p.state },
  { keys: ["pincode"], label: "Pincode", cleaned: (p) => p.pincode },
  { keys: ["gstin"], label: "GSTIN", cleaned: (p) => p.gstin },
  { keys: ["website"], label: "Website", cleaned: (p) => p.website },
];
const HIDDEN_RAW = new Set(["origin", "uploaded_by", "origin_note", "external_id"]);

function RawVsCleaned({
  raw,
  loading,
  error,
  onRetry,
  lead,
  contact,
}: {
  raw: { id: string; payload: Json; created_at: string; source: { name: string } | null }[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  lead: Lead;
  contact: LeadContact | null;
}) {
  const [index, setIndex] = useState(0);
  if (loading) return <LoadingSkeleton rows={2} />;
  if (error) return <ErrorState title="Could not load the source record" error={error} onRetry={onRetry} />;
  const rec = raw[Math.min(index, raw.length - 1)];
  return (
    <section aria-labelledby="raw-h" className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="raw-h" className="text-sm font-semibold">Source record vs cleaned data</h3>
        {raw.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Source record
            <select className="rounded border border-border bg-surface px-1 py-0.5 text-xs" value={index} onChange={(e) => setIndex(Number(e.target.value))}>
              {raw.map((r, i) => (
                <option key={r.id} value={i}>
                  {r.source?.name ?? "Source"} · {formatDateTime(r.created_at)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!rec ? (
        <p className="text-sm text-muted-foreground">No source record is linked to this prospect (for example, it was created by a merge).</p>
      ) : (
        <RawTable payload={obj(rec.payload)} lead={lead} contact={contact} sourceName={rec.source?.name ?? null} />
      )}
    </section>
  );
}

function RawTable({ payload, lead, contact, sourceName }: { payload: Record<string, Json>; lead: Lead; contact: LeadContact | null; sourceName: string | null }) {
  const used = new Set(RAW_FIELDS.flatMap((f) => f.keys));
  const extra = Object.entries(payload).filter(([k]) => !used.has(k) && !HIDDEN_RAW.has(k));
  const norm = (v: string | null) => (v ?? "").replace(/[\s+-]/g, "").toLowerCase();
  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">
        {sourceName ? `From ${sourceName}. ` : ""}
        {payload.origin === "manufacturer_upload" && "Uploaded by your team. "}
        {typeof payload.origin_note === "string" && `Origin note: “${payload.origin_note}”`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Raw source values compared with the cleaned values</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="pb-1 pr-2 font-medium">Field</th>
              <th scope="col" className="pb-1 pr-2 font-medium">As found</th>
              <th scope="col" className="pb-1 pr-2 font-medium">Cleaned</th>
              <th scope="col" className="pb-1 font-medium"><span className="sr-only">Changed</span></th>
            </tr>
          </thead>
          <tbody>
            {RAW_FIELDS.map((f) => {
              const rawVal = f.keys.map((k) => asText(payload[k])).find(Boolean) ?? null;
              const cleaned = f.cleaned(lead, contact);
              if (!rawVal && !cleaned) return null;
              const changed = norm(rawVal).replace(/^91/, "") !== norm(cleaned).replace(/^91/, "");
              return (
                <tr key={f.label} className="border-t border-border align-top">
                  <th scope="row" className="py-1.5 pr-2 text-left text-xs font-medium text-muted-foreground">{f.label}</th>
                  <td className="py-1.5 pr-2 break-words">{rawVal ?? <span className="text-muted-foreground">Not in source</span>}</td>
                  <td className="py-1.5 pr-2 break-words">{cleaned ?? <span className="text-muted-foreground">Empty</span>}</td>
                  <td className="py-1.5 text-xs">{changed ? <Badge tone="outline">Changed</Badge> : <span className="text-muted-foreground">Same</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {extra.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Other source fields ({extra.length})</summary>
          <dl className="mt-2 grid gap-1">
            {extra.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[10rem_1fr] gap-2">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="break-words text-xs">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
