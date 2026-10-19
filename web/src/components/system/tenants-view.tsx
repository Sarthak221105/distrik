"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { JsonView, invokeFn } from "@/components/system/admin-utils";
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
};

export function TenantsView() {
  const supabase = getSupabaseBrowser();
  const [createOpen, setCreateOpen] = useState(false);

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
        description="Manufacturers on the platform. Creating a tenant also invites its owner."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden /> Create tenant
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
          description="Create the first manufacturer and invite its owner."
          action={<Button onClick={() => setCreateOpen(true)}>Create tenant</Button>}
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Manufacturer</TH>
                <TH>City · state</TH>
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
                      <Badge tone="warning">Not connected</Badge>
                    )}
                  </TD>
                  <TD className="text-xs">{formatDate(m.created_at)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <CreateTenantDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{13}$/;
const EMPTY = {
  name: "",
  legal_name: "",
  gstin: "",
  state: "",
  city: "",
  address: "",
  phone: "",
  email: "",
  whatsapp_phone_number_id: "",
  whatsapp_display_number: "",
  quote_prefix: "Q",
  owner_email: "",
  owner_name: "",
  owner_phone: "",
};

function CreateTenantDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const supabase = getSupabaseBrowser();
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<unknown>(null);

  const states = useQuery({
    enabled: open,
    queryKey: qk.system("india-states"),
    queryFn: async () => unwrap(await supabase.from("india_states").select("code, name").order("name")) ?? [],
    staleTime: Infinity,
  });

  const create = useRpc(
    async () => {
      const blank = (s: string) => s.trim() || undefined;
      return invokeFn("admin-users", {
        action: "create_tenant",
        manufacturer: {
          name: f.name.trim(),
          legal_name: blank(f.legal_name),
          gstin: blank(f.gstin.toUpperCase()),
          state: f.state,
          city: blank(f.city),
          address: blank(f.address),
          phone: blank(f.phone),
          email: blank(f.email),
          whatsapp_phone_number_id: blank(f.whatsapp_phone_number_id),
          whatsapp_display_number: blank(f.whatsapp_display_number),
          quote_prefix: blank(f.quote_prefix) ?? "Q",
        },
        owner: { email: f.owner_email.trim(), full_name: f.owner_name.trim(), phone: blank(f.owner_phone) },
      });
    },
    {
      invalidate: [KEY, qk.system("manufacturers")],
      success: "Tenant created. The owner gets an invite by email.",
      onSuccess: (data) => {
        setResult(data);
        setF(EMPTY);
      },
      onError: (e) => {
        if (e.field) setErrors({ [e.field.replace(/^(manufacturer|owner)\./, "")]: e.message });
      },
    },
  );

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Required";
    if (!f.state) e.state = "Required";
    if (f.gstin.trim() && !GSTIN_RE.test(f.gstin.trim().toUpperCase())) e.gstin = "GSTIN is 15 characters: 2 digits then 13 letters or digits";
    if (!/^\S+@\S+\.\S+$/.test(f.owner_email.trim())) e.owner_email = "A valid email is required";
    if (!f.owner_name.trim()) e.owner_name = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const input = (key: keyof typeof EMPTY, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} htmlFor={`ct-${key}`} error={errors[key]}>
      <Input id={`ct-${key}`} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} aria-invalid={!!errors[key]} {...props} />
    </Field>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setResult(null);
      }}
    >
      <DialogContent title="Create tenant" description="Sets up the manufacturer with conservative defaults and invites its owner." className="max-w-2xl">
        {result ? (
          <div className="grid gap-3">
            <p className="text-sm">The tenant was created. Details returned by the admin function:</p>
            <JsonView value={result} label="Create tenant result" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResult(null)}>
                Create another
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (validate()) create.mutate(undefined);
            }}
          >
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-semibold">Manufacturer</legend>
              {input("name", "Display name")}
              {input("legal_name", "Legal name")}
              {input("gstin", "GSTIN", { placeholder: "27ABCDE1234F1Z5", className: "uppercase" })}
              <Field label="State" htmlFor="ct-state" error={errors.state}>
                <NativeSelect id="ct-state" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} aria-invalid={!!errors.state}>
                  <option value="">Choose a state…</option>
                  {(states.data ?? []).map((s) => (
                    <option key={s.code} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {input("city", "City")}
              {input("phone", "Phone", { type: "tel" })}
              {input("email", "Company email", { type: "email" })}
              {input("quote_prefix", "Quotation prefix", { maxLength: 8 })}
              <Field label="Address" htmlFor="ct-address" className="sm:col-span-2">
                <Textarea id="ct-address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} rows={2} />
              </Field>
              {input("whatsapp_phone_number_id", "WhatsApp phone number id (BSP)")}
              {input("whatsapp_display_number", "WhatsApp display number", { type: "tel" })}
            </fieldset>
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-semibold">Owner</legend>
              {input("owner_name", "Full name")}
              {input("owner_email", "Email", { type: "email" })}
              {input("owner_phone", "Phone", { type: "tel" })}
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                Create tenant
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
