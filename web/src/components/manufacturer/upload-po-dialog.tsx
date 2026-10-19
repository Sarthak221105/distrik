"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { RpcError, toAppError, unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { useRpc } from "@/hooks/use-rpc";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { safeFileName } from "@/components/manufacturer/files";
import { unwrapList } from "@/components/manufacturer/hooks";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

/** Upload a buyer's PO: private storage, then register_purchase_order queues parsing. */
export function UploadPoDialog({
  open,
  onOpenChange,
  defaultProspectId,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultProspectId?: string;
  onUploaded?: (poId: string) => void;
}) {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const [prospectId, setProspectId] = useState(defaultProspectId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const prospects = useQuery({
    enabled: open,
    queryKey: ["po-upload-prospects"],
    queryFn: async () => {
      const quoted = unwrapList(
        await supabase
          .from("quotations")
          .select("prospect_id, prospect:prospects(id, name, city)")
          .in("status", ["sent", "accepted"])
          .order("created_at", { ascending: false })
          .limit(500),
      );
      const seen = new Map<string, { id: string; name: string; city: string | null }>();
      for (const q of quoted) {
        const p = q.prospect as { id: string; name: string; city: string | null } | null;
        if (p && !seen.has(p.id)) seen.set(p.id, p);
      }
      return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const upload = useRpc(
    async () => {
      if (!viewer.manufacturerId) throw new RpcError({ code: "no_tenant", message: "No manufacturer on this account" });
      const key = `${viewer.manufacturerId}/${crypto.randomUUID()}-${safeFileName(file!.name)}`;
      const up = await supabase.storage.from("purchase-orders").upload(key, file!, { contentType: file!.type, upsert: false });
      if (up.error) throw new RpcError({ ...toAppError(up.error), field: "file" });
      return unwrap(
        await supabase.rpc("register_purchase_order", {
          p_prospect: prospectId,
          p_file_path: `purchase-orders/${key}`,
          p_mime: file!.type || undefined,
        }),
      );
    },
    {
      invalidate: [qk.purchaseOrders()],
      success: "PO uploaded. The AI is reading it and will match it to the quotation.",
      onSuccess: (id) => {
        setFile(null);
        onOpenChange(false);
        if (id) onUploaded?.(id);
      },
      onError: (e) => setErrors(e.field ? { [e.field === "prospect_id" ? "prospect" : e.field === "file_path" ? "file" : e.field]: e.message } : {}),
    },
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setFile(null);
        onOpenChange(o);
      }}
    >
      <DialogContent title="Upload a purchase order" description="PDF or photo of the buyer's PO. It is stored privately and matched against the latest sent quotation.">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const errs: Record<string, string> = {};
            if (!prospectId) errs.prospect = "Pick the buyer who sent this PO";
            if (!file) errs.file = "Choose the PO file";
            else if (file.size > 20 * 1024 * 1024) errs.file = "The file is larger than 20 MB";
            setErrors(errs);
            if (Object.keys(errs).length === 0) upload.mutate(undefined);
          }}
        >
          <Field label="Buyer" htmlFor="po-prospect" error={errors.prospect} hint="Buyers with a sent quotation">
            <NativeSelect id="po-prospect" value={prospectId} onChange={(e) => setProspectId(e.target.value)} aria-invalid={!!errors.prospect}>
              <option value="">{prospects.isLoading ? "Loading buyers…" : "Select a buyer"}</option>
              {(prospects.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.city ? ` · ${p.city}` : ""}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="PO file" htmlFor="po-file" error={errors.file}>
            <Input
              id="po-file"
              type="file"
              accept={ACCEPT}
              aria-invalid={!!errors.file}
              className="h-auto py-1.5"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={upload.isPending}>
              <Upload aria-hidden /> Upload and match
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
