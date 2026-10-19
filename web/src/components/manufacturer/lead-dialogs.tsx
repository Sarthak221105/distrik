"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, GitMerge, Search, ShieldAlert } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { RpcError, unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatPhone, titleCase } from "@/lib/format";
import { toE164 } from "@/lib/edge";
import { useRpc } from "@/hooks/use-rpc";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FitScoreBadge, ReviewStatusBadge } from "@/components/domain/badges";
import { useTeam } from "@/components/manufacturer/hooks";
import {
  BUYER_TYPES,
  sanitizeSearch,
  skipReasonText,
  type BulkResult,
  type LeadContact,
} from "@/components/manufacturer/lead-shared";
import type { Json } from "@/lib/database.types";

/** Asks for a reason before a decision. The text survives errors. */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label = "Reason",
  hint,
  confirmLabel,
  variant = "default",
  minLength = 3,
  optional = false,
  pending,
  error,
  audited,
  children,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  hint?: string;
  confirmLabel: string;
  variant?: ButtonProps["variant"];
  minLength?: number;
  optional?: boolean;
  pending?: boolean;
  error?: string | null;
  audited?: boolean;
  children?: ReactNode;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  // Start empty each time the dialog opens; while it is open, errors keep the text.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setReason("");
      setLocalError(null);
    }
  }
  const shown = localError ?? error ?? undefined;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setLocalError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent title={title} description={description}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const r = reason.trim();
            if (!optional && r.length < minLength) {
              setLocalError(`Write at least ${minLength} characters.`);
              return;
            }
            setLocalError(null);
            onSubmit(r);
          }}
        >
          {children}
          {audited && (
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span>
                <strong>Audited change.</strong> Your name, the reason and the earlier decision are recorded in the review history and the
                owner&apos;s audit log.
              </span>
            </p>
          )}
          <Field label={optional ? `${label} (optional)` : label} htmlFor="reason-text" error={shown} hint={hint}>
            <Textarea
              id="reason-text"
              value={reason}
              aria-invalid={!!shown}
              aria-required={!optional}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant={variant} loading={pending}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Lists what a bulk action did, and anything skipped with the reason in plain words. */
