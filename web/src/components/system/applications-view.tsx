"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Inbox, XCircle } from "lucide-react";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { invokeFn } from "@/components/system/admin-utils";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatDateTime, formatINR, formatPhone } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { useRealtime } from "@/hooks/use-realtime";

const KEY = qk.system("applications");

type ApplicationStatus = "pending_payment" | "paid" | "active" | "rejected" | "cancelled";

type ApplicationRow = {
  id: string;
  status: ApplicationStatus;
  plan_code: string;
  billing_cycle: "monthly" | "yearly";
  amount_paise: number;
  company_name: string;
  legal_name: string | null;
  gstin: string | null;
  state: string;
  city: string | null;
  address: string | null;
  company_phone: string | null;
  company_email: string | null;
  whatsapp_display_number: string | null;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  terms_version: string;
  accepted_terms_at: string;
  manufacturer_id: string | null;
  activated_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  plans: { name: string } | null;
  subscription_payments: { status: string; provider: string; provider_ref: string | null; paid_at: string | null }[];
};

const STATUS: Record<ApplicationStatus, { label: string; tone: BadgeTone }> = {
  pending_payment: { label: "Awaiting payment", tone: "warning" },
  paid: { label: "Paid", tone: "info" },
  active: { label: "Active", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function ApplicationsView() {
  const supabase = getSupabaseBrowser();
  const [status, setStatus] = useState<"" | ApplicationStatus>("pending_payment");
  const [activating, setActivating] = useState<ApplicationRow | null>(null);
  const [rejecting, setRejecting] = useState<ApplicationRow | null>(null);

  const list = useQuery({
    queryKey: [...KEY, status],
    queryFn: async () => {
      let q = supabase
        .from("tenant_applications")
        .select("*, plans(name), subscription_payments(status, provider, provider_ref, paid_at)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (status) q = q.eq("status", status);
      return (unwrap(await q) ?? []) as unknown as ApplicationRow[];
    },
  });
  useRealtime({ table: "tenant_applications", invalidate: [KEY] });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Applications"
        description="Manufacturers who chose a plan on the website. Activating records the payment, creates the workspace and emails the owner a sign in link."
        actions={
          <NativeSelect aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-48">
            <option value="">All statuses</option>
            {(Object.keys(STATUS) as ApplicationStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS[s].label}
              </option>
            ))}
          </NativeSelect>
        }
      />

      {list.isLoading ? (
        <LoadingSkeleton variant="table" />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Inbox aria-hidden />}
          title="No applications here"
          description="New applications from the pricing page appear here as soon as they are submitted."
        />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Company</TH>
                <TH>Owner</TH>
                <TH>Plan</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH>Submitted</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {list.data!.map((a) => {
                const payment = a.subscription_payments[0];
                const open = a.status === "pending_payment" || a.status === "paid";
                return (
                  <TR key={a.id} data-testid={`application-${a.owner_email}`}>
                    <TD>
                      <div className="font-medium">{a.company_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[a.city, a.state].filter(Boolean).join(", ")}
                        {a.gstin && <> · <span className="font-mono">{a.gstin}</span></>}
                      </div>
                    </TD>
                    <TD className="text-xs">
                      <div className="text-sm font-medium">{a.owner_name}</div>
                      <div>{a.owner_email}</div>
                      <div className="text-muted-foreground">{formatPhone(a.owner_phone)}</div>
                    </TD>
                    <TD className="text-xs">
                      <div className="text-sm font-medium">{a.plans?.name ?? a.plan_code}</div>
                      <div className="capitalize text-muted-foreground">{a.billing_cycle}</div>
                    </TD>
                    <TD className="text-right tabular">{formatINR(a.amount_paise, { whole: true })}</TD>
                    <TD className="text-xs">
                      <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                      {payment?.provider_ref && <div className="mt-1 text-muted-foreground">Ref {payment.provider_ref}</div>}
                      {a.rejection_reason && <div className="mt-1 max-w-48 text-muted-foreground">{a.rejection_reason}</div>}
                    </TD>
                    <TD className="text-xs">
                      {formatDateTime(a.created_at)}
                      {a.activated_at && <div className="text-muted-foreground">Activated {formatDateTime(a.activated_at)}</div>}
                    </TD>
                    <TD className="text-right">
                      {open ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setRejecting(a)}>
                            Reject
                          </Button>
                          <Button size="sm" onClick={() => setActivating(a)}>
                            Activate
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}

      <ActivateDialog application={activating} onClose={() => setActivating(null)} />
      <RejectDialog application={rejecting} onClose={() => setRejecting(null)} />
    </div>
  );
}

function ActivateDialog({ application: a, onClose }: { application: ApplicationRow | null; onClose: () => void }) {
  const [ref, setRef] = useState("manual");
  const activate = useRpc(
    async (id: string) => invokeFn("activate-application", { application_id: id, payment_ref: ref.trim() || "manual" }),
    {
      invalidate: [KEY, qk.system("tenants"), qk.system("manufacturers")],
      success: "Workspace created. The owner has been emailed a sign in link.",
      onSuccess: onClose,
    },
  );
  return (
    <Dialog open={!!a} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Activate workspace"
        description="Online payment is not live yet, so record how this payment was received."
      >
        {a && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              activate.mutate(a.id);
            }}
          >
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-surface-muted p-3 text-sm">
              <dt className="text-muted-foreground">Company</dt>
              <dd className="font-medium">{a.company_name}</dd>
              <dt className="text-muted-foreground">Owner</dt>
              <dd>{a.owner_name} · {a.owner_email}</dd>
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="capitalize">
                {a.plans?.name ?? a.plan_code} · {a.billing_cycle} · {formatINR(a.amount_paise, { whole: true })}
              </dd>
            </dl>
            <Field label="Payment reference" htmlFor="activate-ref" hint="For example a UTR number, cheque number or 'manual'">
              <Input id="activate-ref" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={activate.isPending}>
                <CheckCircle2 aria-hidden /> Mark paid and activate
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ application: a, onClose }: { application: ApplicationRow | null; onClose: () => void }) {
  const supabase = getSupabaseBrowser();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const reject = useRpc(
    async (id: string) => unwrap(await supabase.rpc("reject_tenant_application", { p_application: id, p_reason: reason.trim() })),
    {
      invalidate: [KEY],
      success: "Application rejected",
      onSuccess: () => {
        setReason("");
        onClose();
      },
    },
  );
  return (
    <Dialog open={!!a} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Reject application" description={a ? `${a.company_name} will see that the application was not approved.` : undefined}>
        {a && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim().length < 3) return setError("Give a short reason");
              setError(undefined);
              reject.mutate(a.id);
            }}
          >
            <Field label="Reason" htmlFor="reject-reason" error={error}>
              <Textarea id="reject-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!error} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" loading={reject.isPending}>
                <XCircle aria-hidden /> Reject
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
