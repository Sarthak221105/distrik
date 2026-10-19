// embeddings-index (PRD 9): chunks a confirmed document's knowledge plus its
// confirmed products into knowledge_chunks (idempotent: the document's chunks
// are replaced), then embeds chunks with the built in gte-small model (384
// dims). Without Supabase.ai the embeddings stay null and keyword search works.

import { embedText } from "../_shared/agent/tools.ts";
import { errorMessage } from "../_shared/log.ts";
import { rpc } from "../_shared/supabase.ts";
import { PermanentError, serveWorker } from "../_shared/worker.ts";

const EMBED_BATCH = 12;

function productChunk(p: Record<string, unknown>): string {
  const specs = Object.entries((p.specs ?? {}) as Record<string, unknown>).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join("; ");
  const certs = Array.isArray(p.certifications) && p.certifications.length ? ` Certifications: ${(p.certifications as string[]).join(", ")}.` : "";
  return `${p.name} (SKU ${p.sku}): ${p.description ?? ""} Unit: ${p.unit}. Minimum order: ${p.moq} ${p.unit}. ` +
    (specs ? `Specs: ${specs}.` : "") + certs + (p.hsn_code ? ` HSN ${p.hsn_code}, GST ${p.gst_rate}%.` : "");
}

serveWorker<{ document_id?: string; manufacturer_id?: string; mode?: string }>({
  name: "embeddings-index",
  queue: "embeddings",
  vt: 180,
  batch: 2,
  async handle(job, { svc, log: base }) {
    const log = base.child({ document_id: job.document_id ?? null, manufacturer_id: job.manufacturer_id ?? null });
    let mid = job.manufacturer_id ?? null;

    if (job.document_id) {
      const { data: doc, error } = await svc.from("documents").select("*").eq("id", job.document_id).maybeSingle();
      if (error) throw error;
      if (!doc) throw new PermanentError("document not found");
      mid = doc.manufacturer_id;
      if (doc.status !== "indexed") {
        const extracted = (doc.extracted ?? {}) as Record<string, unknown>;
        const knowledge = Array.isArray(extracted.knowledge) ? extracted.knowledge as Array<Record<string, unknown>> : [];
        const { data: products } = await svc.from("products")
          .select("id, name, sku, description, specs, unit, moq, hsn_code, gst_rate, certifications")
          .eq("manufacturer_id", doc.manufacturer_id).eq("source_document_id", doc.id).eq("status", "active");
        const skuToId = new Map<string, string>();
        const { data: allProducts } = await svc.from("products").select("id, sku").eq("manufacturer_id", doc.manufacturer_id);
        for (const p of allProducts ?? []) skuToId.set(String(p.sku).toLowerCase(), p.id);

        const rows: Array<Record<string, unknown>> = [];
        for (const k of knowledge) {
          const content = String(k.content ?? "").trim();
          if (content.length < 10) continue;
          const sku = typeof k.product_sku === "string" ? k.product_sku.toLowerCase() : null;
          rows.push({
            manufacturer_id: doc.manufacturer_id,
            document_id: doc.id,
            product_id: sku ? skuToId.get(sku) ?? null : null,
            content: (k.title ? `${k.title}: ` : "") + content.slice(0, 4000),
            metadata: { source: "document", title: k.title ?? null, page: k.source_page ?? null },
          });
        }
        for (const p of products ?? []) {
          rows.push({
            manufacturer_id: doc.manufacturer_id,
            document_id: doc.id,
            product_id: p.id,
            content: productChunk(p),
            metadata: { source: "product", sku: p.sku },
          });
        }
        // Idempotent: replace this document's chunks.
        const del = await svc.from("knowledge_chunks").delete().eq("document_id", doc.id);
        if (del.error) throw del.error;
        if (rows.length) {
          const ins = await svc.from("knowledge_chunks").insert(rows);
          if (ins.error) throw ins.error;
        }
        await svc.from("documents").update({ status: "indexed", error: null }).eq("id", doc.id);
        log.info("document_chunked", { chunks: rows.length, products: products?.length ?? 0 });
      }
    }
    if (!mid) throw new PermanentError("job has no manufacturer_id or document_id");

    // Embed chunks that have no embedding yet, a bounded batch per run.
    const { data: pending, error: pErr } = await svc.from("knowledge_chunks").select("id, content")
      .eq("manufacturer_id", mid).is("embedding", null).order("created_at").limit(EMBED_BATCH);
    if (pErr) throw pErr;
    let embedded = 0;
    for (const c of pending ?? []) {
      let vec: number[] | null = null;
      try {
        vec = await embedText(c.content);
      } catch (e) {
        log.warn("embedding_failed", { error: errorMessage(e) });
        break;
      }
      if (!vec) {
        log.info("embeddings_unavailable", { note: "Supabase.ai not available; keyword search will be used" });
        break;
      }
      const up = await svc.from("knowledge_chunks").update({ embedding: JSON.stringify(vec) }).eq("id", c.id);
      if (up.error) throw up.error;
      embedded++;
    }
    if (embedded > 0 && (pending?.length ?? 0) === EMBED_BATCH) {
      await rpc(svc, "queue_send", { p_queue: "embeddings", p_msg: { manufacturer_id: mid, mode: "missing" }, p_delay: 2 });
    }
    log.info("embeddings_done", { embedded, batch: pending?.length ?? 0 });
  },
});