export function BulkResultDialog({ result, onClose }: { result: BulkResult | null; onClose: () => void }) {
  return (
    <Dialog open={!!result} onOpenChange={(o) => !o && onClose()}>
      {result && (
        <DialogContent title={result.title} className="max-w-xl">
          <ul className="grid gap-1 text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" aria-hidden />
              <span>
                <strong className="tabular">{result.done}</strong> {result.doneLabel}
              </span>
            </li>
            {result.unchanged > 0 && (
              <li className="pl-6 text-muted-foreground">
                <span className="tabular">{result.unchanged}</span> already had that status and were left unchanged.
              </li>
            )}
            {result.skipped.length > 0 && (
              <li className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-warning" aria-hidden />
                <span>
                  <strong className="tabular">{result.skipped.length}</strong> skipped
                </span>
              </li>
            )}
          </ul>
          {result.skipped.length > 0 && (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">Skipped prospects and why</caption>
                <thead className="bg-surface-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Prospect</th>
                    <th scope="col" className="px-3 py-2 font-medium">Why it was skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {result.skipped.map((s) => (
                    <tr key={s.id} className="border-t border-border align-top">
                      <td className="px-3 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2">{skipReasonText(s.reason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

/** Picks an active rep from the team. */
export function AssignDialog({
  open,
  onOpenChange,
  count,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  count: number;
  pending?: boolean;
  onSubmit: (repId: string) => void;
}) {
  const team = useTeam();
  const [rep, setRep] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={count === 1 ? "Assign to a rep" : `Assign ${count} prospects to a rep`}
        description="Only approved prospects can be assigned. The rep is notified and sees the lead in their app."
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!rep) return setErr("Choose a rep");
            setErr(null);
            onSubmit(rep);
          }}
        >
          <Field
            label="Rep"
            htmlFor="assign-rep"
            error={err ?? undefined}
            hint={team.isLoading ? "Loading your team…" : team.reps.length === 0 ? "No active reps. Invite one in Settings, Team." : undefined}
          >
            <NativeSelect id="assign-rep" value={rep} onChange={(e) => setRep(e.target.value)} aria-invalid={!!err}>
              <option value="">Choose a rep…</option>
              {team.reps.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name ?? m.email ?? "Rep"}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {team.error && <p className="text-sm text-danger" role="alert">Could not load your team. Close and try again.</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={team.reps.length === 0}>
              Assign
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type EditableProspect = {
  id: string;
  name: string;
  type: string;
  category: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gstin: string | null;
  website: string | null;
  contact: LeadContact | null;
};

type EditForm = Record<
  "name" | "type" | "category" | "address" | "city" | "state" | "pincode" | "gstin" | "website" | "contact_name" | "contact_role" | "phone" | "email",
  string
>;

function toForm(p: EditableProspect): EditForm {
  return {
    name: p.name,
    type: p.type,
    category: p.category ?? "",
    address: p.address ?? "",
    city: p.city ?? "",
    state: p.state ?? "",
    pincode: p.pincode ?? "",
    gstin: p.gstin ?? "",
    website: p.website ?? "",
    contact_name: p.contact?.name ?? "",
    contact_role: p.contact?.role ?? "",
    phone: p.contact?.phone_e164 ?? "",
    email: p.contact?.email ?? "",
  };
}

const EDIT_FIELDS: { key: keyof EditForm; label: string; span?: boolean; type?: string; inputMode?: "tel" | "email" | "numeric" | "url" }[] = [
  { key: "name", label: "Company name", span: true },
  { key: "category", label: "Category" },
  { key: "address", label: "Address", span: true },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "pincode", label: "Pincode", inputMode: "numeric" },
  { key: "gstin", label: "GSTIN" },
  { key: "website", label: "Website", inputMode: "url" },
  { key: "contact_name", label: "Contact name" },
  { key: "contact_role", label: "Contact role" },
  { key: "phone", label: "Phone", type: "tel", inputMode: "tel" },
  { key: "email", label: "Email", type: "email", inputMode: "email" },
];

/**
 * Corrects a prospect's details through update_prospect_details. A phone that
 * belongs to another prospect is a duplicate: offer a merge instead.
 */
export function EditProspectDialog({
  open,
  onOpenChange,
  prospect,
  invalidate,
  onSuggestMerge,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prospect: EditableProspect;
  invalidate: readonly (readonly unknown[])[];
  onSuggestMerge: (phoneE164: string) => void;
}) {
  const supabase = getSupabaseBrowser();
  const initial = useMemo(() => toForm(prospect), [prospect]);
  const [form, setForm] = useState<EditForm>(initial);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof EditForm | "form", string>>>({});
  const [dupPhone, setDupPhone] = useState<string | null>(null);

  // Load the latest values each time the dialog opens.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setForm(initial);
      setReason("");
      setErrors({});
      setDupPhone(null);
    }
  }

  const changed = (Object.keys(form) as (keyof EditForm)[]).filter((k) => form[k].trim() !== initial[k].trim());

  const save = useRpc(
    async () => {
      const fields: Record<string, string> = {};
      for (const k of changed) fields[k] = form[k].trim();
      return unwrap(
        await supabase.rpc("update_prospect_details", {
          p_id: prospect.id,
          p_fields: fields as Json,
          p_reason: reason.trim() || undefined,
        }),
      );
    },
    {
      invalidate: invalidate.map((k) => [...k]),
      success: "Details saved. The change is in the review history.",
      silentError: true,
      onSuccess: () => onOpenChange(false),
      onError: (e) => {
        if (e.code === "duplicate_phone") {
          setDupPhone(toE164(form.phone) ?? form.phone);
          setErrors({ phone: e.message });
          return;
        }
        const f = e.field as keyof EditForm | undefined;
        if (f && f in form) setErrors({ [f]: e.message });
        else setErrors({ form: e.message });
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Edit ${prospect.name}`} description="Correct what discovery got wrong. Every change is recorded." className="max-w-2xl">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const errs: typeof errors = {};
            if (!form.name.trim()) errs.name = "Company name cannot be empty";
            if (form.phone.trim() && !toE164(form.phone)) errs.phone = "Enter a valid 10 digit Indian mobile number";
            if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = "Enter a valid email";
            if (form.pincode.trim() && !/^\d{6}$/.test(form.pincode.trim())) errs.pincode = "Pincode has 6 digits";
            setErrors(errs);
            setDupPhone(null);
            if (Object.keys(errs).length === 0 && changed.length > 0) save.mutate(undefined);
          }}
        >
          <Field label="Buyer type" htmlFor="edit-type">
            <NativeSelect id="edit-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {BUYER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {EDIT_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`edit-${f.key}`} error={errors[f.key]} className={f.span ? "sm:col-span-2" : undefined}>
              <Input
                id={`edit-${f.key}`}
                type={f.type ?? "text"}
                inputMode={f.inputMode}
                value={form[f.key]}
                aria-invalid={!!errors[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            </Field>
          ))}
          {dupPhone && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm sm:col-span-2">
              <span className="flex items-start gap-2">
                <GitMerge className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                Another prospect already has {formatPhone(dupPhone)}. They are probably the same business.
              </span>
              <Button
                type="button"
                size="sm"
                variant="accent"
                onClick={() => {
                  onOpenChange(false);
                  onSuggestMerge(dupPhone);
                }}
              >
                Merge the two records
              </Button>
            </div>
          )}
          <Field label="What did you correct? (optional)" htmlFor="edit-reason" className="sm:col-span-2">
            <Input id="edit-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Called the shop, updated the owner's number" />
          </Field>
          {errors.form && (
            <p className="text-sm text-danger sm:col-span-2" role="alert">
              {errors.form}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <span className="text-xs text-muted-foreground">{changed.length === 0 ? "No changes yet" : `${changed.length} field${changed.length === 1 ? "" : "s"} changed`}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending} disabled={changed.length === 0}>
                Save changes
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type MergeOption = {
  id: string;
  name: string;
  city: string | null;
  type: string;
  fit_score: number | null;
  review_status: string;
  contacts: { phone_e164: string | null; is_primary: boolean }[];
};

/**
 * Manual merge: search any other prospect by name or phone, choose which
 * record to keep, then merge_prospect_records moves contacts, conversations,
 * deals and history to the kept record.
 */
export function MergeWithDialog({
  open,
  onOpenChange,
  prospect,
  initialPhone,
  invalidate,
  onMerged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prospect: { id: string; name: string };
  initialPhone?: string | null;
  invalidate: readonly (readonly unknown[])[];
  onMerged: (keptId: string) => void;
}) {
  const supabase = getSupabaseBrowser();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [other, setOther] = useState<MergeOption | null>(null);
  const [keep, setKeep] = useState<"this" | "other">("this");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setSearch(initialPhone ?? "");
      setDebounced(initialPhone ?? "");
      setOther(null);
      setKeep("this");
      setNote("");
      setError(null);
    }
  }

  useEffect(() => {
    const h = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(h);
  }, [search]);

  const results = useQuery({
    enabled: open && debounced.trim().length >= 2,
    queryKey: qk.leads({ mergeSearch: debounced, exclude: prospect.id }),
    queryFn: async (): Promise<MergeOption[]> => {
      const term = sanitizeSearch(debounced);
      const phone = toE164(debounced);
      const digits = debounced.replace(/\D/g, "");
      let ids: string[] = [];
      if (phone || digits.length >= 5) {
        const c = await supabase
          .from("contacts")
          .select("prospect_id")
          .ilike("phone_e164", `%${phone ? phone.slice(1) : digits}%`)
          .limit(50);
        ids = (unwrap(c) ?? []).map((r) => r.prospect_id);
      }
      let q = supabase
        .from("prospects")
        .select("id, name, city, type, fit_score, review_status, contacts(phone_e164, is_primary)")
        .neq("review_status", "merged")
        .neq("id", prospect.id)
        .order("name")
        .limit(20);
      if (ids.length > 0 && term) q = q.or(`name.ilike.%${term}%,id.in.(${ids.join(",")})`);
      else if (ids.length > 0) q = q.in("id", ids);
      else if (term) q = q.ilike("name", `%${term}%`);
      else return [];
      return (unwrap(await q) ?? []) as unknown as MergeOption[];
    },
  });

  const merge = useRpc(
    async () => {
      if (!other) throw new RpcError({ code: "nothing_selected", message: "Choose the other record first" });
      const keepId = keep === "this" ? prospect.id : other.id;
      const dropId = keep === "this" ? other.id : prospect.id;
      return unwrap(await supabase.rpc("merge_prospect_records", { p_keep: keepId, p_drop: dropId, p_note: note.trim() || undefined }));
    },
    {
      invalidate: invalidate.map((k) => [...k]),
      success: "Records merged. Contacts, conversations, deals and history now sit on the kept record.",
      onSuccess: (kept) => {
        onOpenChange(false);
        onMerged(String(kept));
      },
      onError: (e) => setError(e.message),
    },
  );

  const phoneOf = (o: MergeOption) => (o.contacts.find((c) => c.is_primary) ?? o.contacts[0])?.phone_e164 ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Merge ${prospect.name} with another record`} description="Use this when two records are the same business." className="max-w-2xl">
        <div className="grid gap-4">
          <Field label="Find the other record" htmlFor="merge-search" hint="Search by company name or phone number">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
              <Input id="merge-search" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
            </div>
          </Field>
          {debounced.trim().length >= 2 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border" aria-live="polite">
              {results.isLoading ? (
                <p className="p-3 text-sm text-muted-foreground">Searching…</p>
              ) : results.error ? (
                <p className="p-3 text-sm text-danger" role="alert">
                  Search failed. {(results.error as Error).message}
                </p>
              ) : (results.data ?? []).length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No matching records.</p>
              ) : (
                <ul role="radiogroup" aria-label="Matching records" className="divide-y divide-border">
                  {results.data!.map((o) => (
                    <li key={o.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-muted has-[:checked]:bg-primary-soft/50">
                        <input type="radio" name="merge-other" checked={other?.id === o.id} onChange={() => setOther(o)} />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{o.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {[titleCase(o.type), o.city, phoneOf(o) ? formatPhone(phoneOf(o)) : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <ReviewStatusBadge status={o.review_status} />
                        <FitScoreBadge score={o.fit_score} />
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {other && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Which record do you keep?</legend>
              {(
                [
                  ["this", prospect.name, "This record"],
                  ["other", other.name, "The record you picked"],
                ] as const
              ).map(([value, name, hint]) => (
                <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft/40">
                  <input type="radio" name="merge-keep" checked={keep === value} onChange={() => setKeep(value)} />
                  <span className="font-medium">{name}</span>
                  <Badge tone="outline">{hint}</Badge>
                  {keep === value && <span className="ml-auto text-xs font-medium text-primary">Kept</span>}
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                The other record is marked Merged and hidden from lists. Its contacts, conversations, quotations, orders and history move to the
                kept record; empty fields on the kept record are filled from it.
              </p>
            </fieldset>
          )}

          <Field label="Note (optional)" htmlFor="merge-note">
            <Input id="merge-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Same owner, two listings" />
          </Field>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={merge.isPending}>
              Cancel
            </Button>
            <Button variant="accent" disabled={!other} loading={merge.isPending} onClick={() => merge.mutate(undefined)}>
              <GitMerge aria-hidden /> Merge records
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
