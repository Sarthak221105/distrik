"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Building2, ClipboardList } from "lucide-react";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatDate } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";

const KEY = qk.system("tenants");

type TenantRow = {
  id: string;
  name: string;
  legal_name: string | null;
  city: string | null;
  state: string;
  gstin: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_display_number: string | null;
  created_at: string;
  users: number;
  products: number;
  campaigns: number;
  plan_code: string | null;
  billing_cycle: string | null;
  subscription_status: string | null;
};

export function TenantsView() {
  const supabase = getSupabaseBrowser();
  const [connecting, setConnecting] = useState<TenantRow | null>(null);

  const list = useQuery({
    queryKey: KEY,
    queryFn: async () =>
      // Counts only, via a system-admin function (no tenant business data).
      (unwrap(await supabase.rpc("sysadmin_tenants")) ?? []) as unknown as TenantRow[],
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Tenants"
        description="Manufacturers on the platform. New tenants sign up from the pricing page and are activated from Applications."
        actions={
          <Button asChild variant="outline">
            <Link href="/system/applications">
              <ClipboardList aria-hidden /> Applications
            </Link>
          </Button>
        }
      />

      {list.isLoading ? (
        <LoadingSkeleton variant="table" />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Building2 aria-hidden />}
          title="No tenants yet"
          description="Activate an application to create the first manufacturer."
          action={
            <Button asChild>
              <Link href="/system/applications">Review applications</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Manufacturer</TH>
                <TH>City · state</TH>
                <TH>Plan</TH>
                <TH>GSTIN</TH>
                <TH className="text-right">Users</TH>
                <TH className="text-right">Products</TH>
                <TH className="text-right">Campaigns</TH>
                <TH>WhatsApp</TH>
                <TH>Since</TH>
              </TR>
            </THead>
            <TBody>
              {list.data!.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <div className="font-medium">{m.name}</div>
                    {m.legal_name && m.legal_name !== m.name && <div className="text-xs text-muted-foreground">{m.legal_name}</div>}
                  </TD>
                  <TD className="text-xs">{[m.city, m.state].filter(Boolean).join(", ")}</TD>
                  <TD className="text-xs">
                    {m.plan_code ? (
                      <>
                        <div className="font-medium capitalize">{m.plan_code}</div>
                        <div className="capitalize text-muted-foreground">
                          {m.billing_cycle} · {m.subscription_status}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">No plan</span>
                    )}
                  </TD>
                  <TD className="font-mono text-xs">{m.gstin ?? "–"}</TD>
                  <TD className="text-right tabular">{m.users}</TD>
                  <TD className="text-right tabular">{m.products}</TD>
                  <TD className="text-right tabular">{m.campaigns}</TD>
                  <TD className="text-xs">
                    {m.whatsapp_phone_number_id ? (
                      <>
                        <div className="font-mono">{m.whatsapp_phone_number_id}</div>
                        <div className="text-muted-foreground">{m.whatsapp_display_number ?? ""}</div>
                      </>
                    ) : (
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone="warning">Not connected</Badge>
                        <Button variant="link" size="sm" onClick={() => setConnecting(m)}>
                          Connect
                        </Button>
                      </div>
                    )}
                  </TD>
                  <TD className="text-xs">{formatDate(m.created_at)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <ConnectWhatsAppDialog tenant={connecting} onClose={() => setConnecting(null)} />
    </div>
  );
}

function ConnectWhatsAppDialog({ tenant, onClose }: { tenant: TenantRow | null; onClose: () => void }) {
  const supabase = getSupabaseBrowser();
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [display, setDisplay] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const connect = useRpc(
    async (id: string) =>
      unwrap(
        await supabase.rpc("sysadmin_connect_whatsapp", {
          p_manufacturer: id,
          p_phone_number_id: phoneNumberId.trim(),
          p_display_number: display.trim() || undefined,
        }),
      ),
    {
      invalidate: [KEY, qk.system("manufacturers")],
      success: "WhatsApp connected",
      onSuccess: () => {
        setPhoneNumberId("");
        setDisplay("");
        onClose();
      },
      onError: (e) => e.field && setErrors({ [e.field]: e.message }),
    },
  );
  return (
    <Dialog open={!!tenant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Connect WhatsApp" description={tenant ? `Link ${tenant.name} to its WhatsApp Business number at the BSP.` : undefined}>
        {tenant && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!phoneNumberId.trim()) return setErrors({ whatsapp_phone_number_id: "Required" });
              setErrors({});
              connect.mutate(tenant.id);
            }}
          >
            <Field label="BSP phone number id" htmlFor="wa-id" error={errors.whatsapp_phone_number_id}>
              <Input id="wa-id" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} aria-invalid={!!errors.whatsapp_phone_number_id} />
            </Field>
            <Field label="Display number" htmlFor="wa-display" error={errors.whatsapp_display_number}>
              <Input
                id="wa-display"
                type="tel"
                value={display}
                placeholder={tenant.whatsapp_display_number ?? ""}
                onChange={(e) => setDisplay(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={connect.isPending}>
                Connect
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
