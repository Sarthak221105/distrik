"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, FileUp, FileText } from "lucide-react";
import { useViewer } from "@/components/providers";
import { MatchStatusBadge, StatusBadge } from "@/components/domain/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { safeFileName } from "@/components/rep/helpers";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { RpcError, toAppError, unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { timeAgo } from "@/lib/format";
import { openSigned, splitBucketPath } from "@/lib/storage";
import { useOnline } from "@/lib/offline/hooks";
import { useRealtime } from "@/hooks/use-realtime";

const MAX_BYTES = 20 * 1024 * 1024; // purchase-orders bucket limit

/** Photo or PDF of a buyer's PO -> storage -> register_purchase_order (parsed and matched by po-parse). */
export function PoUpload({ prospectId }: { prospectId: string }) {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const online = useOnline();
  const qc = useQueryClient();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = qk.purchaseOrders({ prospectId });

  const pos = useQuery({
    enabled: online,
    queryKey: key,
    queryFn: async () =>
      unwrap(
        await supabase
          .from("purchase_orders")
          .select("id, status, match_status, created_at, mime_type, file_path, error")
          .eq("prospect_id", prospectId)
          .order("created_at", { ascending: false })
          .limit(5),
      ),
  });
  useRealtime({ table: "purchase_orders", filter: `prospect_id=eq.${prospectId}`, invalidate: [key], enabled: online });

  async function upload(file: File) {
    setError(null);
    if (!viewer.manufacturerId) return setError("Your account is not linked to a manufacturer.");
    if (file.size > MAX_BYTES) return setError("The file is larger than 20 MB. Take a photo instead or compress the PDF.");
    if (!/^(image\/|application\/pdf)/.test(file.type)) return setError("Upload a photo or a PDF.");
    setBusy(true);
    try {
      const objectKey = `${viewer.manufacturerId}/${crypto.randomUUID()}-${safeFileName(file.name || "po")}`;
      const up = await supabase.storage.from("purchase-orders").upload(objectKey, file, { contentType: file.type, upsert: false });
      if (up.error) throw new RpcError({ code: "upload_failed", message: up.error.message });
      const res = await supabase.rpc("register_purchase_order", {
        p_prospect: prospectId,
        p_file_path: `purchase-orders/${objectKey}`,
        p_mime: file.type,
      });
      if (res.error) throw new RpcError(toAppError(res.error));
      toast.success("PO uploaded. It is being read and matched to the quotation.");
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void upload(f);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" aria-hidden /> Purchase order
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          Got a PO on paper or by email? Upload it. The AI reads it and matches it to the latest quotation for your manager to confirm.
        </p>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={onPick} aria-hidden />
        <input ref={fileRef} type="file" accept="application/pdf,image/*" className="sr-only" tabIndex={-1} onChange={onPick} aria-hidden />
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" variant="outline" disabled={!online || busy} loading={busy} onClick={() => cameraRef.current?.click()}>
            {!busy && <Camera aria-hidden />} Take photo
          </Button>
          <Button size="lg" variant="outline" disabled={!online || busy} onClick={() => fileRef.current?.click()}>
            <FileUp aria-hidden /> Choose file
          </Button>
        </div>
        {!online && <p className="text-xs text-warning">Uploading a PO needs a connection.</p>}
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {(pos.data ?? []).length > 0 && (
          <ul className="grid gap-2">
            {pos.data!.map((po) => (
              <li key={po.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5 text-sm">
                <button
                  type="button"
                  className="min-h-8 flex-1 truncate text-left text-primary hover:underline"
                  onClick={() => {
                    const { bucket, key: k } = splitBucketPath(po.file_path);
                    void openSigned(bucket, k);
                  }}
                >
                  PO {timeAgo(po.created_at)}
                </button>
                <StatusBadge status={po.status} />
                <MatchStatusBadge status={po.match_status} />
                {po.error && <p className="w-full text-xs text-danger">{po.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
