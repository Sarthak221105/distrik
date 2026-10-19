"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, Loader2, RotateCw, Save } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatINR, rupeesToPaise } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { useRealtime } from "@/hooks/use-realtime";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox, Switch } from "@/components/ui/misc";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { StatusBadge } from "@/components/domain/badges";
import { SignedFileFrame } from "@/components/manufacturer/files";
import { GST_RATES } from "@/components/manufacturer/product-form";
import { trackEvent, unwrapList, useTrackScreen } from "@/components/manufacturer/hooks";
import type { Json, Tables, TablesInsert } from "@/lib/database.types";

type Row = {
  include: boolean;
  name: string;
  sku: string;
  category: string;
  description: string;
  unit: string;
  mrp: string;
  distributor: string;
  moq: string;
  hsn: string;
  gst: string;
  certifications: string;
  specs: string;
  source_page: string;
};

type Knowledge = { include: boolean; title: string; content: string; product_sku: string };

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const rupees = (paise: unknown) => (paise === null || paise === undefined || paise === "" ? "" : String(Number(paise) / 100));

function specsToText(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return s(v);
  return Object.entries(v as Record<string, unknown>)
    .map(([k, val]) => `${k}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`)
    .join("\n");
}

function textToSpecs(t: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of t.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function fromExtracted(extracted: Json | null): { rows: Row[]; knowledge: Knowledge[]; warning: string | null } {
  const e = (extracted && typeof extracted === "object" && !Array.isArray(extracted) ? extracted : {}) as Record<string, unknown>;
  const products = Array.isArray(e.products) ? (e.products as Record<string, unknown>[]) : [];
  const knowledge = Array.isArray(e.knowledge) ? (e.knowledge as Record<string, unknown>[]) : [];
  return {
    rows: products.map((p) => ({
      include: p.include === false ? false : true,
      name: s(p.name),
      sku: s(p.sku),
      category: s(p.category),
      description: s(p.description),
      unit: s(p.unit) || "unit",
      mrp: rupees(p.mrp_paise),
      distributor: rupees(p.distributor_price_paise),
      moq: s(p.moq) || "1",
      hsn: s(p.hsn_code),
      gst: GST_RATES.find((g) => Number(g) === Number(p.gst_rate ?? 18)) ?? "18",
      certifications: Array.isArray(p.certifications) ? p.certifications.join(", ") : s(p.certifications),
      specs: specsToText(p.specs),
      source_page: s(p.source_page),
    })),
    knowledge: knowledge.map((k) => ({ include: k.include === false ? false : true, title: s(k.title), content: s(k.content), product_sku: s(k.product_sku) })),
    warning: typeof e.warning === "string" ? e.warning : null,
  };
}

function toExtracted(rows: Row[], knowledge: Knowledge[], warning: string | null): Json {
  return {
    products: rows.map((r) => ({
      include: r.include,
      name: r.name,
      sku: r.sku,
      category: r.category || null,
      description: r.description || null,
      specs: textToSpecs(r.specs),
      unit: r.unit,
      mrp_paise: r.mrp ? rupeesToPaise(r.mrp) : null,
      distributor_price_paise: r.distributor ? rupeesToPaise(r.distributor) : null,
      moq: Number(r.moq) || 1,
      hsn_code: r.hsn || null,
      gst_rate: Number(r.gst),
      certifications: r.certifications.split(",").map((c) => c.trim()).filter(Boolean),
      source_page: r.source_page ? Number(r.source_page) : null,
    })),
    knowledge: knowledge.map((k) => ({ include: k.include, title: k.title, content: k.content, product_sku: k.product_sku || null })),
    ...(warning ? { warning } : {}),
  } as Json;
}

function validateRow(r: Row): Record<string, string> {
  const e: Record<string, string> = {};
  if (r.name.trim().length < 2) e.name = "Name is required";
  if (!r.sku.trim()) e.sku = "SKU is required";
  if (!r.unit.trim()) e.unit = "Unit is required";
  const dp = rupeesToPaise(r.distributor);
  if (!r.distributor || !Number.isFinite(dp) || dp < 0) e.distributor = "Distributor price in rupees is required";
  if (r.mrp && !Number.isFinite(rupeesToPaise(r.mrp))) e.mrp = "Enter MRP in rupees";
  if (!/^[1-9][0-9]*$/.test(r.moq)) e.moq = "Whole number, at least 1";
  if (r.hsn && !/^[0-9]{4,8}$/.test(r.hsn)) e.hsn = "4 to 8 digits";
  return e;
}

export function CatalogueReview({ documentId }: { documentId: string }) {
  const supabase = getSupabaseBrowser();
  useTrackScreen("catalogue_review", { document_id: documentId });
  const key = ["document", documentId];
  const doc = useQuery({
    queryKey: key,
    queryFn: async () => unwrap(await supabase.from("documents").select("*").eq("id", documentId).maybeSingle()),
  });
  useRealtime({ table: "documents", filter: `id=eq.${documentId}`, invalidate: [key, ["documents"]] });

  const retry = useRpc(
    async () => {
      const { error } = await supabase.functions.invoke("catalogue-extract", { body: { document_id: documentId } });
      if (error) throw error;
      return true;
    },
    { invalidate: [key], success: "Extraction restarted" },
  );

  const back = (
    <Link href="/products" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
      <ArrowLeft className="size-3" aria-hidden /> Products
    </Link>
  );

  if (doc.isLoading) return <LoadingSkeleton variant="detail" />;
  if (doc.error) return <ErrorState error={doc.error} onRetry={() => doc.refetch()} />;
  if (!doc.data) return <EmptyState title="Document not found" action={<Button asChild variant="outline"><Link href="/products">Back to products</Link></Button>} />;
  const d = doc.data;

  if (d.status === "uploaded" || d.status === "extracting" || d.status === "failed") {
    return (
      <div className="grid gap-4">
        <PageHeader back={back} title={d.title ?? "Catalogue"} description="The AI is reading your catalogue. This page updates by itself." />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            {d.status === "failed" ? (
              <>
                <AlertTriangle className="size-8 text-danger" aria-hidden />
                <p className="font-medium">Extraction failed</p>
                {d.error && <p className="max-w-md text-sm text-muted-foreground">{d.error}</p>}
              </>
            ) : (
              <>
                <Loader2 className="size-8 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
                <p className="font-medium" aria-live="polite">{d.status === "uploaded" ? "Waiting to start extraction" : "Extracting products, prices and specs…"}</p>
                <p className="text-sm text-muted-foreground">Large catalogues can take a minute or two.</p>
              </>
            )}
            {d.status !== "extracting" && (
              <Button variant="outline" loading={retry.isPending} onClick={() => retry.mutate(undefined)}>
                <RotateCw aria-hidden /> {d.status === "failed" ? "Try again" : "Start extraction"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (d.status !== "review") {
    return (
      <div className="grid gap-4">
        <PageHeader back={back} title={d.title ?? "Catalogue"} description="This catalogue has already been confirmed." />
        <div className="flex items-center gap-2"><StatusBadge status={d.status} /></div>
        <SignedFileFrame path={d.storage_path} fallbackBucket="catalogues" mime={d.mime_type} title={d.title ?? "Catalogue"} />
      </div>
    );
  }

  return <ReviewEditor key={`${d.id}:${d.status}`} doc={d} back={back} />;
}

function ReviewEditor({ doc, back }: { doc: Tables<"documents">; back: React.ReactNode }) {
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  const viewer = useViewer();
  const initial = fromExtracted(doc.extracted);
  const [rows, setRows] = useState<Row[]>(initial.rows);
  const [knowledge, setKnowledge] = useState<Knowledge[]>(initial.knowledge);
  const [share, setShare] = useState(true);
  const [errors, setErrors] = useState<Record<number, Record<string, string>>>({});

  const existing = useQuery({
    queryKey: [...qk.products(), "skus"],
    queryFn: async () => new Set(unwrapList(await supabase.from("products").select("sku")).map((p) => p.sku.toUpperCase())),
  });

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const saveDraft = useRpc(
    async () => unwrap(await supabase.from("documents").update({ extracted: toExtracted(rows, knowledge, initial.warning) }).eq("id", doc.id)),
    { success: "Draft saved" },
  );

  const confirm = useRpc(
    async () => {
      const chosen = rows.filter((r) => r.include);
      const payload: TablesInsert<"products">[] = chosen.map((r) => ({
        manufacturer_id: viewer.manufacturerId!,
        name: r.name.trim(),
        sku: r.sku.trim().toUpperCase(),
        category: r.category.trim() || null,
        description: r.description.trim() || null,
        specs: textToSpecs(r.specs) as Json,
        unit: r.unit.trim(),
        mrp_paise: r.mrp ? rupeesToPaise(r.mrp) : null,
        distributor_price_paise: rupeesToPaise(r.distributor),
        moq: Number(r.moq),
        hsn_code: r.hsn || null,
        gst_rate: Number(r.gst),
        certifications: r.certifications.split(",").map((c) => c.trim()).filter(Boolean),
        status: "active",
        source_document_id: doc.id,
      }));
      unwrap(await supabase.from("documents").update({ extracted: toExtracted(rows, knowledge, initial.warning) }).eq("id", doc.id));
      if (payload.length) unwrap(await supabase.from("products").upsert(payload, { onConflict: "manufacturer_id,sku" }));
      unwrap(await supabase.rpc("confirm_document", { p_document: doc.id, p_approved_for_sharing: share }));
      return payload.length;
    },
    {
      invalidate: [qk.products(), ["documents"]],
      success: (n) => `${n} product${n === 1 ? "" : "s"} saved. Set price tiers in Commercial rules next.`,
      onSuccess: (n) => {
        void trackEvent(viewer, "catalogue_confirmed", { document_id: doc.id, products: n });
        router.push("/rules");
      },
    },
  );

  function onConfirm() {
    const errs: Record<number, Record<string, string>> = {};
    rows.forEach((r, i) => {
      if (!r.include) return;
      const e = validateRow(r);
      if (Object.keys(e).length) errs[i] = e;
    });
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const sku = r.sku.trim().toUpperCase();
      if (!r.include || !sku) return;
      if (seen.has(sku)) errs[i] = { ...(errs[i] ?? {}), sku: "Duplicate SKU in this catalogue" };
      seen.add(sku);
    });
    setErrors(errs);
    if (Object.keys(errs).length === 0) confirm.mutate(undefined);
    else document.getElementById(`row-${Object.keys(errs)[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const included = rows.filter((r) => r.include).length;

  return (
    <div className="grid gap-4">
      <PageHeader
        back={back}
        title={`Review: ${doc.title ?? "catalogue"}`}
        description="Check every field against the source. Nothing becomes a product until you confirm."
        actions={
          <>
            <Button variant="outline" loading={saveDraft.isPending} onClick={() => saveDraft.mutate(undefined)}>
              <Save aria-hidden /> Save draft
            </Button>
            <Button loading={confirm.isPending} onClick={onConfirm}>
              <Check aria-hidden /> Confirm {included} product{included === 1 ? "" : "s"}
            </Button>
          </>
        }
      />
      {initial.warning && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>{initial.warning}</p>
        </div>
      )}
      {Object.keys(errors).length > 0 && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {Object.keys(errors).length} product{Object.keys(errors).length === 1 ? " needs" : "s need"} attention before you can confirm.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="xl:sticky xl:top-4 xl:self-start">
          <SignedFileFrame path={doc.storage_path} fallbackBucket="catalogues" mime={doc.mime_type} title={`Source catalogue ${doc.title ?? ""}`} />
        </div>
        <div className="grid content-start gap-4">
          {rows.length === 0 ? (
            <EmptyState title="No products were found" description="The AI found no products in this file. You can still confirm the document so its text is used for answers." />
          ) : (
            rows.map((r, i) => {
              const e = errors[i] ?? {};
              const exists = existing.data?.has(r.sku.trim().toUpperCase());
              const id = (f: string) => `r${i}-${f}`;
              return (
                <Card key={i} id={`row-${i}`} className={r.include ? "" : "opacity-60"}>
                  <CardHeader className="flex-row items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <Checkbox checked={r.include} onCheckedChange={(v) => update(i, { include: !!v })} aria-label={`Include ${r.name || `product ${i + 1}`}`} />
                      {r.name || `Product ${i + 1}`}
                    </label>
                    <div className="flex items-center gap-2">
                      {exists && <Badge tone="info">Updates existing SKU</Badge>}
                      {r.source_page && <Badge tone="outline">Page {r.source_page}</Badge>}
                    </div>
                  </CardHeader>
                  {r.include && (
                    <CardContent className="grid gap-3 sm:grid-cols-3">
                      <Field label="Name" htmlFor={id("name")} error={e.name} className="sm:col-span-2">
                        <Input id={id("name")} value={r.name} aria-invalid={!!e.name} onChange={(ev) => update(i, { name: ev.target.value })} />
                      </Field>
                      <Field label="SKU" htmlFor={id("sku")} error={e.sku}>
                        <Input id={id("sku")} value={r.sku} aria-invalid={!!e.sku} onChange={(ev) => update(i, { sku: ev.target.value })} />
                      </Field>
                      <Field label="Category" htmlFor={id("cat")}>
                        <Input id={id("cat")} value={r.category} onChange={(ev) => update(i, { category: ev.target.value })} />
                      </Field>
                      <Field label="Unit" htmlFor={id("unit")} error={e.unit}>
                        <Input id={id("unit")} value={r.unit} aria-invalid={!!e.unit} onChange={(ev) => update(i, { unit: ev.target.value })} />
                      </Field>
                      <Field label="MOQ" htmlFor={id("moq")} error={e.moq}>
                        <Input id={id("moq")} inputMode="numeric" value={r.moq} aria-invalid={!!e.moq} onChange={(ev) => update(i, { moq: ev.target.value })} />
                      </Field>
                      <Field label="MRP (₹)" htmlFor={id("mrp")} error={e.mrp}>
                        <Input id={id("mrp")} inputMode="decimal" value={r.mrp} aria-invalid={!!e.mrp} onChange={(ev) => update(i, { mrp: ev.target.value })} />
                      </Field>
                      <Field label="Distributor price (₹)" htmlFor={id("dp")} error={e.distributor} hint={r.distributor && Number.isFinite(rupeesToPaise(r.distributor)) ? formatINR(rupeesToPaise(r.distributor)) : undefined}>
                        <Input id={id("dp")} inputMode="decimal" value={r.distributor} aria-invalid={!!e.distributor} onChange={(ev) => update(i, { distributor: ev.target.value })} />
                      </Field>
                      <Field label="GST" htmlFor={id("gst")}>
                        <NativeSelect id={id("gst")} value={r.gst} onChange={(ev) => update(i, { gst: ev.target.value })}>
                          {GST_RATES.map((g) => <option key={g} value={g}>{g}%</option>)}
                        </NativeSelect>
                      </Field>
                      <Field label="HSN" htmlFor={id("hsn")} error={e.hsn}>
                        <Input id={id("hsn")} inputMode="numeric" value={r.hsn} aria-invalid={!!e.hsn} onChange={(ev) => update(i, { hsn: ev.target.value })} />
                      </Field>
                      <Field label="Certifications" htmlFor={id("cert")} className="sm:col-span-2">
                        <Input id={id("cert")} value={r.certifications} onChange={(ev) => update(i, { certifications: ev.target.value })} />
                      </Field>
                      <Field label="Description" htmlFor={id("desc")} className="sm:col-span-3">
                        <Textarea id={id("desc")} rows={2} value={r.description} onChange={(ev) => update(i, { description: ev.target.value })} />
                      </Field>
                      <Field label="Specs (one per line, key: value)" htmlFor={id("specs")} className="sm:col-span-3">
                        <Textarea id={id("specs")} rows={3} value={r.specs} onChange={(ev) => update(i, { specs: ev.target.value })} className="font-mono text-xs" />
                      </Field>
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}

          <Card>
            <CardHeader>
              <CardTitle>Knowledge for the AI</CardTitle>
              <CardDescription>Specs, FAQs and claims the AI may use when answering buyers. Untick anything that is wrong.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {knowledge.length === 0 ? (
                <p className="text-sm text-muted-foreground">No extra knowledge extracted.</p>
              ) : (
                knowledge.map((k, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border border-border p-3">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Checkbox
                        checked={k.include}
                        onCheckedChange={(v) => setKnowledge((ks) => ks.map((x, j) => (j === i ? { ...x, include: !!v } : x)))}
                        aria-label={`Include ${k.title || `note ${i + 1}`}`}
                      />
                      <Input
                        aria-label="Title"
                        value={k.title}
                        onChange={(ev) => setKnowledge((ks) => ks.map((x, j) => (j === i ? { ...x, title: ev.target.value } : x)))}
                      />
                      {k.product_sku && <Badge tone="outline">{k.product_sku}</Badge>}
                    </label>
                    <Textarea
                      aria-label={`Content of ${k.title || `note ${i + 1}`}`}
                      rows={3}
                      value={k.content}
                      onChange={(ev) => setKnowledge((ks) => ks.map((x, j) => (j === i ? { ...x, content: ev.target.value } : x)))}
                    />
                  </div>
                ))
              )}
              <label className="flex items-center gap-3 text-sm">
                <Switch checked={share} onCheckedChange={setShare} aria-label="Allow the AI to share this catalogue with buyers" />
                Allow the AI to send this catalogue to buyers on WhatsApp
              </label>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
