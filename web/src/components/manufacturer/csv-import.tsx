"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { CSV_COLUMNS, parseProspectCsv, type CsvParseResult } from "@/lib/csv";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { useRpc } from "@/hooks/use-rpc";
import type { Json } from "@/lib/database.types";

const MIN_NOTE = 10;

/**
 * The manufacturer's own buyer list through the same pipeline: the CSV is
 * parsed here, import_prospect_records stores the rows as raw records with
 * the team's origin note, then cleaning, dedupe, classification, research and
 * scoring run as for discovered buyers. Results land in Lead Review.
 */
export function CsvImportDialog({
  open,
  onOpenChange,
  defaultCampaign,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultCampaign?: string;
}) {
  const supabase = getSupabaseBrowser();
  const [campaign, setCampaign] = useState(defaultCampaign ?? "");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<CsvParseResult | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Follow the campaign the page asks for each time the dialog opens.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open && defaultCampaign) setCampaign(defaultCampaign);
    if (open) setSubmitError(null);
  }

  // RLS limits campaigns to the viewer's own manufacturer.
  const campaigns = useQuery({
    enabled: open,
    queryKey: [...qk.campaigns(), "import-picker"],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("campaigns")
          .select("id, name, status")
          .neq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(300),
      ) ?? [],
  });
  const options = campaigns.data ?? [];

  const importRows = useRpc(
    async () =>
      unwrap(
        await supabase.rpc("import_prospect_records", {
          p_campaign: campaign,
          p_rows: parsed!.rows as unknown as Json,
          p_origin_note: note.trim(),
        }),
      ),
    {
      invalidate: [qk.leads(), qk.campaigns(), qk.campaign(campaign), ["review-stats"]],
      success: (n) => {
        const imported = Number(n ?? 0);
        const dupes = (parsed?.rows.length ?? 0) - imported;
        return `Imported ${imported} new record${imported === 1 ? "" : "s"}${dupes > 0 ? ` (${dupes} already imported, skipped)` : ""}. Cleaning, duplicate checks and scoring are running; results arrive in Lead Review.`;
      },
      onSuccess: () => {
        setParsed(null);
        setFileName("");
        setNote("");
        onOpenChange(false);
      },
      onError: (e) => setSubmitError(e.message),
    },
  );

  async function onFile(file: File | undefined) {
    setReadError(null);
    setParsed(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setReadError("The file is over 5 MB. Split it into smaller files.");
      return;
    }
    setFileName(file.name);
    try {
      const text = await file.text();
      const result = parseProspectCsv(text);
      if (result.rows.length > 2000) {
        setReadError(`The file has ${result.rows.length} rows. Import at most 2000 at a time.`);
        return;
      }
      setParsed(result);
    } catch {
      setReadError("Could not read the file. Save it as UTF-8 CSV and try again.");
    }
  }

  const preview = parsed?.rows.slice(0, 5) ?? [];
  const previewCols = CSV_COLUMNS.filter((c) => preview.some((r) => r[c] !== undefined)).slice(0, 7);
  const canImport = !!campaign && !!parsed && !parsed.missingName && parsed.rows.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Import buyers (CSV)"
        description="Add your own buyer list to a campaign. Rows go through the same cleaning, duplicate checks and scoring as discovered buyers, then wait in Lead Review for your team to approve."
        className="max-w-2xl"
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim().length < MIN_NOTE) {
              setNoteError(`Say where this list came from (at least ${MIN_NOTE} characters).`);
              return;
            }
            setNoteError(null);
            setSubmitError(null);
            if (canImport) importRows.mutate(undefined);
          }}
        >
          <Field label="Campaign" htmlFor="csv-campaign" hint={campaigns.isLoading ? "Loading campaigns…" : undefined}>
            <NativeSelect id="csv-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} required>
              <option value="">Choose a campaign…</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status.replace(/_/g, " ")})
                </option>
              ))}
            </NativeSelect>
          </Field>
          {campaigns.error && (
            <p className="text-sm text-danger" role="alert">
              Could not load your campaigns. Close the dialog and try again.
            </p>
          )}
          {!campaigns.isLoading && !campaigns.error && options.length === 0 && (
            <p className="text-sm text-muted-foreground">You have no open campaigns. Start a campaign first, then import buyers into it.</p>
          )}
          <Field
            label="CSV file"
            htmlFor="csv-file"
            hint={`Header row with any of: ${CSV_COLUMNS.join(", ")}. "name" is required.`}
            error={readError ?? undefined}
          >
            <Input id="csv-file" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="h-auto py-1.5" />
          </Field>

          {parsed && (
            <div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
                {fileName}: {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} ready
                {parsed.skipped > 0 && <span className="font-normal text-muted-foreground">· {parsed.skipped} without a name skipped</span>}
              </p>
              {parsed.missingName && (
                <p className="flex items-center gap-1 text-danger" role="alert">
                  <AlertTriangle className="size-4" aria-hidden /> The header has no &quot;name&quot; column.
                </p>
              )}
              {parsed.unknownColumns.length > 0 && (
                <p className="text-xs text-warning">Ignored columns: {parsed.unknownColumns.join(", ")}</p>
              )}
              {parsed.errors.map((er) => (
                <p key={er} className="text-xs text-warning">
                  {er}
                </p>
              ))}
              {preview.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <caption className="sr-only">First rows of the file</caption>
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        {previewCols.map((c) => (
                          <th key={c} scope="col" className="px-2 py-1 font-medium">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          {previewCols.map((c) => (
                            <td key={c} className="max-w-40 truncate px-2 py-1">
                              {String(r[c] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <Field
            label="Where did this list come from?"
            htmlFor="csv-note"
            error={noteError ?? undefined}
            hint="For example: our existing distributor list, trade fair visitors who gave us their card, enquiries from our website. It is stored with every row as the lawful basis for contacting them."
          >
            <Textarea id="csv-note" value={note} aria-invalid={!!noteError} aria-required onChange={(e) => setNote(e.target.value)} rows={2} />
          </Field>

          {submitError && (
            <p className="text-sm text-danger" role="alert">
              {submitError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canImport} loading={importRows.isPending}>
              Import {parsed?.rows.length ? `${parsed.rows.length} rows` : ""}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
