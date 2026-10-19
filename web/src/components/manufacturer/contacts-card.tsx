"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, ShieldCheck, ShieldOff, Star } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { formatDateTime, formatPhone, titleCase } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { ConsentTag, consentHelp } from "@/components/domain/badges";
import { ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { unwrapList } from "@/components/manufacturer/hooks";
import type { Json } from "@/lib/database.types";

type ContactRow = {
  id: string;
  name: string | null;
  role: string | null;
  phone_e164: string | null;
  email: string | null;
  is_primary: boolean;
  erased_at: string | null;
  consents: { status: string; channel: string; source: string | null; evidence: Json; changed_at: string }[];
};

export const contactsKey = (prospectId: string) => ["contacts", prospectId] as const;

const OPT_IN_SOURCES = [
  { value: "website_form", label: "Website or enquiry form" },
  { value: "whatsapp_reply", label: "Replied YES on WhatsApp" },
  { value: "qr_code", label: "Scanned a QR code" },
  { value: "written_consent", label: "Signed or written consent" },
  { value: "existing_customer", label: "Existing customer record" },
  { value: "trade_show", label: "Trade show sign-up" },
];

/** Contacts with consent state; opt ins need evidence, opt outs apply at once. */
export function ContactsCard({ prospectId, onConsentChange }: { prospectId: string; onConsentChange?: () => void }) {
  const supabase = getSupabaseBrowser();
  const [optIn, setOptIn] = useState<ContactRow | null>(null);
  const [optOut, setOptOut] = useState<ContactRow | null>(null);
  const [source, setSource] = useState(OPT_IN_SOURCES[0]!.value);
  const [note, setNote] = useState("");
  const [form, setForm] = useState("");
  const [fieldError, setFieldError] = useState<string>();

  const contacts = useQuery({
    queryKey: contactsKey(prospectId),
    queryFn: async () =>
      unwrapList(
        await supabase
          .from("contacts")
          .select("id, name, role, phone_e164, email, is_primary, erased_at, consents(status, channel, source, evidence, changed_at)")
          .eq("prospect_id", prospectId)
          .order("is_primary", { ascending: false }),
      ) as unknown as ContactRow[],
  });

  const setConsent = useRpc(
    async (vars: { contact: string; status: "opted_in" | "opted_out"; source: string; evidence: Record<string, string> }) =>
      unwrap(
        await supabase.rpc("set_consent", {
          p_contact: vars.contact,
          p_status: vars.status,
          p_source: vars.source,
          p_evidence: vars.evidence as Json,
        }),
      ),
    {
      invalidate: [contactsKey(prospectId), ["consent"]],
      success: (_d, v) => (v.status === "opted_in" ? "Opt in recorded with evidence" : "Opt out applied. Queued messages were cancelled."),
      onSuccess: () => {
        setOptIn(null);
        setOptOut(null);
        setNote("");
        setForm("");
        setFieldError(undefined);
        onConsentChange?.();
      },
      onError: (e) => setFieldError(e.field === "evidence" ? e.message : undefined),
    },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contacts and consent</CardTitle>
      </CardHeader>
      <CardContent>
        {contacts.isLoading ? (
          <LoadingSkeleton rows={2} />
        ) : contacts.error ? (
          <ErrorState error={contacts.error} onRetry={() => contacts.refetch()} />
        ) : contacts.data!.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contacts found for this business yet.</p>
        ) : (
          <ul className="grid gap-4">
            {contacts.data!.map((c) => {
              const consent = c.consents.find((x) => x.channel === "whatsapp");
              const status = consent?.status ?? "none";
              const evidence = (consent?.evidence ?? {}) as Record<string, unknown>;
              return (
                <li key={c.id} className="grid gap-2 border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        {c.erased_at ? "Erased contact" : (c.name ?? "Unnamed contact")}
                        {c.is_primary && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground">
                            <Star className="size-3" aria-hidden /> Primary
                          </span>
                        )}
                      </p>
                      {c.role && <p className="text-xs text-muted-foreground">{c.role}</p>}
                    </div>
                    <ConsentTag status={status} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {c.phone_e164 && (
                      <a href={`tel:${c.phone_e164}`} className="inline-flex items-center gap-1 tabular hover:underline">
                        <Phone className="size-3.5 text-muted-foreground" aria-hidden />
                        {formatPhone(c.phone_e164)}
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:underline">
                        <Mail className="size-3.5 text-muted-foreground" aria-hidden />
                        {c.email}
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {consentHelp(status)}
                    {consent?.source ? ` · source: ${titleCase(consent.source)}` : ""}
                    {consent?.changed_at ? ` · ${formatDateTime(consent.changed_at)}` : ""}
                    {typeof evidence.note === "string" && evidence.note ? ` · “${evidence.note}”` : ""}
                  </p>
                  {!c.erased_at && (
                    <div className="flex flex-wrap gap-2">
                      {status !== "opted_in" && (
                        <Button size="sm" variant="outline" onClick={() => setOptIn(c)}>
                          <ShieldCheck aria-hidden /> Record opt in
                        </Button>
                      )}
                      {status !== "opted_out" && (
                        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setOptOut(c)}>
                          <ShieldOff aria-hidden /> Record opt out
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!optIn} onOpenChange={(o) => !o && setOptIn(null)}>
        <DialogContent
          title={`Record opt in for ${optIn?.name ?? "contact"}`}
          description="WhatsApp policy and the DPDP Act need evidence of how the contact agreed. This is stored with the consent."
        >
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) {
                setFieldError("Describe the evidence, for example the form name and date");
                return;
              }
              setConsent.mutate({
                contact: optIn!.id,
                status: "opted_in",
                source,
                evidence: { note: note.trim(), ...(form.trim() ? { form: form.trim() } : {}) },
              });
            }}
          >
            <Field label="How did they opt in?" htmlFor="optin-source">
              <NativeSelect id="optin-source" value={source} onChange={(e) => setSource(e.target.value)}>
                {OPT_IN_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Evidence" htmlFor="optin-note" error={fieldError}>
              <Textarea
                id="optin-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-invalid={!!fieldError}
                placeholder="Filled the dealer enquiry form on 12 Oct and ticked “Contact me on WhatsApp”"
              />
            </Field>
            <Field label="Form or reference (optional)" htmlFor="optin-form">
              <Input id="optin-form" value={form} onChange={(e) => setForm(e.target.value)} placeholder="Form ID, URL or document number" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOptIn(null)}>Cancel</Button>
              <Button type="submit" loading={setConsent.isPending}>Record opt in</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!optOut} onOpenChange={(o) => !o && setOptOut(null)}>
        <DialogContent
          title={`Record opt out for ${optOut?.name ?? "contact"}`}
          description="Takes effect immediately: queued messages and follow ups are cancelled and nothing more is sent on WhatsApp."
        >
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setConsent.mutate({ contact: optOut!.id, status: "opted_out", source: "manual", evidence: note.trim() ? { note: note.trim() } : {} });
            }}
          >
            <Field label="Note (optional)" htmlFor="optout-note">
              <Textarea id="optout-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Asked on a call not to be contacted" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOptOut(null)}>Cancel</Button>
              <Button type="submit" variant="danger" loading={setConsent.isPending}>Apply opt out</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
