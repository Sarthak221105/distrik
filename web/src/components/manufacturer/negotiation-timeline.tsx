"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bot, Building2, Scale, User } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import { formatDateTime, formatINR, titleCase } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/domain/badges";
import { PriceGuardrailMeter } from "@/components/domain/price-guardrail-meter";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { unwrapList } from "@/components/manufacturer/hooks";
import type { Json } from "@/lib/database.types";

type Offer = {
  id: string;
  by_party: string;
  price_paise: number;
  qty: number;
  decision: string;
  counter_paise: number | null;
  rule_snapshot: Json;
  created_at: string;
};

type Negotiation = {
  id: string;
  qty: number;
  status: string;
  agreed_price_paise: number | null;
  last_floor_paise: number | null;
  created_at: string;
  product: { name: string; unit: string; sku: string; distributor_price_paise: number | null } | null;
  offers: Offer[];
  approvals: { id: string; status: string; kind: string; requested_paise: number | null; approved_price_paise: number | null }[];
};

function snap(o: Offer) {
  return (o.rule_snapshot && typeof o.rule_snapshot === "object" && !Array.isArray(o.rule_snapshot) ? o.rule_snapshot : {}) as Record<
    string,
    Json
  >;
}

const num = (v: Json | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));

const PARTY_ICON = { buyer: User, ai: Bot, manufacturer: Building2 } as const;

/** Every ask and answer with the rule applied, newest negotiation first. */
export function NegotiationTimeline({ prospectId }: { prospectId: string }) {
  const supabase = getSupabaseBrowser();
  const q = useQuery({
    queryKey: qk.negotiations(prospectId),
    queryFn: async () =>
      unwrapList(
        await supabase
          .from("negotiations")
          .select(
            "id, qty, status, agreed_price_paise, last_floor_paise, created_at, product:products(name, unit, sku, distributor_price_paise), offers:negotiation_offers(id, by_party, price_paise, qty, decision, counter_paise, rule_snapshot, created_at), approvals:human_approvals(id, status, kind, requested_paise, approved_price_paise)",
          )
          .eq("prospect_id", prospectId)
          .order("created_at", { ascending: false }),
      ) as unknown as Negotiation[],
  });

  if (q.isLoading) return <LoadingSkeleton rows={3} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data!.length === 0)
    return (
      <EmptyState
        icon={<Scale aria-hidden />}
        title="No price discussion yet"
        description="When the buyer asks for a price, every ask and the rule applied appear here."
      />
    );

  return (
    <div className="grid gap-6">
      {q.data!.map((n) => {
        const offers = [...n.offers].sort((a, b) => a.created_at.localeCompare(b.created_at));
        const lastAsk = [...offers].reverse().find((o) => o.by_party === "buyer");
        const s = lastAsk ? snap(lastAsk) : {};
        return (
          <section key={n.id} className="grid gap-3 rounded-lg border border-border p-4" aria-label={`Negotiation for ${n.product?.name ?? "product"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">
                  {n.product?.name ?? "Product"} <span className="font-normal text-muted-foreground">× {n.qty} {n.product?.unit}</span>
                </h3>
                <p className="text-xs text-muted-foreground">Started {formatDateTime(n.created_at)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={n.status} />
                {n.agreed_price_paise && <Badge tone="success">Agreed {formatINR(n.agreed_price_paise)}</Badge>}
              </div>
            </div>

            {lastAsk && (
              <div className="rounded-lg bg-surface-muted/60 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Latest buyer ask against the rules</p>
                <PriceGuardrailMeter
                  requested={lastAsk.price_paise}
                  floor={num(s.effective_floor_paise) ?? lastAsk.counter_paise ?? n.last_floor_paise}
                  hardMinimum={num(s.effective_hard_minimum_paise) ?? num(s.hard_minimum_paise)}
                  list={num(s.distributor_price_paise) ?? n.product?.distributor_price_paise}
                />
              </div>
            )}

            <ol className="grid gap-2">
              {offers.map((o) => {
                const r = snap(o);
                const Icon = PARTY_ICON[o.by_party as keyof typeof PARTY_ICON] ?? User;
                return (
                  <li key={o.id} className="grid gap-1 border-l-2 border-border pl-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                      <span className="font-medium">{titleCase(o.by_party)}</span>
                      <span className="tabular">{formatINR(o.price_paise)} × {o.qty}</span>
                      <StatusBadge status={o.decision} />
                      {o.counter_paise && o.decision !== "accept" && (
                        <span className="text-xs text-muted-foreground tabular">counter {formatINR(o.counter_paise)}</span>
                      )}
                      <time className="ml-auto text-xs text-muted-foreground" dateTime={o.created_at}>
                        {formatDateTime(o.created_at)}
                      </time>
                    </div>
                    {(r.effective_floor_paise !== undefined || r.reason !== undefined) && (
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer">
                          Rule applied{r.reason ? `: ${titleCase(String(r.reason))}` : ""}
                        </summary>
                        <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
                          {r.tier_qty_from != null && (
                            <div><dt className="inline">Tier from </dt><dd className="inline tabular">{String(r.tier_qty_from)} units</dd></div>
                          )}
                          {r.effective_floor_paise != null && (
                            <div><dt className="inline">Floor </dt><dd className="inline tabular">{formatINR(num(r.effective_floor_paise))}</dd></div>
                          )}
                          {r.effective_hard_minimum_paise != null && (
                            <div><dt className="inline">Hard min </dt><dd className="inline tabular">{formatINR(num(r.effective_hard_minimum_paise))}</dd></div>
                          )}
                          {r.max_discount_pct != null && (
                            <div><dt className="inline">Max discount </dt><dd className="inline tabular">{String(r.max_discount_pct)}%</dd></div>
                          )}
                          {r.distributor_price_paise != null && (
                            <div><dt className="inline">List </dt><dd className="inline tabular">{formatINR(num(r.distributor_price_paise))}</dd></div>
                          )}
                          {r.payment_terms != null && (
                            <div className="col-span-2"><dt className="inline">Terms </dt><dd className="inline">{String(r.payment_terms)}</dd></div>
                          )}
                          {r.approval_id != null && (
                            <div className="col-span-2">
                              <Link href={`/approvals?id=${String(r.approval_id)}`} className="text-primary hover:underline">
                                Approval decision
                              </Link>
                              {r.note ? ` · “${String(r.note)}”` : ""}
                            </div>
                          )}
                        </dl>
                      </details>
                    )}
                  </li>
                );
              })}
            </ol>

            {n.approvals.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-border pt-2 text-xs">
                {n.approvals.map((a) => (
                  <Link key={a.id} href={`/approvals?id=${a.id}`} className="inline-flex items-center gap-1 hover:underline">
                    {titleCase(a.kind)}: <StatusBadge status={a.status} />
                    {a.approved_price_paise ? <span className="tabular">at {formatINR(a.approved_price_paise)}</span> : null}
                  </Link>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
