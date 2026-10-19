"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Clock, Sparkles, X, CornerDownRight } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatDateTime, formatINR, rupeesToPaise, timeAgo, titleCase } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { useOptionalViewer } from "@/components/providers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PriceGuardrailMeter } from "@/components/domain/price-guardrail-meter";
import { StatusBadge } from "@/components/domain/badges";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";

export type ApprovalWithJoins = Tables<"human_approvals"> & {
  prospect: { id: string; name: string; city: string | null } | null;
  negotiation:
    | (Pick<Tables<"negotiations">, "id" | "qty" | "status"> & {
        product: Pick<Tables<"products">, "name" | "unit" | "sku" | "distributor_price_paise" | "cost_paise"> | null;
        offers: Pick<Tables<"negotiation_offers">, "id" | "by_party" | "price_paise" | "qty" | "decision" | "created_at">[];
      })
    | null;
};

// Use this select string so the card has everything it needs.
export const APPROVAL_SELECT =
  "*, prospect:prospects(id, name, city), negotiation:negotiations(id, qty, status, product:products(name, unit, sku, distributor_price_paise, cost_paise), offers:negotiation_offers(id, by_party, price_paise, qty, decision, created_at))";

/**
 * ApprovalCard: the ask, floor, hard minimum, deal value, margin and the AI's
 * recommendation, with negotiation history; Approve, Counter or Reject.
 */
