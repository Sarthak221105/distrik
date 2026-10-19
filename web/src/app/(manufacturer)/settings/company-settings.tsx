"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { useRpc } from "@/hooks/use-rpc";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { unwrapList } from "@/components/manufacturer/hooks";
import type { Json, Tables } from "@/lib/database.types";

export const manufacturerKey = ["manufacturer"] as const;

export function useManufacturer() {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  return useQuery({
    enabled: !!viewer.manufacturerId,
    queryKey: manufacturerKey,
    queryFn: async () => unwrap(await supabase.from("manufacturers").select("*").eq("id", viewer.manufacturerId!).maybeSingle()),
  });
}

export function CompanySettings() {
  const m = useManufacturer();
  if (m.isLoading) return <LoadingSkeleton variant="detail" />;
  if (m.error) return <ErrorState error={m.error} onRetry={() => m.refetch()} />;
  if (!m.data) return <EmptyState title="Company not found" />;
  return <CompanyForm key={m.data.id} company={m.data} />;
}

type S = Record<string, Json>;

function CompanyForm({ company }: { company: Tables<"manufacturers"> }) {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const isOwner = viewer.role === "owner";
  const settings = (company.settings && typeof company.settings === "object" && !Array.isArray(company.settings) ? company.settings : {}) as S;
  const [f, setF] = useState({
    name: company.name,
    legal_name: company.legal_name ?? "",
    gstin: company.gstin ?? "",
    state: company.state,
    city: company.city ?? "",
    address: company.address ?? "",
    phone: company.phone ?? "",
    email: company.email ?? "",
    quote_prefix: company.quote_prefix,
    daily_outbound_cap: String(settings.daily_outbound_cap ?? 500),
    approval_expiry_hours: String(settings.approval_expiry_hours ?? 24),
    reorder_lead_days: String(settings.reorder_lead_days ?? 5),
    followup_cadence_days: Array.isArray(settings.followup_cadence_days) ? settings.followup_cadence_days.join(", ") : "1, 3, 7",
    quotation_validity_days: String(settings.quotation_validity_days ?? 15),
    default_payment_terms: String(settings.default_payment_terms ?? ""),
    shipping_note: String(settings.shipping_note ?? ""),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  const states = useQuery({
    queryKey: ["india-states"],
    queryFn: async () => unwrapList(await supabase.from("india_states").select("code, name").order("name")),
    staleTime: Infinity,
  });

  const save = useRpc(
    async () => {
      const cadence = f.followup_cadence_days.split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);
      return unwrap(
        await supabase
          .from("manufacturers")
          .update({
            name: f.name.trim(),
            legal_name: f.legal_name.trim() || null,
            gstin: f.gstin.trim().toUpperCase() || null,
            state: f.state,
            state_code: null,
            city: f.city.trim() || null,
            address: f.address.trim() || null,
            phone: f.phone.trim() || null,
            email: f.email.trim() || null,
            quote_prefix: f.quote_prefix.trim().toUpperCase(),
            settings: {
              ...settings,
              daily_outbound_cap: Number(f.daily_outbound_cap),
              approval_expiry_hours: Number(f.approval_expiry_hours),
              reorder_lead_days: Number(f.reorder_lead_days),
              followup_cadence_days: cadence,
              quotation_validity_days: Number(f.quotation_validity_days),
              default_payment_terms: f.default_payment_terms.trim(),
              shipping_note: f.shipping_note.trim(),
            } as Json,
          })
          .eq("id", company.id)
          .select("id")
          .single(),
      );
    },
    { invalidate: [manufacturerKey], success: "Company profile saved" },
  );

  function submit() {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = "Company name is required";
    if (f.gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(f.gstin.trim().toUpperCase())) e.gstin = "GSTIN is 15 characters: 2 digit state code then 13 letters or digits";
    if (!f.state) e.state = "Pick your state (used for CGST/SGST vs IGST)";
    if (!/^[A-Za-z0-9-]{1,10}$/.test(f.quote_prefix.trim())) e.quote_prefix = "Up to 10 letters, digits or dashes";
    const ints: [keyof typeof f, number, number][] = [
      ["daily_outbound_cap", 1, 100000],
      ["approval_expiry_hours", 1, 168],
      ["reorder_lead_days", 0, 60],
      ["quotation_validity_days", 1, 180],
    ];
    for (const [k, min, max] of ints) {
      const n = Number(f[k]);
      if (!Number.isInteger(n) || n < min || n > max) e[k] = `Whole number from ${min} to ${max}`;
    }
    if (!/^\s*\d+(\s*,\s*\d+)*\s*$/.test(f.followup_cadence_days)) e.followup_cadence_days = "Days separated by commas, e.g. 1, 3, 7";
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate(undefined);
  }

  const dis = !isOwner;

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {!isOwner && <p className="text-sm text-muted-foreground">Only the owner can edit the company profile.</p>}
      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>Printed on quotations. GSTIN and state decide the tax split.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Trade name" htmlFor="c-name" error={errors.name}>
            <Input id="c-name" disabled={dis} value={f.name} onChange={set("name")} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Legal name" htmlFor="c-legal">
            <Input id="c-legal" disabled={dis} value={f.legal_name} onChange={set("legal_name")} />
          </Field>
          <Field label="GSTIN" htmlFor="c-gstin" error={errors.gstin}>
            <Input id="c-gstin" disabled={dis} value={f.gstin} onChange={set("gstin")} className="font-mono uppercase" aria-invalid={!!errors.gstin} />
          </Field>
          <Field label="State" htmlFor="c-state" error={errors.state}>
            <NativeSelect id="c-state" disabled={dis} value={f.state} onChange={set("state")} aria-invalid={!!errors.state}>
              {!(states.data ?? []).some((s) => s.name === f.state) && <option value={f.state}>{f.state || "Select"}</option>}
              {(states.data ?? []).map((s) => <option key={s.code} value={s.name}>{s.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="City" htmlFor="c-city">
            <Input id="c-city" disabled={dis} value={f.city} onChange={set("city")} />
          </Field>
          <Field label="Quotation number prefix" htmlFor="c-prefix" error={errors.quote_prefix} hint={`Next quotation: ${f.quote_prefix || "Q"}/${new Date().getFullYear()}/…`}>
            <Input id="c-prefix" disabled={dis} value={f.quote_prefix} onChange={set("quote_prefix")} className="uppercase" aria-invalid={!!errors.quote_prefix} />
          </Field>
          <Field label="Address" htmlFor="c-address" className="sm:col-span-2">
            <Textarea id="c-address" disabled={dis} rows={2} value={f.address} onChange={set("address")} />
          </Field>
          <Field label="Phone" htmlFor="c-phone">
            <Input id="c-phone" disabled={dis} value={f.phone} onChange={set("phone")} />
          </Field>
          <Field label="Email" htmlFor="c-email">
            <Input id="c-email" disabled={dis} type="email" value={f.email} onChange={set("email")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sales operations</CardTitle>
          <CardDescription>How the AI paces outreach and how long decisions stay open.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Field label="Daily outbound message cap" htmlFor="c-cap" error={errors.daily_outbound_cap}>
            <Input id="c-cap" disabled={dis} inputMode="numeric" value={f.daily_outbound_cap} onChange={set("daily_outbound_cap")} aria-invalid={!!errors.daily_outbound_cap} />
          </Field>
          <Field label="Approval expiry (hours)" htmlFor="c-exp" error={errors.approval_expiry_hours}>
            <Input id="c-exp" disabled={dis} inputMode="numeric" value={f.approval_expiry_hours} onChange={set("approval_expiry_hours")} aria-invalid={!!errors.approval_expiry_hours} />
          </Field>
          <Field label="Reorder lead window (days)" htmlFor="c-lead" error={errors.reorder_lead_days}>
            <Input id="c-lead" disabled={dis} inputMode="numeric" value={f.reorder_lead_days} onChange={set("reorder_lead_days")} aria-invalid={!!errors.reorder_lead_days} />
          </Field>
          <Field label="Follow up cadence (days)" htmlFor="c-cad" error={errors.followup_cadence_days} hint="Each number is one follow up">
            <Input id="c-cad" disabled={dis} value={f.followup_cadence_days} onChange={set("followup_cadence_days")} aria-invalid={!!errors.followup_cadence_days} />
          </Field>
          <Field label="Quotation validity (days)" htmlFor="c-valid" error={errors.quotation_validity_days}>
            <Input id="c-valid" disabled={dis} inputMode="numeric" value={f.quotation_validity_days} onChange={set("quotation_validity_days")} aria-invalid={!!errors.quotation_validity_days} />
          </Field>
          <div />
          <Field label="Default payment terms" htmlFor="c-terms" className="sm:col-span-3">
            <Input id="c-terms" disabled={dis} value={f.default_payment_terms} onChange={set("default_payment_terms")} />
          </Field>
          <Field label="Shipping note on quotations" htmlFor="c-ship" className="sm:col-span-3">
            <Input id="c-ship" disabled={dis} value={f.shipping_note} onChange={set("shipping_note")} />
          </Field>
        </CardContent>
      </Card>
      {isOwner && (
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending}>Save company profile</Button>
        </div>
      )}
    </form>
  );
}
