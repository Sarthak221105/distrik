"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Search, ShieldOff, UserX } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { RpcError, unwrap } from "@/lib/errors";
import { invokeFn, toE164 } from "@/lib/edge";
import { formatDateTime, formatPhone, titleCase } from "@/lib/format";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/domain/states";

type EraseResult = { ok?: boolean; messages_erased?: number; media_deleted?: number; media_retained?: number };

type ContactMatch = {
  id: string;
  name: string | null;
  role: string | null;
  email: string | null;
  phone_e164: string | null;
  erased_at: string | null;
  prospect: { id: string; name: string; city: string | null; type: string } | null;
};

/**
 * DPDP erasure (owner only): find a contact by phone inside this company,
 * then erase their personal data and message content through erase-contact.
 */
export function PrivacySettings() {
  const viewer = useViewer();
  const supabase = getSupabaseBrowser();
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [eraseError, setEraseError] = useState<string | null>(null);
  const [result, setResult] = useState<(EraseResult & { name: string }) | null>(null);

  const matches = useQuery({
    enabled: !!phone,
    queryKey: ["privacy", "contact", phone],
    queryFn: async () =>
      (unwrap(
        await supabase
          .from("contacts")
          .select("id, name, role, email, phone_e164, erased_at, prospect:prospects(id, name, city, type)")
          .eq("phone_e164", phone!)
          .limit(10),
      ) ?? []) as unknown as ContactMatch[],
  });

  if (viewer.role !== "owner") {
    return <EmptyState icon={<ShieldOff aria-hidden />} title="Owner only" description="Only the owner can erase a contact's personal data." />;
  }

  async function erase(c: ContactMatch) {
    const r = reason.trim();
    if (r.length < 5) {
      setReasonError("Give the reason for erasure (at least 5 characters), for example the date of the buyer's request.");
      throw new Error("reason");
    }
    setReasonError(null);
    setEraseError(null);
    try {
      const res = await invokeFn<EraseResult>("erase-contact", { contact_id: c.id, reason: r });
      setResult({ ...res, name: c.name ?? c.prospect?.name ?? "Contact" });
      setReason("");
      await matches.refetch();
    } catch (e) {
      setEraseError(e instanceof RpcError ? e.message : "Erasure failed. Nothing was changed; try again.");
      throw e;
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserX className="size-4 text-muted-foreground" aria-hidden /> Erase a contact&apos;s personal data
          </CardTitle>
          <CardDescription>
            Under the Digital Personal Data Protection Act a buyer can ask you to erase their data. Erasure removes their name, phone, email and
            message text, and deletes media they sent unless it must be kept for tax records (for example a purchase order behind an invoice). Orders
            and invoices stay for your accounts. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const e164 = toE164(phoneInput);
              if (!e164) {
                setPhoneError("Enter a valid phone number, for example 98765 43210");
                return;
              }
              setPhoneError(null);
              setResult(null);
              setEraseError(null);
              setPhone(e164);
            }}
          >
            <Field label="Contact's phone number" htmlFor="privacy-phone" error={phoneError ?? undefined} className="min-w-64 flex-1">
              <Input id="privacy-phone" type="tel" value={phoneInput} aria-invalid={!!phoneError} onChange={(e) => setPhoneInput(e.target.value)} placeholder="+91 98765 43210" />
            </Field>
            <Button type="submit" variant="outline">
              <Search aria-hidden /> Find contact
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-success/40 bg-success-soft px-3 py-2 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <div>
            <p className="font-medium">{result.name}: personal data erased.</p>
            <p>
              {result.messages_erased ?? 0} message{result.messages_erased === 1 ? "" : "s"} erased · {result.media_deleted ?? 0} media file
              {result.media_deleted === 1 ? "" : "s"} deleted
              {(result.media_retained ?? 0) > 0 ? ` · ${result.media_retained} kept because they back an invoice or order (tax records)` : ""}.
            </p>
          </div>
        </div>
      )}

      {phone &&
        (matches.isLoading ? (
          <LoadingSkeleton rows={1} />
        ) : matches.error ? (
          <ErrorState error={matches.error} onRetry={() => matches.refetch()} />
        ) : (matches.data ?? []).length === 0 ? (
          <EmptyState title="No contact with this number" description={`Nobody in your company's records has ${formatPhone(phone)}.`} />
        ) : (
          <ul className="grid gap-3">
            {matches.data!.map((c) => (
              <li key={c.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="grid gap-0.5 text-sm">
                    <span className="font-medium">
                      {c.name ?? "Unnamed contact"}
                      {c.role ? `, ${c.role}` : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {[formatPhone(c.phone_e164), c.email, c.prospect ? `${c.prospect.name}${c.prospect.city ? `, ${c.prospect.city}` : ""} (${titleCase(c.prospect.type)})` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {c.erased_at && <span className="text-xs">Already erased on {formatDateTime(c.erased_at)}</span>}
                  </div>
                  {!c.erased_at && (
                    <ConfirmDialog
                      trigger={
                        <Button variant="danger" size="sm" onClick={() => setEraseError(null)}>
                          <UserX aria-hidden /> Erase personal data
                        </Button>
                      }
                      title={`Erase ${c.name ?? "this contact"}?`}
                      description="Their personal data and message content are erased permanently. This cannot be undone."
                      confirmLabel="Erase permanently"
                      variant="danger"
                      onConfirm={() => erase(c)}
                    >
                      <Field label="Reason for erasure" htmlFor={`erase-reason-${c.id}`} error={reasonError ?? undefined} hint="Recorded in the audit log, for example: buyer asked on WhatsApp on 12 Oct">
                        <Textarea id={`erase-reason-${c.id}`} value={reason} aria-invalid={!!reasonError} aria-required onChange={(e) => setReason(e.target.value)} rows={2} />
                      </Field>
                      {eraseError && (
                        <p className="text-sm text-danger" role="alert">
                          {eraseError}
                        </p>
                      )}
                    </ConfirmDialog>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
