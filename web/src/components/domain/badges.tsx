import { Bot, CheckCircle2, CircleDashed, Hand, ShieldAlert, ShieldCheck, ShieldOff, UserCheck } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Colour is never the only signal: every badge carries text and most an icon.

export function FitScoreBadge({ score, className }: { score: number | null | undefined; className?: string }) {
  if (score === null || score === undefined) {
    return (
      <Badge tone="neutral" className={className} aria-label="Fit score not computed">
        Fit –
      </Badge>
    );
  }
  const s = Math.round(Number(score));
  const tone: BadgeTone = s >= 75 ? "success" : s >= 55 ? "warning" : "neutral";
  const label = s >= 75 ? "Strong" : s >= 55 ? "Medium" : "Weak";
  return (
    <Badge tone={tone} className={cn("tabular", className)} aria-label={`Fit score ${s} of 100, ${label}`}>
      <span className="font-semibold">{s}</span>
      <span className="opacity-80">{label}</span>
    </Badge>
  );
}

const STAGE_TONE: Record<string, BadgeTone> = {
  new: "neutral",
  contacted: "info",
  engaged: "primary",
  qualified: "ai",
  negotiating: "accent",
  quoted: "warning",
  first_order: "success",
  repeat_order: "success",
  lost: "danger",
};

export const STAGES = [
  "new",
  "contacted",
  "engaged",
  "qualified",
  "negotiating",
  "quoted",
  "first_order",
  "repeat_order",
] as const;

export function StagePill({ stage, className }: { stage: string; className?: string }) {
  return (
    <Badge tone={STAGE_TONE[stage] ?? "neutral"} className={className}>
      {t(`stage.${stage}`)}
    </Badge>
  );
}

export function ConsentTag({ status, className }: { status: string | null | undefined; className?: string }) {
  const s = status ?? "none";
  const map: Record<string, { tone: BadgeTone; Icon: typeof ShieldCheck }> = {
    none: { tone: "neutral", Icon: CircleDashed },
    engaged: { tone: "info", Icon: ShieldAlert },
    opted_in: { tone: "success", Icon: ShieldCheck },
    opted_out: { tone: "danger", Icon: ShieldOff },
  };
  const { tone, Icon } = map[s] ?? map.none!;
  return (
    <Badge tone={tone} className={className} title={consentHelp(s)}>
      <Icon aria-hidden />
      {t(`consent.${s}`)}
    </Badge>
  );
}

export function consentHelp(status: string): string {
  switch (status) {
    case "engaged":
      return "Free form replies inside the 24 hour window; approved templates outside it";
    case "opted_in":
      return "Approved templates and replies, including reorder reminders";
    case "opted_out":
      return "Nothing. The contact asked not to be contacted";
    default:
      return "No WhatsApp. Reps may call and share a click to chat link";
  }
}

export function TierBadge({ tier, className }: { tier: string; className?: string }) {
  const map: Record<string, { tone: BadgeTone; Icon: typeof Bot }> = {
    autonomous: { tone: "ai", Icon: Bot },
    approval: { tone: "warning", Icon: UserCheck },
    human_only: { tone: "danger", Icon: Hand },
  };
  const { tone, Icon } = map[tier] ?? map.approval!;
  return (
    <Badge tone={tone} className={className}>
      <Icon aria-hidden />
      {t(`tier.${tier}`)}
    </Badge>
  );
}

export function ConfidenceTag({ confidence }: { confidence: string | null | undefined }) {
  return confidence === "verified" ? (
    <Badge tone="success">
      <CheckCircle2 aria-hidden />
      Verified
    </Badge>
  ) : (
    <Badge tone="warning">
      <CircleDashed aria-hidden />
      Inferred
    </Badge>
  );
}

export function MatchStatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: BadgeTone; label: string }> = {
    matched: { tone: "success", label: "Matched" },
    mismatch: { tone: "danger", label: "Mismatch" },
    needs_review: { tone: "warning", label: "Needs review" },
    pending: { tone: "neutral", label: "Parsing" },
  };
  const m = map[status] ?? map.pending!;
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone: BadgeTone =
    ["approved", "paid", "delivered", "sent", "accepted", "done", "matched", "indexed", "confirmed", "ready", "live"].includes(status)
      ? "success"
      : ["pending", "due", "upcoming", "queued", "generating", "draft", "submitted", "discovering", "scoring", "lead_review", "review", "needs_review"].includes(status)
        ? "warning"
        : ["rejected", "failed", "overdue", "expired", "cancelled", "blocked", "mismatch", "opted_out"].includes(status)
          ? "danger"
          : ["countered", "dispatched", "in_transit", "running"].includes(status)
            ? "info"
            : "neutral";
  return <Badge tone={tone}>{status.replace(/_/g, " ")}</Badge>;
}

const REVIEW_TONE: Record<string, BadgeTone> = {
  pending: "warning",
  needs_review: "accent",
  approved: "success",
  rejected: "danger",
  merged: "neutral",
};

/** Lead Review status: Pending Review, Needs Review, Approved, Rejected, Merged. */
export function ReviewStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={REVIEW_TONE[status] ?? "neutral"} className={className}>
      {t(`review.${status}`)}
    </Badge>
  );
}

export function ReviewFlagBadge({ flag }: { flag: string }) {
  return (
    <Badge tone={flag === "possible_duplicate" ? "accent" : "warning"}>
      <ShieldAlert aria-hidden />
      {t(`flag.${flag}`)}
    </Badge>
  );
}
