"use client";

import { useState } from "react";
import { Equal, EqualNot, GitMerge, Split } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { formatPhone, titleCase } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { primaryContact, type LeadContact } from "@/components/manufacturer/lead-shared";

export type CompareRecord = {
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
  fit_score: number | null;
  review_status: string;
  created_at: string;
  source: { name: string } | null;
  contacts: LeadContact[];
};

export type MergeCandidate = {
  id: string;
  prospect_id: string;
  candidate_prospect_id: string | null;
  similarity: number;
  status: string;
};

const ROWS: { label: string; get: (r: CompareRecord) => string | null }[] = [
  { label: "Company name", get: (r) => r.name },
  { label: "Buyer type", get: (r) => titleCase(r.type) },
  { label: "Category", get: (r) => r.category },
  { label: "Phone", get: (r) => (primaryContact(r.contacts)?.phone_e164 ? formatPhone(primaryContact(r.contacts)!.phone_e164) : null) },
  { label: "Contact", get: (r) => primaryContact(r.contacts)?.name ?? null },
  { label: "Address", get: (r) => r.address },
  { label: "City", get: (r) => r.city },
  { label: "State", get: (r) => r.state },
  { label: "Pincode", get: (r) => r.pincode },
  { label: "GSTIN", get: (r) => r.gstin },
  { label: "Website", get: (r) => r.website },
  { label: "Source", get: (r) => r.source?.name ?? null },
  { label: "Fit score", get: (r) => (r.fit_score === null ? null : String(Math.round(Number(r.fit_score)))) },
];

const norm = (v: string | null) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Side-by-side view of a suspected duplicate. Differences are marked with a
 * word and an icon, never colour alone. Merge keeps the existing record by
 * default; the reviewer can choose to keep the new one instead.
 */
export function DuplicateCompare({
  candidate,
  existing,
  incoming,
  currentId,
  canResolve,
  invalidate,
  onResolved,
}: {
  candidate: MergeCandidate;
  existing: CompareRecord | undefined;
  incoming: CompareRecord | undefined;
  currentId: string;
  canResolve: boolean;
  invalidate: readonly (readonly unknown[])[];
  onResolved: (keptId: string | null) => void;
}) {
  const supabase = getSupabaseBrowser();
  const [keep, setKeep] = useState<"existing" | "incoming">("existing");
  const [note, setNote] = useState("");
  const inv = invalidate.map((k) => [...k]);

  const merge = useRpc(
    async () => {
      if (keep === "existing" || !incoming || !existing) {
        unwrap(await supabase.rpc("resolve_duplicate", { p_candidate: candidate.id, p_merge: true, p_note: note.trim() || undefined }));
        return candidate.prospect_id;
      }
      return unwrap(await supabase.rpc("merge_prospect_records", { p_keep: incoming.id, p_drop: existing.id, p_note: note.trim() || undefined }));
    },
    { invalidate: inv, success: "Records merged", onSuccess: (kept) => onResolved(String(kept)) },
  );
  const separate = useRpc(
    async () => unwrap(await supabase.rpc("resolve_duplicate", { p_candidate: candidate.id, p_merge: false, p_note: note.trim() || undefined })),
    { invalidate: inv, success: "Kept as separate businesses", onSuccess: () => onResolved(null) },
  );

  const label = (r: CompareRecord | undefined, role: "existing" | "incoming") =>
    `${role === "existing" ? "Existing record" : "New record (flagged)"}${r?.id === currentId ? " · this one" : ""}`;
  const diffCount = existing && incoming ? ROWS.filter((row) => norm(row.get(existing)) !== norm(row.get(incoming))).length : 0;

  return (
    <Card className="grid gap-3 border-accent/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Possible duplicate · <span className="tabular">{Math.round(candidate.similarity * 100)}%</span> similar
        </p>
        {existing && incoming && (
          <Badge tone="outline">
            {diffCount} field{diffCount === 1 ? "" : "s"} differ
          </Badge>
        )}
      </div>
      {!existing || !incoming ? (
        <p className="text-sm text-muted-foreground">One of the two records could not be loaded. It may already have been merged.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Side by side comparison of the two records</caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="pb-1 pr-2 font-medium">Field</th>
                <th scope="col" className="pb-1 pr-2 font-medium">{label(existing, "existing")}</th>
                <th scope="col" className="pb-1 pr-2 font-medium">{label(incoming, "incoming")}</th>
                <th scope="col" className="pb-1 font-medium">
                  <span className="sr-only">Same or different</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const a = row.get(existing);
                const b = row.get(incoming);
                const same = norm(a) === norm(b);
                return (
                  <tr key={row.label} className={cn("border-t border-border align-top", !same && "bg-accent-soft/40")}>
                    <th scope="row" className="py-1.5 pr-2 text-left text-xs font-medium text-muted-foreground">
                      {row.label}
                    </th>
                    <td className={cn("py-1.5 pr-2", !same && "font-medium")}>{a || <span className="text-muted-foreground">Not set</span>}</td>
                    <td className={cn("py-1.5 pr-2", !same && "font-medium")}>{b || <span className="text-muted-foreground">Not set</span>}</td>
                    <td className="whitespace-nowrap py-1.5 text-xs">
                      {same ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Equal className="size-3" aria-hidden /> Same
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-accent">
                          <EqualNot className="size-3" aria-hidden /> Different
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {canResolve ? (
        <div className="grid gap-2">
          {existing && incoming && (
            <fieldset className="flex flex-wrap gap-2 text-sm">
              <legend className="mb-1 w-full text-xs font-medium text-muted-foreground">If you merge, keep:</legend>
              {(
                [
                  ["existing", `Existing: ${existing.name}`],
                  ["incoming", `New: ${incoming.name}`],
                ] as const
              ).map(([value, text]) => (
                <label
                  key={value}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1 has-[:checked]:border-primary has-[:checked]:bg-primary-soft/50"
                >
                  <input type="radio" name={`keep-${candidate.id}`} checked={keep === value} onChange={() => setKeep(value)} />
                  {text}
                  {value === "existing" && <span className="text-xs text-muted-foreground">(default)</span>}
                </label>
              ))}
            </fieldset>
          )}
          <label className="grid gap-1 text-xs font-medium text-muted-foreground" htmlFor={`dup-note-${candidate.id}`}>
            Note (optional)
            <Input id={`dup-note-${candidate.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why they are or are not the same" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="accent" loading={merge.isPending} disabled={separate.isPending} onClick={() => merge.mutate(undefined)}>
              <GitMerge aria-hidden /> Merge
            </Button>
            <Button size="sm" variant="outline" loading={separate.isPending} disabled={merge.isPending} onClick={() => separate.mutate(undefined)}>
              <Split aria-hidden /> Keep separate
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">You do not have the Resolve duplicates permission. Ask the owner to decide this one.</p>
      )}
    </Card>
  );
}
