// quotation-pdf (PRD 10): builds the GST quotation PDF, stores it in the
// private quotations bucket and, for a newly generated quotation, sends it to
// the buyer (document inside the 24 hour window, quotation_ready template
// outside it). Seeded / already sent quotations are only (re)generated.

import { pickTemplate, renderTemplate } from "../_shared/agent/templates.ts";
import type { Template } from "../_shared/agent/context.ts";
import { isAppCode } from "../_shared/http.ts";
import { errorMessage } from "../_shared/log.ts";
import { buildQuotationPdf, type QuotationLine, quotationFileKey } from "../_shared/quotation_pdf.ts";
import { rpc } from "../_shared/supabase.ts";
import { PermanentError, serveWorker } from "../_shared/worker.ts";

serveWorker<{ quotation_id: string }>({
  name: "quotation-pdf",
  queue: "quotation_jobs",
  vt: 60,
  batch: 3,
  async handle(job, { svc, log: base }) {
    if (!job?.quotation_id) throw new PermanentError("job has no quotation_id");
    const log = base.child({ quotation_id: job.quotation_id });
    const { data: q, error } = await svc.from("quotations").select("*").eq("id", job.quotation_id).maybeSingle();
    if (error) throw error;
    if (!q) throw new PermanentError("quotation not found");
    if (q.status === "superseded" && q.pdf_path) return;

    const [{ data: mfr }, { data: prospect }, { data: neg }] = await Promise.all([
      svc.from("manufacturers").select("id, name, legal_name, gstin, address, city, state, state_code, phone, email").eq("id", q.manufacturer_id).single(),
      svc.from("prospects").select("id, name, address, city, state, gstin").eq("id", q.prospect_id).single(),
      q.negotiation_id
        ? svc.from("negotiations").select("conversation_id").eq("id", q.negotiation_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!mfr || !prospect) throw new Error("manufacturer or prospect missing");
    const buyerStateCode = prospect.state ? await rpc<string | null>(svc, "gst_state_code", { p_state: prospect.state }) : null;

    const pdf = await buildQuotationPdf({
      number: q.number,
      version: q.version,
      date: q.sent_at ?? q.created_at,
      validUntil: q.valid_until,
      taxMode: q.tax_mode,
      seller: {
        name: mfr.name,
        legalName: mfr.legal_name,
        gstin: mfr.gstin,
        address: mfr.address,
        city: mfr.city,
        state: mfr.state,
        stateCode: mfr.state_code,
        phone: mfr.phone,
        email: mfr.email,
      },
      buyer: {
        name: prospect.name,
        address: prospect.address,
        city: prospect.city,
        state: prospect.state,
        stateCode: buyerStateCode,
        gstin: prospect.gstin,
      },
      lines: (q.lines ?? []) as QuotationLine[],
      subtotalPaise: Number(q.subtotal_paise),
      taxPaise: Number(q.tax_paise),
      shippingPaise: Number(q.shipping_paise ?? 0),
      totalPaise: Number(q.total_paise),
      paymentTerms: q.payment_terms,
      notes: q.notes,
    });

    const key = quotationFileKey(q.manufacturer_id, q.number, q.version);
    const up = await svc.storage.from("quotations").upload(key, pdf, { contentType: "application/pdf", upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);
    await svc.from("quotations").update({ pdf_path: key }).eq("id", q.id);
    log.info("quotation_pdf_stored", { bytes: pdf.length, version: q.version });

    if (q.status !== "generating") return; // seeded / already sent: never resend

    // Send to the buyer.
    let conversationId: string | null = (neg as { conversation_id?: string } | null)?.conversation_id ?? null;
    if (!conversationId && q.contact_id) {
      const { data: c } = await svc.from("conversations").select("id").eq("contact_id", q.contact_id).eq("channel", "whatsapp").maybeSingle();
      conversationId = (c as { id: string } | null)?.id ?? null;
    }
    let delivery = "no_conversation";
    if (conversationId) {
      const { data: conv } = await svc.from("conversations").select("id, window_expires_at, contact_id").eq("id", conversationId).single();
      const windowOpen = conv?.window_expires_at && new Date(conv.window_expires_at).getTime() > Date.now() + 60_000;
      const idem = `quotation:${q.id}:v${q.version}`;
      try {
        if (windowOpen) {
          await rpc(svc, "enqueue_outbound_message", {
            p_conversation: conversationId,
            p_body: `Quotation ${q.number} for ${prospect.name}`,
            p_template: null,
            p_actor: "system",
            p_media_path: `quotations/${key}`,
            p_media_type: "document",
            p_media_filename: key.split("/").pop(),
            p_idempotency_key: idem,
          });
          delivery = "document";
        } else {
          const { data: templates } = await svc.from("message_templates").select("id, name, language, body, variables, purpose, manufacturer_id")
            .eq("meta_status", "approved").or(`manufacturer_id.eq.${q.manufacturer_id},manufacturer_id.is.null`);
          const tpl = pickTemplate((templates ?? []) as Template[], "quotation_ready", "en", q.manufacturer_id);
          if (tpl) {
            const { data: contact } = await svc.from("contacts").select("name").eq("id", conv!.contact_id).maybeSingle();
            const first = (contact as { name?: string } | null)?.name?.split(/\s+/)[0] ?? prospect.name;
            const r = renderTemplate(tpl, { name: first, quotation_number: q.number, manufacturer: mfr.name });
            await rpc(svc, "enqueue_outbound_message", {
              p_conversation: conversationId,
              p_body: r.body,
              p_template: tpl.id,
              p_actor: "system",
              p_template_params: r.params,
              p_idempotency_key: idem,
            });
            delivery = "template";
          } else {
            delivery = "no_template";
          }
        }
      } catch (e) {
        if (!isAppCode(e, "consent_required", "window_closed", "template_not_approved", "daily_cap_reached")) throw e;
        delivery = "blocked:" + errorMessage(e).split(" ")[0];
      }
    }
    await svc.from("quotations").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", q.id).eq("status", "generating");
    await svc.from("ai_actions").insert({
      manufacturer_id: q.manufacturer_id,
      conversation_id: conversationId,
      prospect_id: q.prospect_id,
      agent: "system",
      action_type: "quotation_send",
      input: { quotation_id: q.id, number: q.number, version: q.version },
      output: { pdf_path: key, delivery },
      rule_checked: "enqueue_outbound_message",
      outcome: delivery,
    });
    log.info("quotation_sent", { delivery });
  },
});
