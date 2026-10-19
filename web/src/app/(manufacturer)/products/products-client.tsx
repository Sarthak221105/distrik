"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FileUp, Package, Pencil, Plus, Scale } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { RpcError, toAppError, unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatINR, timeAgo, titleCase } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { useRealtime } from "@/hooks/use-realtime";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, Sheet } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/domain/badges";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { ProductForm } from "@/components/manufacturer/product-form";
import { openStoredFile, safeFileName } from "@/components/manufacturer/files";
import { unwrapList, useTrackScreen } from "@/components/manufacturer/hooks";
import type { Tables } from "@/lib/database.types";

type ProductRow = Tables<"products"> & { discount_rules: { id: string }[] };

const DOC_KINDS = ["catalogue", "price_list", "brochure", "certificate", "other"] as const;

export function ProductsClient() {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  useTrackScreen("products");
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const products = useQuery({
    queryKey: qk.products(),
    queryFn: async () =>
      unwrapList(await supabase.from("products").select("*, discount_rules(id)").order("name")) as unknown as ProductRow[],
  });

  const docs = useQuery({
    queryKey: ["documents"],
    queryFn: async () =>
      unwrapList(
        await supabase
          .from("documents")
          .select("id, title, kind, status, storage_path, mime_type, error, created_at, approved_for_sharing, extracted")
          .order("created_at", { ascending: false })
          .limit(100),
      ),
  });

  useRealtime({ table: "documents", invalidate: [["documents"]] });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Products"
        description="The Product Brain: structured facts the AI quotes from. Nothing extracted from a catalogue becomes a product until you confirm it."
        actions={
          <>
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <FileUp aria-hidden /> Upload catalogue
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus aria-hidden /> Add product
            </Button>
          </>
        }
      />

      {products.isLoading ? (
        <LoadingSkeleton variant="table" rows={5} />
      ) : products.error ? (
        <ErrorState error={products.error} onRetry={() => products.refetch()} />
      ) : products.data!.length === 0 ? (
        <EmptyState
          icon={<Package aria-hidden />}
          title="No products yet"
          description="Upload a catalogue PDF and confirm what the AI extracts, or add a product by hand."
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setUploadOpen(true)}>Upload catalogue</Button>
              <Button onClick={() => setEditing("new")}>Add product</Button>
            </div>
          }
        />
      ) : (
        <Card>
          <Table>
            <caption className="sr-only">Products</caption>
            <THead>
              <TR>
                <TH scope="col">Product</TH>
                <TH scope="col">Unit</TH>
                <TH scope="col" className="text-right">MRP</TH>
                <TH scope="col" className="text-right">Distributor price</TH>
                <TH scope="col" className="text-right">MOQ</TH>
                <TH scope="col" className="text-right">GST</TH>
                <TH scope="col">HSN</TH>
                <TH scope="col">Status</TH>
                <TH scope="col" className="text-right">Price tiers</TH>
                <TH scope="col"><span className="sr-only">Actions</span></TH>
              </TR>
            </THead>
            <TBody>
              {products.data!.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <div className="font-medium">{p.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{p.sku}{p.category ? ` · ${p.category}` : ""}</div>
                  </TD>
                  <TD>{p.unit}</TD>
                  <TD className="text-right tabular">{formatINR(p.mrp_paise)}</TD>
                  <TD className="text-right tabular">{formatINR(p.distributor_price_paise)}</TD>
                  <TD className="text-right tabular">{p.moq}</TD>
                  <TD className="text-right tabular">{Number(p.gst_rate)}%</TD>
                  <TD className="tabular">{p.hsn_code ?? "–"}</TD>
                  <TD><StatusBadge status={p.status} /></TD>
                  <TD className="text-right">
                    {p.discount_rules.length === 0 ? (
                      <Link href={`/rules?product=${p.id}`} className="text-xs text-warning hover:underline">None: list price only</Link>
                    ) : (
                      <Link href={`/rules?product=${p.id}`} className="tabular hover:underline">{p.discount_rules.length}</Link>
                    )}
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="size-8" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                        <Pencil aria-hidden />
                      </Button>
                      <Button asChild size="icon" variant="ghost" className="size-8">
                        <Link href={`/rules?product=${p.id}`} aria-label={`Price rules for ${p.name}`}><Scale aria-hidden /></Link>
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>Catalogues, price lists and certificates. Approved documents can be shared with buyers by the AI.</CardDescription>
        </CardHeader>
        <CardContent>
          {docs.isLoading ? (
            <LoadingSkeleton rows={2} />
          ) : docs.error ? (
            <ErrorState error={docs.error} onRetry={() => docs.refetch()} />
          ) : docs.data!.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          ) : (
            <ul className="grid gap-2">
              {docs.data!.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="font-medium">{d.title ?? d.storage_path.split("/").pop()}</span>
                  <span className="text-xs text-muted-foreground">{titleCase(d.kind)}</span>
                  <StatusBadge status={d.status} />
                  {d.status === "extracting" && <span className="text-xs text-muted-foreground" aria-live="polite">AI is reading the file…</span>}
                  {d.approved_for_sharing && <span className="text-xs text-success">Shareable</span>}
                  {d.error && <span className="text-xs text-danger">{d.error}</span>}
                  <span className="text-xs text-muted-foreground">{timeAgo(d.created_at)}</span>
                  <span className="ml-auto flex gap-2">
                    {(d.status === "review" || d.status === "uploaded" || d.status === "extracting" || d.status === "failed") && d.kind === "catalogue" && (
                      <Button asChild size="sm" variant={d.status === "review" ? "default" : "outline"}>
                        <Link href={`/products/review/${d.id}`}>{d.status === "review" ? "Review extraction" : "Open"}</Link>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openStoredFile(d.storage_path, "catalogues")}>View file</Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Add product" : `Edit ${editing?.name ?? "product"}`}
        description="Prices in rupees, excluding GST."
      >
        {editing !== null && (
          <ProductForm key={editing === "new" ? "new" : editing.id} product={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Sheet>

      <UploadCatalogueDialog open={uploadOpen} onOpenChange={setUploadOpen} manufacturerId={viewer.manufacturerId} userId={viewer.userId} />
    </div>
  );
}

function UploadCatalogueDialog({
  open,
  onOpenChange,
  manufacturerId,
  userId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  manufacturerId: string | null;
  userId: string;
}) {
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<(typeof DOC_KINDS)[number]>("catalogue");
  const [error, setError] = useState<string>();
  const [stage, setStage] = useState<string | null>(null);

  const upload = useRpc(
    async () => {
      if (!manufacturerId) throw new RpcError({ code: "no_tenant", message: "No manufacturer on this account" });
      setStage("Uploading…");
      const key = `${manufacturerId}/catalogue/${crypto.randomUUID()}-${safeFileName(file!.name)}`;
      const up = await supabase.storage.from("catalogues").upload(key, file!, { contentType: file!.type || "application/pdf" });
      if (up.error) throw new RpcError(toAppError(up.error));
      setStage("Saving…");
      const doc = unwrap(
        await supabase
          .from("documents")
          .insert({
            manufacturer_id: manufacturerId,
            storage_path: key,
            title: title.trim() || file!.name.replace(/\.[^.]+$/, ""),
            mime_type: file!.type || "application/pdf",
            kind,
            status: "uploaded",
            created_by: userId,
          })
          .select("id")
          .single(),
      );
      if (kind === "catalogue") {
        setStage("Starting extraction…");
        // The review screen shows progress; a failed start can be retried there.
        await supabase.functions.invoke("catalogue-extract", { body: { document_id: doc!.id } }).catch(() => null);
      }
      return { id: doc!.id, kind };
    },
    {
      invalidate: [["documents"]],
      success: (r) => (r.kind === "catalogue" ? "Catalogue uploaded. The AI is extracting products for your review." : "Document uploaded"),
      onSuccess: (r) => {
        setStage(null);
        setFile(null);
        setTitle("");
        onOpenChange(false);
        if (r.kind === "catalogue") router.push(`/products/review/${r.id}`);
      },
      onError: () => setStage(null),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Upload a document" description="Catalogues are read by the AI; you confirm every extracted field before anything becomes a product.">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return setError("Choose a PDF file");
            if (file.size > 50 * 1024 * 1024) return setError("The file is larger than 50 MB");
            setError(undefined);
            upload.mutate(undefined);
          }}
        >
          <Field label="File (PDF)" htmlFor="cat-file" error={error}>
            <Input id="cat-file" type="file" accept="application/pdf" className="h-auto py-1.5" aria-invalid={!!error} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <Field label="Title (optional)" htmlFor="cat-title">
            <Input id="cat-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Trade catalogue 2026" />
          </Field>
          <Field label="Kind" htmlFor="cat-kind">
            <NativeSelect id="cat-kind" value={kind} onChange={(e) => setKind(e.target.value as (typeof DOC_KINDS)[number])}>
              {DOC_KINDS.map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}
            </NativeSelect>
          </Field>
          <div className="flex items-center justify-end gap-2">
            {stage && <span className="mr-auto text-xs text-muted-foreground" aria-live="polite">{stage}</span>}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={upload.isPending}>
              <FileUp aria-hidden /> Upload
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