export function ApprovalCard({ approval: a, compact = false }: { approval: ApprovalWithJoins; compact?: boolean }) {
  const supabase = getSupabaseBrowser();
  const viewer = useOptionalViewer();
  const [counterOpen, setCounterOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [counter, setCounter] = useState("");
  const [note, setNote] = useState("");
  const [fieldError, setFieldError] = useState<string>();

  const product = a.negotiation?.product;
  const isPrice = a.kind === "price_below_floor";
  const cost = product?.cost_paise ?? null;
  const margin = (price: number | null) =>
    price && cost ? `${(((price - cost) / price) * 100).toFixed(1)}%` : (a.context as Record<string, string>)?.margin_at_requested ?? "–";
  const pending = a.status === "pending";
  const expired = pending && new Date(a.expires_at) < new Date();
  const overLimit =
    viewer?.role === "sales_head" &&
    viewer.approvalLimitPaise !== null &&
    (a.deal_value_paise ?? 0) > viewer.approvalLimitPaise;
  const canDecide = pending && !expired && (viewer?.role === "owner" || viewer?.role === "sales_head");

  const decide = useRpc(
    async (vars: { decision: "approve" | "reject" | "counter"; counter?: number; note?: string }) =>
      unwrap(
        await supabase.rpc("decide_approval", {
          p_id: a.id,
          p_decision: vars.decision,
          p_counter_paise: vars.counter as number,
          p_note: vars.note as string,
        }),
      ),
    {
      invalidate: [qk.approvals("pending"), qk.approvals("decided"), qk.approval(a.id)],
      success: (_d, v) =>
        v.decision === "approve"
          ? "Approved. The AI will tell the buyer and send the quotation."
          : v.decision === "counter"
            ? "Counter sent to the AI. The conversation resumes now."
            : "Rejected. The AI will hold the floor price.",
      onSuccess: () => {
        setCounterOpen(false);
        setRejectOpen(false);
      },
      onError: (e) => setFieldError(e.field === "counter_paise" ? e.message : undefined),
    },
  );

  const offers = [...(a.negotiation?.offers ?? [])].sort((x, y) => x.created_at.localeCompare(y.created_at));

  return (
    <Card className={cn("grid gap-4 p-4", pending && !expired && "border-accent/40")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={isPrice ? "accent" : "info"}>{titleCase(a.kind)}</Badge>
            <StatusBadge status={expired ? "expired" : a.status} />
          </div>
          <h3 className="text-base font-semibold">
            {a.prospect ? (
              <Link href={`/prospects/${a.prospect.id}`} className="hover:underline">
                {a.prospect.name}
              </Link>
            ) : (
              "Buyer"
            )}
            {a.prospect?.city && <span className="font-normal text-muted-foreground"> · {a.prospect.city}</span>}
          </h3>
          <p className="text-sm text-muted-foreground">{a.summary}</p>
        </div>
        {pending && (
          <span className={cn("inline-flex items-center gap-1 text-xs", expired ? "text-danger" : "text-muted-foreground")}>
            <Clock className="size-3.5" aria-hidden />
            {expired ? "Expired" : `Expires ${timeAgo(a.expires_at)}`}
          </span>
        )}
      </div>

      {isPrice && (
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <PriceGuardrailMeter
            requested={a.requested_paise}
            floor={a.permitted_paise}
            hardMinimum={a.hard_minimum_paise}
            list={product?.distributor_price_paise}
          />
          <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm md:grid-cols-1 md:text-right">
            <div>
              <dt className="text-xs text-muted-foreground">Quantity</dt>
              <dd className="tabular font-medium">
                {a.qty} {product?.unit}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Deal value</dt>
              <dd className="tabular font-medium">{formatINR(a.deal_value_paise, { whole: true })}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Margin at ask</dt>
              <dd className="tabular font-medium">{margin(a.requested_paise)}</dd>
            </div>
          </dl>
        </div>
      )}

      {a.ai_recommendation && (
        <div className="flex gap-2 rounded-lg bg-ai-soft px-3 py-2 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-ai" aria-hidden />
          <p>
            <span className="font-medium text-ai">AI recommendation: </span>
            {a.ai_recommendation}
          </p>
        </div>
      )}

      {!compact && offers.length > 0 && (
        <div className="grid gap-1">
          <p className="text-xs font-medium text-muted-foreground">Negotiation history</p>
          <ol className="grid gap-1 text-sm">
            {offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2">
                <CornerDownRight className="size-3.5 text-muted-foreground" aria-hidden />
                <span className="w-24 text-muted-foreground">{titleCase(o.by_party)}</span>
                <span className="tabular font-medium">{formatINR(o.price_paise)}</span>
                <span className="text-muted-foreground">× {o.qty}</span>
                <StatusBadge status={o.decision} />
                <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(o.created_at)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {!pending && a.decided_at && (
        <p className="text-xs text-muted-foreground">
          Decided {formatDateTime(a.decided_at)}
          {a.approved_price_paise ? ` at ${formatINR(a.approved_price_paise)}` : ""}
          {a.decision_note ? ` · “${a.decision_note}”` : ""}
        </p>
      )}

      {canDecide && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {overLimit && (
            <p className="w-full text-xs text-warning">
              This deal is above your approval limit of {formatINR(viewer?.approvalLimitPaise, { whole: true })}. Ask the owner to decide.
            </p>
          )}
          <Button
            variant="success"
            disabled={overLimit}
            loading={decide.isPending && decide.variables?.decision === "approve"}
            onClick={() => decide.mutate({ decision: "approve" })}
          >
            <Check aria-hidden /> Approve {isPrice && formatINR(a.requested_paise)}
          </Button>
          {isPrice && (
            <Button variant="outline" disabled={overLimit} onClick={() => setCounterOpen(true)}>
              Counter…
            </Button>
          )}
          <Button variant="ghost" className="text-danger" onClick={() => setRejectOpen(true)}>
            <X aria-hidden /> Reject
          </Button>
        </div>
      )}

      <Dialog open={counterOpen} onOpenChange={setCounterOpen}>
        <DialogContent
          title="Counter offer"
          description={`Between your hard minimum ${formatINR(a.hard_minimum_paise)} and floor ${formatINR(a.permitted_paise)}. The AI will offer this price to the buyer.`}
        >
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const p = rupeesToPaise(counter);
              if (!Number.isFinite(p) || p <= 0) {
                setFieldError("Enter a price in rupees");
                return;
              }
              setFieldError(undefined);
              decide.mutate({ decision: "counter", counter: p, note: note || undefined });
            }}
          >
            <Field label="Counter price per unit (₹)" htmlFor={`counter-${a.id}`} error={fieldError}>
              <Input
                id={`counter-${a.id}`}
                inputMode="decimal"
                value={counter}
                onChange={(e) => setCounter(e.target.value)}
                placeholder={a.permitted_paise ? String(a.permitted_paise / 100) : ""}
                aria-invalid={!!fieldError}
                autoFocus
              />
            </Field>
            {counter && Number.isFinite(rupeesToPaise(counter)) && (
              <p className="text-xs text-muted-foreground">
                Deal value {formatINR(rupeesToPaise(counter) * (a.qty ?? 1), { whole: true })} · margin{" "}
                {margin(rupeesToPaise(counter))}
              </p>
            )}
            <Field label="Note (optional)" htmlFor={`counter-note-${a.id}`}>
              <Input id={`counter-note-${a.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCounterOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={decide.isPending}>
                Send counter
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent title="Reject request" description="The AI will tell the buyer politely and hold the floor price.">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              decide.mutate({ decision: "reject", note: note || undefined });
            }}
          >
            <Field label="Reason (optional, internal)" htmlFor={`reject-note-${a.id}`}>
              <Textarea id={`reject-note-${a.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" loading={decide.isPending}>
                Reject
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
