"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bot, FileCheck2, FileText, Gavel, Scale, ShieldAlert, UserCheck } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { formatDateTime, formatINR, titleCase } from "@/lib/format";
import { StatusBadge, MatchStatusBadge } from "@/components/domain/badges";
import { ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { unwrapList } from "@/components/manufacturer/hooks";

const AUDIT_ACTIONS = ["propose_price", "request_approval", "settle_and_quote", "decide_approval", "escalate_to_human", "validator_block", "send_quotation"];

function Step({ icon: Icon, title, children }: { icon: typeof Bot; title: string; children: React.ReactNode }) {
  return (
    <li className="relative grid gap-1 border-l-2 border-border pb-4 pl-5 last:pb-0">
      <span className="absolute -left-[9px] top-0 flex size-4 items-center justify-center rounded-full bg-surface">
        <Icon className="size-3.5 text-primary" aria-hidden />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <div className="text-sm text-muted-foreground">{children}</div>
    </li>
  );
}

/**
 * One audit view (PRD 10): order -> PO -> quotation -> negotiation ->
 * approvals -> AI actions, so every order traces back to the rule applied.
 */
export function OrderAuditTrail({ orderId }: { orderId: string }) {
  const supabase = getSupabaseBrowser();
  const q = useQuery({
    queryKey: ["order-audit", orderId],
    queryFn: async () => {
      const order = unwrap(
        await supabase
          .from("orders")
          .select("id, number, confirmed_at, confirmed_by, override_reason, quotation_id, po_id, prospect_id")
          .eq("id", orderId)
          .single(),
      );
      if (!order) throw new Error("Order not found");
      const [po, quote] = await Promise.all([
        order.po_id
          ? supabase.from("purchase_orders").select("id, match_status, created_at, parsed, diffs").eq("id", order.po_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        order.quotation_id
          ? supabase
              .from("quotations")
              .select("id, number, version, status, total_paise, created_at, negotiation_id")
              .eq("id", order.quotation_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      const quotation = unwrap(quote);
      let negotiation = null;
      let approvals: { id: string; kind: string; status: string; requested_paise: number | null; approved_price_paise: number | null; decided_at: string | null; decision_note: string | null }[] = [];
      let actions: { id: string; agent: string; action_type: string; rule_checked: string | null; outcome: string | null; created_at: string; prompt_version: number | null; model: string | null }[] = [];
      if (quotation?.negotiation_id) {
        negotiation = unwrap(
          await supabase
            .from("negotiations")
            .select("id, qty, status, agreed_price_paise, conversation_id, created_at, product:products(name), offers:negotiation_offers(id, by_party, price_paise, decision, created_at)")
            .eq("id", quotation.negotiation_id)
            .maybeSingle(),
        );
        approvals = unwrapList(
          await supabase
            .from("human_approvals")
            .select("id, kind, status, requested_paise, approved_price_paise, decided_at, decision_note")
            .eq("negotiation_id", quotation.negotiation_id)
            .order("created_at"),
        );
        if (negotiation?.conversation_id) {
          actions = unwrapList(
            await supabase
              .from("ai_actions")
              .select("id, agent, action_type, rule_checked, outcome, created_at, prompt_version, model")
              .eq("conversation_id", negotiation.conversation_id)
              .in("action_type", AUDIT_ACTIONS)
              .order("created_at")
              .limit(50),
          );
        }
      }
      return { order, po: unwrap(po), quotation, negotiation, approvals, actions };
    },
  });

  if (q.isLoading) return <LoadingSkeleton rows={4} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { order, po, quotation, negotiation, approvals, actions } = q.data!;
  const offers = [...((negotiation?.offers as { id: string; by_party: string; price_paise: number; decision: string; created_at: string }[] | undefined) ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const product = negotiation?.product as { name: string } | null | undefined;


  return (
    <ol className="grid" aria-label="Audit trail">
      <Step icon={FileCheck2} title={`Order ${order.number} confirmed`}>
        {formatDateTime(order.confirmed_at)}
        {order.override_reason && (
          <p className="mt-1 flex items-start gap-1 text-warning">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Override logged: “{order.override_reason}”
          </p>
        )}
      </Step>
      {po && (
        <Step icon={FileText} title="Purchase order">
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link href={`/quotations?po=${po.id}`} className="text-primary hover:underline">
              {String((po.parsed as Record<string, unknown> | null)?.po_number ?? "PO")}
            </Link>
            <MatchStatusBadge status={po.match_status} />
            {Array.isArray(po.diffs) && po.diffs.length > 0 && <span>{po.diffs.length} differences</span>}
            · {formatDateTime(po.created_at)}
          </span>
        </Step>
      )}
      {quotation && (
        <Step icon={FileText} title={`Quotation ${quotation.number} v${quotation.version}`}>
          <span className="inline-flex flex-wrap items-center gap-2">
            {formatINR(quotation.total_paise)} <StatusBadge status={quotation.status} /> · {formatDateTime(quotation.created_at)}
          </span>
        </Step>
      )}
      {negotiation ? (
        <Step icon={Scale} title={`Negotiation: ${product?.name ?? "product"} × ${negotiation.qty}`}>
          <ul className="grid gap-0.5">
            {offers.map((o) => (
              <li key={o.id} className="tabular">
                {titleCase(o.by_party)} {formatINR(o.price_paise)} → {o.decision.replace(/_/g, " ")} · {formatDateTime(o.created_at)}
              </li>
            ))}
          </ul>
        </Step>
      ) : (
        <Step icon={Scale} title="Negotiation">No negotiation linked (manual quotation).</Step>
      )}
      {approvals.length > 0 && (
        <Step icon={UserCheck} title="Human approvals">
          <ul className="grid gap-0.5">
            {approvals.map((a) => (
              <li key={a.id}>
                <Link href={`/approvals?id=${a.id}`} className="text-primary hover:underline">{titleCase(a.kind)}</Link>: {a.status}
                {a.approved_price_paise ? ` at ${formatINR(a.approved_price_paise)}` : ""}
                {a.decided_at ? ` · ${formatDateTime(a.decided_at)}` : ""}
                {a.decision_note ? ` · “${a.decision_note}”` : ""}
              </li>
            ))}
          </ul>
        </Step>
      )}
      <Step icon={Bot} title="AI actions and rules checked">
        {actions.length === 0 ? (
          "No AI actions recorded for this deal."
        ) : (
          <ul className="grid gap-0.5">
            {actions.map((a) => (
              <li key={a.id} className="font-mono text-xs">
                {a.agent}.{a.action_type}
                {a.outcome ? ` → ${a.outcome}` : ""}
                {a.rule_checked ? ` · rule: ${a.rule_checked}` : ""}
                {a.prompt_version ? ` · prompt v${a.prompt_version}` : ""} · {formatDateTime(a.created_at)}
              </li>
            ))}
          </ul>
        )}
      </Step>
      <Step icon={Gavel} title="Pricing authority">Every price above came from evaluate_offer or an approved exception.</Step>
    </ol>
  );
}
