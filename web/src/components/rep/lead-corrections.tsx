"use client";

import { useState } from "react";
import { Flag, PencilLine } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { useRpc } from "@/hooks/use-rpc";
import { useOnline } from "@/lib/offline/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import type { LeadContact, LeadRecord } from "@/lib/offline/types";

type Fields = { contact_name: string; phone: string; address: string; city: string; pincode: string };

/**
 * Reps correct the details of their own leads (update_prospect_details) or
 * send a questionable record back to the manufacturer's Lead Review
 * (flag_prospect). Both need a connection; the server checks the assignment.
 */
export function LeadCorrections({ lead, primary }: { lead: LeadRecord; primary: LeadContact | null }) {
  const supabase = getSupabaseBrowser();
  const online = useOnline();
  const initial: Fields = {
    contact_name: primary?.name ?? "",
    phone: primary?.phone_e164 ?? "",
    address: lead.address ?? "",
    city: lead.city ?? "",
    pincode: lead.pincode ?? "",
  };
  const [fields, setFields] = useState<Fields>(initial);
  const [fieldError, setFieldError] = useState<{ field?: string; message: string } | null>(null);
  const [reason, setReason] = useState("");
  const [flagError, setFlagError] = useState<string | null>(null);

  const changed = (Object.keys(fields) as (keyof Fields)[]).filter((k) => fields[k].trim() !== initial[k].trim());

  const save = useRpc(
    async () =>
      unwrap(
        await supabase.rpc("update_prospect_details", {
          p_id: lead.id,
          p_fields: Object.fromEntries(changed.map((k) => [k, fields[k].trim()])),
          p_reason: "Corrected by the assigned rep",
        }),
      ),
    {
      invalidate: [qk.prospect(lead.id)],
      success: "Details updated",
      onSuccess: () => setFieldError(null),
      onError: (e) => setFieldError({ field: e.field, message: e.message }),
      silentError: true,
    },
  );

  const flag = useRpc(
    async () => unwrap(await supabase.rpc("flag_prospect", { p_id: lead.id, p_reason: reason.trim() })),
    {
      invalidate: [qk.prospect(lead.id)],
      success: "Sent back to Lead Review. Your manager has been told.",
      onSuccess: () => {
        setReason("");
        setFlagError(null);
      },
      onError: (e) => setFlagError(e.message),
      silentError: true,
    },
  );

  const err = (k: keyof Fields) => (fieldError?.field === k ? fieldError.message : undefined);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PencilLine className="size-4" aria-hidden /> Correct details
          </CardTitle>
          <CardDescription>Fix a wrong number, name or address you found on a call.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (changed.length) save.mutate(undefined);
            }}
          >
            <Field label="Contact name" htmlFor="fix-contact" error={err("contact_name")}>
              <Input id="fix-contact" value={fields.contact_name} onChange={(e) => setFields({ ...fields, contact_name: e.target.value })} />
            </Field>
            <Field label="Mobile number" htmlFor="fix-phone" error={err("phone")}>
              <Input id="fix-phone" inputMode="tel" value={fields.phone} onChange={(e) => setFields({ ...fields, phone: e.target.value })} />
            </Field>
            <Field label="Address" htmlFor="fix-address" error={err("address")}>
              <Input id="fix-address" value={fields.address} onChange={(e) => setFields({ ...fields, address: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City" htmlFor="fix-city" error={err("city")}>
                <Input id="fix-city" value={fields.city} onChange={(e) => setFields({ ...fields, city: e.target.value })} />
              </Field>
              <Field label="PIN code" htmlFor="fix-pin" error={err("pincode")}>
                <Input id="fix-pin" inputMode="numeric" value={fields.pincode} onChange={(e) => setFields({ ...fields, pincode: e.target.value })} />
              </Field>
            </div>
            {fieldError && !fieldError.field && (
              <p className="text-sm text-danger" role="alert">
                {fieldError.message}
              </p>
            )}
            <Button type="submit" size="lg" loading={save.isPending} disabled={!online || changed.length === 0}>
              {online ? "Save corrections" : "Corrections need a connection"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="size-4" aria-hidden /> Something wrong with this lead?
          </CardTitle>
          <CardDescription>
            Wrong business, not a buyer, or a duplicate? Send it back to Lead Review. Outreach pauses until a reviewer decides.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim().length < 3) {
                setFlagError("Say what looks wrong");
                return;
              }
              flag.mutate(undefined);
            }}
          >
            <Field label="What looks wrong?" htmlFor="flag-reason" error={flagError ?? undefined}>
              <Textarea id="flag-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </Field>
            <Button type="submit" variant="outline" size="lg" loading={flag.isPending} disabled={!online}>
              Send back to Lead Review
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
