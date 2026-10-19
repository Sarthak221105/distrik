"use client";

import { useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatDate, formatINR, titleCase } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Label, NativeSelect } from "@/components/ui/input";
import { Separator } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/domain/badges";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { OrderAuditTrail } from "@/components/manufacturer/order-audit-trail";
import { unwrapList, useTrackScreen } from "@/components/manufacturer/hooks";
import { istToday } from "@/components/manufacturer/time";
import type { Enums } from "@/lib/database.types";

const PAGE = 50;
const SHIPMENT: Enums<"shipment_status">[] = ["pending", "dispatched", "in_transit", "delivered"];
const PAYMENT: Enums<"payment_status">[] = ["due", "paid", "overdue"];

type OrderRow = {
  id: string;
  number: string;
  total_paise: number;
  status: string;
  ordered_on: string;
  override_reason: string | null;
  prospect: { id: string; name: string; city: string | null } | null;
  shipments: { status: Enums<"shipment_status">; carrier: string | null; tracking_ref: string | null }[];
  payments: { status: Enums<"payment_status">; due_date: string | null; amount_paise: number; reference: string | null }[];
};

export function OrdersClient({ initialOrderId }: { initialOrderId?: string }) {
  const supabase = getSupabaseBrowser();
  useTrackScreen("orders");
  const [open, setOpen] = useState<string | null>(initialOrderId ?? null);
  const [shipFilter, setShipFilter] = useState("");
  const [payFilter, setPayFilter] = useState("");

  const orders = useInfiniteQuery({
    queryKey: qk.orders({ view: "list", shipFilter, payFilter }),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const shipSel = shipFilter ? "shipments!inner(status, carrier, tracking_ref)" : "shipments(status, carrier, tracking_ref)";
      const paySel = payFilter ? "payments!inner(status, due_date, amount_paise, reference)" : "payments(status, due_date, amount_paise, reference)";
      let q = supabase
        .from("orders")
        .select(`id, number, total_paise, status, ordered_on, override_reason, prospect:prospects(id, name, city), ${shipSel}, ${paySel}`)
        .order("ordered_on", { ascending: false })
        .order("created_at", { ascending: false })
        .range(pageParam, pageParam + PAGE - 1);
      if (shipFilter) q = q.eq("shipments.status", shipFilter as Enums<"shipment_status">);
      if (payFilter) q = q.eq("payments.status", payFilter as Enums<"payment_status">);
      return unwrapList(await q) as unknown as OrderRow[];
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });

  const rows = orders.data?.pages.flat() ?? [];
  const today = istToday();

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Orders"
        description="Orders confirmed from purchase orders. Shipment and payment status are updated by hand in this version."
      />
      <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filters">
        <div className="grid gap-1">
          <Label htmlFor="of-ship" className="text-xs text-muted-foreground">Shipment</Label>
          <NativeSelect id="of-ship" className="w-40" value={shipFilter} onChange={(e) => setShipFilter(e.target.value)}>
            <option value="">All</option>
            {SHIPMENT.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="of-pay" className="text-xs text-muted-foreground">Payment</Label>
          <NativeSelect id="of-pay" className="w-40" value={payFilter} onChange={(e) => setPayFilter(e.target.value)}>
            <option value="">All</option>
            {PAYMENT.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </NativeSelect>
        </div>
      </div>

      {orders.isLoading ? (
        <LoadingSkeleton variant="table" rows={6} />
      ) : orders.error ? (
        <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Truck aria-hidden />}
          title={shipFilter || payFilter ? "No orders match these filters" : "No orders yet"}
          description={shipFilter || payFilter ? "Clear a filter to see more." : "Orders are created when you confirm a purchase order that matches its quotation."}
          action={
            !shipFilter && !payFilter ? (
              <Button asChild variant="outline"><Link href="/quotations?tab=pos">Review purchase orders</Link></Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <Table>
            <caption className="sr-only">Orders</caption>
            <THead>
              <TR>
                <TH scope="col">Order</TH>
                <TH scope="col">Buyer</TH>
                <TH scope="col" className="text-right">Total</TH>
                <TH scope="col">Ordered</TH>
                <TH scope="col">Shipment</TH>
                <TH scope="col">Payment</TH>
                <TH scope="col">Due</TH>
                <TH scope="col"><span className="sr-only">Open</span></TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((o) => {
                const ship = o.shipments[0];
                const pay = o.payments[0];
                const late = pay && pay.status === "due" && pay.due_date && pay.due_date < today;
                return (
                  <TR key={o.id}>
                    <TD className="font-medium tabular">
                      {o.number}
                      {o.override_reason && <span className="block text-xs font-normal text-warning">Override</span>}
                    </TD>
                    <TD>{o.prospect ? <Link href={`/prospects/${o.prospect.id}`} className="hover:underline">{o.prospect.name}</Link> : "–"}</TD>
                    <TD className="text-right tabular">{formatINR(o.total_paise)}</TD>
                    <TD className="whitespace-nowrap">{formatDate(o.ordered_on)}</TD>
                    <TD>{ship ? <StatusBadge status={ship.status} /> : "–"}</TD>
                    <TD>{pay ? <StatusBadge status={late ? "overdue" : pay.status} /> : "–"}</TD>
                    <TD className="whitespace-nowrap">{pay?.due_date ? formatDate(pay.due_date) : "–"}</TD>
                    <TD>
                      <Button size="sm" variant="outline" onClick={() => setOpen(o.id)}>Details</Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {orders.hasNextPage && (
            <div className="flex justify-center border-t border-border p-3">
              <Button variant="outline" loading={orders.isFetchingNextPage} onClick={() => orders.fetchNextPage()}>Load more</Button>
            </div>
          )}
        </Card>
      )}

      <OrderSheet orderId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function OrderSheet({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const supabase = getSupabaseBrowser();
  const q = useQuery({
    enabled: !!orderId,
    queryKey: qk.orders({ id: orderId }),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("orders")
          .select(
            "id, number, total_paise, status, ordered_on, override_reason, prospect:prospects(id, name), order_items(id, qty, unit_price_paise, tax_paise, line_total_paise, product:products(name, sku, unit)), shipments(status, carrier, tracking_ref, dispatched_at, delivered_at), payments(status, due_date, amount_paise, reference, paid_at)",
          )
          .eq("id", orderId!)
          .maybeSingle(),
      ),
  });
  const o = q.data;
  return (
    <Sheet open={!!orderId} onOpenChange={(v) => !v && onClose()} title={o ? `Order ${o.number}` : "Order"} description={o ? `${(o.prospect as { name: string } | null)?.name ?? ""} · ${formatDate(o.ordered_on)}` : undefined}>
      {q.isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !o ? (
        <EmptyState title="Order not found" />
      ) : (
        <OrderDetailBody key={o.id} order={o as unknown as OrderDetail} />
      )}
    </Sheet>
  );
}

type OrderDetail = {
  id: string;
  number: string;
  total_paise: number;
  order_items: { id: string; qty: number; unit_price_paise: number; tax_paise: number; line_total_paise: number; product: { name: string; sku: string; unit: string } | null }[];
  shipments: { status: Enums<"shipment_status">; carrier: string | null; tracking_ref: string | null; dispatched_at: string | null; delivered_at: string | null }[];
  payments: { status: Enums<"payment_status">; due_date: string | null; amount_paise: number; reference: string | null; paid_at: string | null }[];
};

function OrderDetailBody({ order: o }: { order: OrderDetail }) {
  const supabase = getSupabaseBrowser();
  const ship = o.shipments[0];
  const pay = o.payments[0];
  const [form, setForm] = useState({
    shipment: ship?.status ?? "pending",
    carrier: ship?.carrier ?? "",
    tracking: ship?.tracking_ref ?? "",
    payment: pay?.status ?? "due",
    paymentRef: pay?.reference ?? "",
  });

  const update = useRpc(
    async () =>
      unwrap(
        await supabase.rpc("update_order_status", {
          p_order: o.id,
          p_shipment: form.shipment as Enums<"shipment_status">,
          p_payment: form.payment as Enums<"payment_status">,
          p_tracking_ref: form.tracking.trim() || undefined,
          p_carrier: form.carrier.trim() || undefined,
          p_payment_ref: form.paymentRef.trim() || undefined,
        }),
      ),
    { invalidate: [qk.orders()], success: "Order status updated" },
  );

  return (
    <div className="grid gap-6">
      <section aria-labelledby="items-h" className="grid gap-2">
        <h3 id="items-h" className="text-sm font-semibold">Items</h3>
        <table className="w-full text-sm">
          <caption className="sr-only">Order items</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1.5 font-medium">Product</th>
              <th scope="col" className="py-1.5 text-right font-medium">Qty</th>
              <th scope="col" className="py-1.5 text-right font-medium">Rate</th>
              <th scope="col" className="py-1.5 text-right font-medium">GST</th>
              <th scope="col" className="py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {o.order_items.map((i) => (
              <tr key={i.id} className="border-b border-border">
                <td className="py-1.5">
                  {i.product?.name}
                  <span className="block text-xs text-muted-foreground">{i.product?.sku} · per {i.product?.unit}</span>
                </td>
                <td className="py-1.5 text-right tabular">{i.qty}</td>
                <td className="py-1.5 text-right tabular">{formatINR(i.unit_price_paise)}</td>
                <td className="py-1.5 text-right tabular">{formatINR(i.tax_paise)}</td>
                <td className="py-1.5 text-right tabular">{formatINR(i.line_total_paise)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1.5" colSpan={4}>Order total</td>
              <td className="py-1.5 text-right tabular">{formatINR(o.total_paise)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <Card>
        <CardHeader><CardTitle>Update shipment and payment</CardTitle></CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate(undefined);
            }}
          >
            <Field label="Shipment" htmlFor="u-ship">
              <NativeSelect id="u-ship" value={form.shipment} onChange={(e) => setForm((f) => ({ ...f, shipment: e.target.value as Enums<"shipment_status"> }))}>
                {SHIPMENT.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Carrier" htmlFor="u-carrier">
              <Input id="u-carrier" value={form.carrier} onChange={(e) => setForm((f) => ({ ...f, carrier: e.target.value }))} placeholder="VRL Logistics" />
            </Field>
            <Field label="Tracking / LR number" htmlFor="u-track" className="sm:col-span-2">
              <Input id="u-track" value={form.tracking} onChange={(e) => setForm((f) => ({ ...f, tracking: e.target.value }))} />
            </Field>
            <Field label="Payment" htmlFor="u-pay" hint={pay?.due_date ? `Due ${formatDate(pay.due_date)} · ${formatINR(pay.amount_paise)}` : undefined}>
              <NativeSelect id="u-pay" value={form.payment} onChange={(e) => setForm((f) => ({ ...f, payment: e.target.value as Enums<"payment_status"> }))}>
                {PAYMENT.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Payment reference (UTR / cheque)" htmlFor="u-payref">
              <Input id="u-payref" value={form.paymentRef} onChange={(e) => setForm((f) => ({ ...f, paymentRef: e.target.value }))} />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" loading={update.isPending}>Save status</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Separator />
      <section aria-labelledby="audit-h" className="grid gap-3">
        <h3 id="audit-h" className="text-sm font-semibold">Audit trail</h3>
        <p className="text-xs text-muted-foreground">How this order came about: PO, quotation, negotiation, approvals and the AI actions behind them.</p>
        <OrderAuditTrail orderId={o.id} />
      </section>
    </div>
  );
}
