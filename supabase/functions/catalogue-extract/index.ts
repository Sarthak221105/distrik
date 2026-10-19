// catalogue-extract (authenticated, owner / sales_head): proposes structured
// products and knowledge from an uploaded catalogue for the review screen.
// Nothing becomes a product here; the manufacturer confirms every field.
//
// POST { document_id: uuid }
// 200  { status: "review" | "failed", extracted: { products: [...], knowledge: [...], warning?, method } }

import { aiEnabled, aiModel, fileBlock, structuredCall } from "../_shared/ai.ts";
import { requireCaller, requireRole } from "../_shared/auth.ts";
import { AppError, errorResponse, json, preflight, readJson, requireUuid } from "../_shared/http.ts";
import { errorMessage, logger } from "../_shared/log.ts";
import { chunkText, pdfText } from "../_shared/pdf_text.ts";
import { downloadBytes, serviceClient, userClient } from "../_shared/supabase.ts";

const log = logger({ fn: "catalogue-extract" });
const GST = [0, 0.25, 3, 5, 12, 18, 28, 40];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["products", "knowledge"],
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "sku", "category", "description", "specs", "unit", "mrp_paise", "distributor_price_paise", "moq", "hsn_code", "gst_rate", "certifications", "source_page"],
        properties: {
          name: { type: "string" },
          sku: { type: ["string", "null"] },
          category: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          specs: {
            type: "array",
            description: "Specification name/value pairs as printed",
            items: { type: "object", additionalProperties: false, required: ["name", "value"], properties: { name: { type: "string" }, value: { type: "string" } } },
          },
          unit: { type: ["string", "null"], description: "Selling unit, e.g. jar, carton of 12" },
          mrp_paise: { type: ["integer", "null"], description: "MRP in paise (rupees x 100)" },
          distributor_price_paise: { type: ["integer", "null"], description: "Trade / distributor price in paise" },
          moq: { type: ["integer", "null"] },
          hsn_code: { type: ["string", "null"] },
          gst_rate: { type: ["number", "null"] },
          certifications: { type: "array", items: { type: "string" } },
          source_page: { type: ["integer", "null"] },
        },
      },
    },
    knowledge: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "content", "product_sku"],
        properties: { title: { type: "string" }, content: { type: "string" }, product_sku: { type: ["string", "null"] } },
      },
    },
  },
};

interface AiProduct {
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  specs: Array<{ name: string; value: string }>;
  unit: string | null;
  mrp_paise: number | null;
  distributor_price_paise: number | null;
  moq: number | null;
  hsn_code: string | null;
  gst_rate: number | null;
  certifications: string[];
  source_page: number | null;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  let documentId: string | null = null;
  try {
    if (req.method !== "POST") throw new AppError(405, "method_not_allowed", "POST only");
    const caller = await requireCaller(req);
    requireRole(caller, ["owner", "sales_head"]);
    const body = await readJson<{ document_id?: unknown }>(req);
    documentId = requireUuid(body.document_id, "document_id");

    // Authorisation: RLS limits this select to the caller's tenant.
    const { data: doc, error } = await userClient(caller.token).from("documents")
      .select("id, manufacturer_id, storage_path, mime_type, title, status").eq("id", documentId).maybeSingle();
    if (error) throw new AppError(500, "database_error", error.message);
    if (!doc || doc.manufacturer_id !== caller.manufacturerId) throw new AppError(404, "not_found", "Document not found", "document_id");
    if (doc.status === "extracting") throw new AppError(409, "already_extracting", "Extraction is already running for this document");

    const svc = serviceClient();
    await svc.from("documents").update({ status: "extracting", error: null }).eq("id", doc.id);
    const l = log.child({ document_id: doc.id, manufacturer_id: doc.manufacturer_id });

    let extracted: Record<string, unknown>;
    try {
      const bytes = await downloadBytes(svc, "catalogues", doc.storage_path);
      const mime = doc.mime_type ?? (doc.storage_path.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      if (aiEnabled()) {
        const { data } = await structuredCall<{ products: AiProduct[]; knowledge: Array<{ title: string; content: string; product_sku: string | null }> }>({
          model: aiModel(),
          maxTokens: 16000,
          effort: "medium",
          schema: SCHEMA,
          system:
            "You extract a product catalogue for an Indian B2B manufacturer. Propose one entry per sellable SKU with the fields printed in the document. " +
            "Convert rupee prices to integer paise. If a field is not printed, use null; never invent prices, MOQs or certifications. " +
            "Put FAQs, policies, delivery terms, certifications and long specs into knowledge passages (self contained, under 150 words each).",
          messages: [{ role: "user", content: [fileBlock(bytes, mime), { type: "text", text: `Extract the catalogue "${doc.title ?? "catalogue"}".` }] }],
        });
        extracted = {
          products: (data.products ?? []).map((p) => ({
            ...p,
            specs: Object.fromEntries((p.specs ?? []).map((s) => [s.name, s.value])),
            gst_rate: p.gst_rate !== null && GST.includes(Number(p.gst_rate)) ? Number(p.gst_rate) : null,
          })),
          knowledge: data.knowledge ?? [],
          method: "claude",
          model: aiModel(),
        };
      } else {
        const text = mime === "application/pdf" ? (await pdfText(bytes)).pages : [];
        const knowledge = text.flatMap((page, i) => chunkText(page).map((c, j) => ({ title: `Page ${i + 1}${j ? ` (${j + 1})` : ""}`, content: c, product_sku: null })));
        extracted = {
          products: [],
          knowledge,
          warning: "AI extraction is not configured; add products manually",
          method: "text",
        };
      }
      await svc.from("documents").update({ status: "review", extracted, error: null }).eq("id", doc.id);
      l.info("catalogue_extracted", { method: extracted.method, products: (extracted.products as unknown[]).length, knowledge: (extracted.knowledge as unknown[]).length });
      return json({ status: "review", extracted });
    } catch (e) {
      const msg = errorMessage(e).slice(0, 500);
      await svc.from("documents").update({ status: "failed", error: msg }).eq("id", doc.id);
      l.error("catalogue_extract_failed", { error: msg });
      return json({ status: "failed", extracted: null, error: { code: "extraction_failed", message: msg, field: null } }, 200);
    }
  } catch (e) {
    return errorResponse(e);
  }
});
