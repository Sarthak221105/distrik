"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, MessageSquareOff, Plus } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatNumber, formatPhone, titleCase } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/domain/badges";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { unwrapList } from "@/components/manufacturer/hooks";

const LANGS = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "en_IN", label: "English (India)" },
];

export function TemplateSettings() {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const [open, setOpen] = useState(false);

  const templates = useQuery({
    queryKey: qk.templates(),
    queryFn: async () =>
      unwrapList(
        await supabase
          .from("message_templates")
          .select("id, manufacturer_id, name, language, category, body, purpose, meta_status, rejection_reason, usage_count, created_at")
          .order("name"),
      ),
  });

  const number = viewer.manufacturer?.whatsapp_display_number;

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <MessageCircle className="size-5 text-success" aria-hidden />
            <div>
              <CardTitle>WhatsApp Business</CardTitle>
              <CardDescription>Live channel through the approved BSP</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-sm">
            {number ? (
              <p>
                Sending from <strong className="tabular">{formatPhone(number)}</strong>
              </p>
            ) : (
              <p className="text-muted-foreground">No WhatsApp number connected yet. It is connected during onboarding through your WhatsApp Business provider.</p>
            )}
          </CardContent>
        </Card>
        <Card className="opacity-80">
          <CardHeader className="flex-row items-center gap-2">
            <MessageSquareOff className="size-5 text-muted-foreground" aria-hidden />
            <div>
              <CardTitle>SMS</CardTitle>
              <CardDescription>Disabled</CardDescription>
            </div>
            <Badge tone="neutral" className="ml-auto">Pending DLT</Badge>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Commercial SMS in India needs DLT registration of the sender ID and every template. SMS stays off until that is done.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Message templates</CardTitle>
            <CardDescription>Outside the 24 hour window only Meta approved templates can be sent.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus aria-hidden /> New template
          </Button>
        </CardHeader>
        <CardContent>
          {templates.isLoading ? (
            <LoadingSkeleton variant="table" rows={4} />
          ) : templates.error ? (
            <ErrorState error={templates.error} onRetry={() => templates.refetch()} />
          ) : templates.data!.length === 0 ? (
            <EmptyState title="No templates" description="Submit an opener and a follow up template for Meta approval." />
          ) : (
            <Table>
              <caption className="sr-only">Message templates</caption>
              <THead>
                <TR>
                  <TH scope="col">Template</TH>
                  <TH scope="col">Category</TH>
                  <TH scope="col">Language</TH>
                  <TH scope="col">Meta status</TH>
                  <TH scope="col" className="text-right">Used</TH>
                </TR>
              </THead>
              <TBody>
                {templates.data!.map((tpl) => (
                  <TR key={tpl.id}>
                    <TD className="max-w-md">
                      <div className="font-mono text-xs font-medium">{tpl.name}</div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{tpl.body}</p>
                      {!tpl.manufacturer_id && <span className="text-[11px] text-muted-foreground">Platform template</span>}
                    </TD>
                    <TD>{titleCase(tpl.category)}</TD>
                    <TD>{tpl.language}</TD>
                    <TD>
                      <StatusBadge status={tpl.meta_status} />
                      {tpl.rejection_reason && <p className="text-xs text-danger">{tpl.rejection_reason}</p>}
                    </TD>
                    <TD className="text-right tabular">{formatNumber(tpl.usage_count)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <NewTemplateDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function NewTemplateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const [f, setF] = useState({ name: "", language: "en", category: "utility", body: "", purpose: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const variables = Array.from(new Set(Array.from(f.body.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)).map((m) => m[1]!)));

  const create = useRpc(
    async (status: "draft" | "submitted") =>
      unwrap(
        await supabase
          .from("message_templates")
          .insert({
            manufacturer_id: viewer.manufacturerId,
            name: f.name.trim(),
            language: f.language,
            category: f.category,
            body: f.body.trim(),
            purpose: f.purpose.trim() || null,
            variables,
            meta_status: status,
          })
          .select("id")
          .single(),
      ),
    {
      invalidate: [qk.templates()],
      success: (_d, s) => (s === "submitted" ? "Template submitted for Meta approval" : "Template saved as draft"),
      onSuccess: () => {
        setF({ name: "", language: "en", category: "utility", body: "", purpose: "" });
        onOpenChange(false);
      },
      onError: (e) => {
        if (e.code === "23505") setErrors({ name: "A template with this name and language exists" });
      },
    },
  );

  function submit(status: "draft" | "submitted") {
    const e: Record<string, string> = {};
    if (!/^[a-z0-9_]{3,60}$/.test(f.name.trim())) e.name = "Lowercase letters, digits and underscores (3 to 60)";
    if (f.body.trim().length < 10) e.body = "Write the message body";
    if (f.body.length > 1024) e.body = "Meta allows up to 1024 characters";
    setErrors(e);
    if (Object.keys(e).length === 0) create.mutate(status);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New WhatsApp template" description="Use {{name}} style placeholders. Submitted templates go to Meta for approval through the WhatsApp Business provider.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="t-name" error={errors.name} className="sm:col-span-2">
            <Input id="t-name" value={f.name} aria-invalid={!!errors.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} placeholder="reorder_reminder_hi" className="font-mono" />
          </Field>
          <Field label="Language" htmlFor="t-lang">
            <NativeSelect id="t-lang" value={f.language} onChange={(e) => setF((x) => ({ ...x, language: e.target.value }))}>
              {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Category" htmlFor="t-cat">
            <NativeSelect id="t-cat" value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))}>
              <option value="utility">Utility</option>
              <option value="marketing">Marketing</option>
            </NativeSelect>
          </Field>
          <Field label="Body" htmlFor="t-body" error={errors.body} className="sm:col-span-2" hint={variables.length ? `Placeholders: ${variables.join(", ")}` : undefined}>
            <Textarea id="t-body" rows={5} value={f.body} aria-invalid={!!errors.body} onChange={(e) => setF((x) => ({ ...x, body: e.target.value }))} placeholder="Namaste {{name}}, your last order of {{product}} was on {{date}}. Shall we send the next lot?" />
          </Field>
          <Field label="Purpose (optional)" htmlFor="t-purpose" className="sm:col-span-2">
            <Input id="t-purpose" value={f.purpose} onChange={(e) => setF((x) => ({ ...x, purpose: e.target.value }))} placeholder="reorder_reminder" />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="secondary" loading={create.isPending && create.variables === "draft"} onClick={() => submit("draft")}>Save draft</Button>
          <Button loading={create.isPending && create.variables === "submitted"} onClick={() => submit("submitted")}>Submit for approval</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
