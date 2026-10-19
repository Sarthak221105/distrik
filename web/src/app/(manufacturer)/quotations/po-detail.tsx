"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, RotateCw } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatDateTime } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { useRealtime } from "@/hooks/use-realtime";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { MatchStatusBadge, StatusBadge } from "@/components/domain/badges";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { SignedFileFrame } from "@/components/manufacturer/files";
import { POMatchTable } from "@/components/manufacturer/po-match-table";
import { QuotationPreview } from "@/components/manufacturer/quotation-preview";
import { trackEvent, useTrackScreen } from "@/components/manufacturer/hooks";

export function PoDetail({ poId }: { poId: string }) {
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  const viewer = useViewer();
  useTrackScreen("po_detail", { po_id: poId });
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string>();

  const key = [...qk.purchaseOrders({ id: poId })];
  const po = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(
        await supabase
          .from("purchase_orders")
          .select("*, prospect:prospects(id, name, city), quotation:quotations(*), order:orders(id, number)")
          .eq("id", poId)
          .maybeSingle(),
      ),
  });

  useRealtime({ table: "purchase_orders", filter: `id=eq.${poId}`, invalidate: [key] });
  useRealtime({ table: "quotations", invalidate: [key] });

  const rematch = useRpc(async () => unwrap(await supabase.rpc("match_purchase_order", { p_po: poId })), {
    invalidate: [qk.purchaseOrders()],
    success: (s) => `Match re-run: ${String(s).replace(/_/g, " ")}`,
  });

  const confirm = useRpc(
    async (overrideReason: string | null) =>
      unwrap(await supabase.rpc("confirm_order", { p_po: poId, p_override_reason: overrideReason ?? undefined })),
    {
      invalidate: [qk.purchaseOrders(), qk.orders(), qk.quotations(), qk.prospects()],
      success: "Order created. Shipment and payment tracking have started.",
      onSuccess: (orderId, r) => {
        void trackEvent(viewer, "order_confirmed", { po_id: poId, order_id: orderId, override: !!r });
        router.push(`/orders?id=${orderId}`);
      },
      onError: (e) => setReasonError(e.field === "override_reason" ? e.message : undefined),
    },
  );

  if (po.isLoading) return <LoadingSkeleton variant="detail" />;
  if (po.error) return <ErrorState error={po.error} onRetry={() => po.refetch()} />;
  if (!po.data)
    return (
      <EmptyState
        title="Purchase order not found"
        action={
          <Button asChild variant="outline">
            <Link href="/quotations?tab=pos">Back to purchase orders</Link>
          </Button>
        }
      />
    );

  const p = po.data;
  const prospect = p.prospect as { id: string; name: string; city: string | null } | null;
  const quotation = p.quotation as import("@/lib/database.types").Tables<"quotations"> | null;
  const order = (Array.isArray(p.order) ? p.order[0] : p.order) as { id: string; number: string } | null | undefined;
  const parsed = (p.parsed ?? {}) as Record<string, unknown>;
  const matched = p.match_status === "matched";
  const confirmed = p.status === "confirmed";

  const confirmButton = (
    <Button variant={matched ? "success" : "accent"} disabled={!quotation}>
      <CheckCircle2 aria-hidden /> {matched ? "Confirm order" : "Confirm with override"}
    </Button>
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        back={
          <Link href="/quotations?tab=pos" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <ArrowLeft className="size-3" aria-hidden /> Purchase orders
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            PO {String(parsed.po_number ?? "")} <MatchStatusBadge status={p.match_status} /> <StatusBadge status={p.status} />
          </span>
        }
        description={
          <>
            {prospect ? (
              <Link href={`/prospects/${prospect.id}`} className="hover:underline">
                {prospect.name}
              </Link>
            ) : (
              "Buyer"
            )}
            {" · received "}
            {formatDateTime(p.created_at)}
            {p.confidence !== null ? ` · read with ${Math.round(Number(p.confidence) * 100)}% confidence` : ""}
          </>
        }
        actions={
          confirmed ? (
            order ? (
              <Button asChild variant="outline">
                <Link href={`/orders?id=${order.id}`}>View order {order.number}</Link>
              </Button>
            ) : null
          ) : (
            <>
              <Button variant="outline" loading={rematch.isPending} onClick={() => rematch.mutate(undefined)}>
                <RotateCw aria-hidden /> Re-run match
              </Button>
              {matched ? (
                <ConfirmDialog
                  trigger={confirmButton}
                  title="Confirm this order?"
                  description="The PO matches the quotation. An order is created, the buyer becomes a customer and shipment and payment tracking start."
                  confirmLabel="Create order"
                  variant="success"
                  onConfirm={() => confirm.mutateAsync(null)}
                />
              ) : (
                <ConfirmDialog
                  trigger={confirmButton}
                  title="Confirm a PO that does not match"
                  description="The order is created from the quotation, not the PO. Your reason and the differences are written to the audit log with your name."
                  confirmLabel="Log override and create order"
                  variant="danger"
                  onConfirm={() => {
                    if (reason.trim().length < 5) {
                      setReasonError("Give a reason of at least 5 characters");
                      throw new Error("reason");
                    }
                    setReasonError(undefined);
                    return confirm.mutateAsync(reason.trim());
                  }}
                >
                  <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                    <p>
                      This PO is <strong>{p.match_status.replace(/_/g, " ")}</strong>. Confirm only if you have agreed the differences with the buyer.
                    </p>
                  </div>
                  <Field label="Override reason (logged)" htmlFor="override-reason" error={reasonError}>
                    <Textarea
                      id="override-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      aria-invalid={!!reasonError}
                      placeholder="Buyer confirmed on call that 30 cartons at the quoted price is final"
                    />
                  </Field>
                </ConfirmDialog>
              )}
            </>
          )
        }
      />

      {!matched && !confirmed && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <p>
            {p.match_status === "pending"
              ? "The AI is still reading this PO. The match appears here automatically."
              : p.match_status === "needs_review"
                ? "Some fields were read with low confidence or there is no quotation to compare. Check the file before confirming."
                : "This PO differs from the quotation. It is never resolved automatically: confirm with an override reason, or ask the buyer for a corrected PO."}
          </p>
        </div>
      )}
      {p.error && <p className="text-sm text-danger">Reading error: {p.error}</p>}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Buyer&apos;s PO</CardTitle>
          </CardHeader>
          <CardContent>
            <SignedFileFrame path={p.file_path} fallbackBucket="purchase-orders" mime={p.mime_type} title={`Purchase order ${String(parsed.po_number ?? "")}`} />
          </CardContent>
        </Card>
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Check against the quotation</CardTitle>
            </CardHeader>
            <CardContent>
              <POMatchTable
                diffs={p.diffs}
                parsed={p.parsed}
                fieldConfidence={p.field_confidence}
                quotationLines={quotation?.lines}
                quotationTotal={quotation?.total_paise}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Quotation</CardTitle>
            </CardHeader>
            <CardContent>
              {quotation ? (
                <QuotationPreview quotation={quotation} />
              ) : (
                <p className="text-sm text-muted-foreground">No sent quotation is linked to this PO, so it cannot be confirmed yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
