// po-parse (PRD 10): reads a purchase order (PDF or image) with Claude using a
// JSON schema and per field confidence, then runs the SQL matcher. Uncertain
// fields are flagged, never guessed. Without an API key a regex parser handles
// simple text POs; anything it cannot read stays null and the matcher marks
// the PO needs_review.

import { aiEnabled, aiModel, fileBlock, structuredCall } from "../_shared/ai.ts";
import { errorMessage } from "../_shared/log.ts";
import { pdfText } from "../_shared/pdf_text.ts";
import { type ParsedPo, parsePoText, type PoParseResult } from "../_shared/po_fallback.ts";
import { downloadBytes, rpc, splitStoragePath } from "../_shared/supabase.ts";
import { PermanentError, serveWorker } from "../_shared/worker.ts";

const nullable = (t: string) => ({ type: [t, "null"] });

const PO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["po_number", "po_date", "buyer_name", "buyer_gstin", "delivery_address", "lines", "subtotal_paise", "tax_paise", "total_paise", "field_confidence", "confidence"],
  properties: {
    po_number: nullable("string"),
    po_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    buyer_name: nullable("string"),
    buyer_gstin: nullable("string"),
    delivery_address: nullable("string"),
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sku", "description", "qty", "unit_price_paise", "total_paise"],
        properties: {
          sku: nullable("string"),
          description: nullable("string"),
          qty: nullable("number"),
          unit_price_paise: { type: ["integer", "null"], description: "Unit price ex GST in paise (rupees x 100)" },
          total_paise: { type: ["integer", "null"], description: "Line total in paise" },
        },
      },
    },
    subtotal_paise: nullable("integer"),
    tax_paise: nullable("integer"),
    total_paise: nullable("integer"),
    field_confidence: {
      type: "object",
      additionalProperties: false,
      required: ["po_number", "lines", "qty", "unit_price", "total"],
      properties: {
        po_number: { type: "number" },
        lines: { type: "number" },
        qty: { type: "number" },
        unit_price: { type: "number" },
        total: { type: "number" },
      },
    },
    confidence: { type: "number", description: "Overall confidence 0 to 1" },
  },
};

type AiPo = ParsedPo & { field_confidence: Record<string, number>; confidence: number };

serveWorker<{ po_id: string }>({
  name: "po-parse",
  queue: "po_parse",
  vt: 120,
  batch: 2,
  async handle(job, { svc, log: base, readCt }) {
    if (!job?.po_id) throw new PermanentError("job has no po_id");
    const log = base.child({ po_id: job.po_id });
    const { data: po, error } = await svc.from("purchase_orders").select("*").eq("id", job.po_id).maybeSingle();
    if (error) throw error;
    if (!po) throw new PermanentError("purchase order not found");
    if (["confirmed", "rejected"].includes(po.status) || (po.status === "parsed" && po.match_status !== "pending")) {
      log.info("po_already_processed", { status: po.status });
      return;
    }
    await svc.from("purchase_orders").update({ status: "parsing", error: null }).eq("id", po.id);

    const { data: products } = await svc.from("products").select("sku, name").eq("manufacturer_id", po.manufacturer_id);
    let result: PoParseResult = { parsed: null, field_confidence: {}, confidence: 0, uncertain_fields: [] };
    let method = "none";
    try {
      const { bucket, key } = splitStoragePath(po.file_path);
      const bytes = await downloadBytes(svc, bucket, key);
      const mime = po.mime_type ?? (key.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      if (aiEnabled() && (mime === "application/pdf" || mime.startsWith("image/"))) {
        try {
          const { data } = await structuredCall<AiPo>({
            model: aiModel(),
            maxTokens: 4000,
            effort: "low",
            schema: PO_SCHEMA,
            system:
              "You extract purchase orders sent by Indian B2B buyers. Convert rupee amounts to integer paise (multiply by 100). " +
              "If a field is unreadable or absent, return null and give it a low confidence. Never guess a number. " +
              `Known SKUs of this supplier: ${(products ?? []).map((p) => p.sku).join(", ")}.`,
            messages: [{ role: "user", content: [fileBlock(bytes, mime), { type: "text", text: "Extract this purchase order." }] }],
          });
          const fc = data.field_confidence ?? {};
          const { field_confidence: _f, confidence: _c, ...parsed } = data;
          result = {
            parsed: parsed as ParsedPo,
            field_confidence: fc,
            confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)),
            uncertain_fields: Object.entries(fc).filter(([, v]) => Number(v) < 0.7).map(([k]) => k),
          };
          method = "claude";
        } catch (e) {
          if (readCt < 3) throw e;
          log.warn("ai_parse_failed_fallback", { error: errorMessage(e) });
        }
      }
      if (method === "none" && mime === "application/pdf") {
        const { text } = await pdfText(bytes);
        result = parsePoText(text, (products ?? []) as Array<{ sku: string; name: string }>);
        method = result.parsed ? "regex" : "regex_failed";
      }
    } catch (e) {
      if (readCt < 3 && !(e instanceof PermanentError) && !String(errorMessage(e)).includes("file_not_found") && !String(errorMessage(e)).includes("Could not download")) {
        throw e;
      }
      log.warn("po_unreadable", { error: errorMessage(e) });
      await svc.from("purchase_orders").update({ error: errorMessage(e).slice(0, 500) }).eq("id", po.id);
    }

    const parsed = result.parsed ? { ...result.parsed, uncertain_fields: result.uncertain_fields, parse_method: method } : null;
    const upd = await svc.from("purchase_orders").update({
      parsed,
      field_confidence: result.parsed ? result.field_confidence : null,
      confidence: result.parsed ? result.confidence : null,
      status: "parsed",
    }).eq("id", po.id);
    if (upd.error) throw upd.error;
    const status = await rpc<string>(svc, "match_purchase_order", { p_po: po.id });
    log.info("po_parsed", { method, confidence: result.confidence, match_status: status, lines: result.parsed?.lines.length ?? 0 });
  },
});
