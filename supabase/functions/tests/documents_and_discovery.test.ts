import { assert, assertEquals } from "jsr:@std/assert@1";
import { generateDemoDirectory, recordCount } from "../_shared/demo_directory.ts";
import { classifyHeuristic, researchFromPayload } from "../_shared/discovery.ts";
import { parsePoText } from "../_shared/po_fallback.ts";
import { buildQuotationPdf, pdfSafe, quotationFileKey } from "../_shared/quotation_pdf.ts";
import { pickTemplate, renderTemplate } from "../_shared/agent/templates.ts";

Deno.test("demo directory is deterministic per campaign and passes E.164 normalisation", () => {
  const a = generateDemoDirectory({ campaignId: "c1", city: "Bhopal", state: "Madhya Pradesh", category: "edible_oil", count: 60 });
  const b = generateDemoDirectory({ campaignId: "c1", city: "Bhopal", state: "Madhya Pradesh", category: "edible_oil", count: 60 });
  assertEquals(a, b);
  assertEquals(a.length, 60);
  assertEquals(new Set(a.map((r) => r.external_id)).size, 60);
  for (const r of a) {
    assert(/^\+919\d{9}$/.test(r.phone!), r.phone!);
    assert(Math.abs(r.lat - 23.2599) < 0.1 && Math.abs(r.lng - 77.4126) < 0.1);
    assertEquals(r.verified, Boolean(r.source_url));
    if (r.source_url) assert(r.source_url.startsWith("https://demo.directory.local/bhopal/"));
    for (const v of Object.values(r.signals)) assert(v >= 0 && v <= 1);
  }
  const listed = a.filter((r) => r.source_url).length / a.length;
  assert(listed > 0.5 && listed < 0.9, `~70% listed, got ${listed}`);
  const c = generateDemoDirectory({ campaignId: "c2", city: "Bhopal", state: null, category: null, count: 5 });
  assert(c[0].name !== a[0].name || c[0].phone !== a[0].phone);
  assertEquals(recordCount(60, 75), 75);
  assertEquals(recordCount(undefined, 500), 200);
});

Deno.test("classification heuristics and research fallback (never guess zero)", () => {
  const c = classifyHeuristic({ name: "Bhopal Super Stockist", typeHint: "super_stockist", brands: ["Fortune"] });
  assertEquals(c.type, "super_stockist");
  assertEquals(c.category, "edible_oil");
  assert(c.confidence >= 0.7);
  assertEquals(classifyHeuristic({ name: "Sharma Kirana Bhandar" }).type, "retailer");

  const r = researchFromPayload({ name: "X Traders", type: "wholesaler", city: "Bhopal" }, {
    source_url: "https://demo.directory.local/bhopal/x",
    brands: ["MDH", "Everest"],
    signals: { geographic_coverage: 0.6, logistics: null },
    contact_name: "Ramesh Gupta",
    contact_role: "Proprietor",
    description: "X Traders supplying MDH to around 300 retail outlets.",
  });
  assertEquals(r.signals, { geographic_coverage: 0.6 });
  assertEquals(r.research.inferred, false);
  assertEquals(r.research.retail_reach, "300 outlets");
  assertEquals((r.research.signal_sources as Record<string, string>).geographic_coverage, "research");
  const inferred = researchFromPayload({ name: "Y", type: "dealer", city: null }, { signals: { company_size: 0.4 } });
  assertEquals(inferred.research.inferred, true);
  assertEquals((inferred.research.signal_sources as Record<string, string>).company_size, "inferred");
});

Deno.test("PO regex fallback parses a simple PO and cross checks totals", () => {
  const text = `PURCHASE ORDER
PO No: ATC/PO/4471   Date: 18/10/2026
Buyer: Agrawal Trading Company
GSTIN 23AAKPA1234B1Z9
Deliver to: 12, Hamidia Road, Bhopal 462001
S.No Item SKU Qty Rate Amount
1 Kachi Ghani Mustard Oil 5 L Jar SKO-5L 60 558.00 33,480.00
Sub Total 33,480.00
GST @ 5% 1,674.00
Grand Total Rs. 35,154.00`;
  const r = parsePoText(text, [{ sku: "SKO-5L", name: "Kachi Ghani Mustard Oil 5 L Jar" }]);
  assertEquals(r.parsed?.po_number, "ATC/PO/4471");
  assertEquals(r.parsed?.po_date, "2026-10-18");
  assertEquals(r.parsed?.buyer_gstin, "23AAKPA1234B1Z9");
  assertEquals(r.parsed?.lines, [{ sku: "SKO-5L", description: "Kachi Ghani Mustard Oil 5 L Jar", qty: 60, unit_price_paise: 55800, total_paise: 3348000 }]);
  assertEquals(r.parsed?.total_paise, 3515400);
  assertEquals(r.parsed?.tax_paise, 167400);
  assert(r.confidence >= 0.8, `confidence ${r.confidence}`);
  assertEquals(r.uncertain_fields, []);
  const none = parsePoText("Hello, thanks for the call", [{ sku: "SKO-5L", name: "x" }]);
  assertEquals(none.parsed, null);
});

Deno.test("quotation PDF builds (A4, WinAnsi safe) and keys follow the convention", async () => {
  assertEquals(pdfSafe("₹558 – नमस्ते"), "Rs. 558 – ??????");
  assertEquals(quotationFileKey("m1", "SF/2026/0003", 2), "m1/SF-2026-0003-v2.pdf");
  const bytes = await buildQuotationPdf({
    number: "SF/2026/0003", version: 1, date: "2026-10-18T06:00:00Z", validUntil: "2026-11-02", taxMode: "inter",
    seller: { name: "Shakti Foods", legalName: "Shakti Masala & Foods Pvt Ltd", gstin: "23AABCS1234F1Z5", address: "Plot 14, Indore", city: "Indore", state: "Madhya Pradesh", stateCode: "23", phone: "+919826000000", email: "sales@shakti.test" },
    buyer: { name: "Orange City Spices", address: "21, Itwari", city: "Nagpur", state: "Maharashtra", stateCode: "27", gstin: null },
    lines: [{ sku: "SGM-100", name: "Garam Masala 100 g", unit: "carton of 60", hsn_code: "0910", qty: 30, unit_price_paise: 335000, gst_rate: 5, taxable_paise: 10050000, tax_paise: 502500, cgst_paise: 0, sgst_paise: 0, igst_paise: 502500, line_total_paise: 10552500 }],
    subtotalPaise: 10050000, taxPaise: 502500, shippingPaise: 0, totalPaise: 10552500, paymentTerms: "15 days credit", notes: "Ex-works",
  });
  assertEquals(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert(bytes.length > 2000);
});

Deno.test("templates: purpose aliases, language preference and rendering", () => {
  const templates = [
    { id: "a", name: "quotation_ready", language: "en", body: "Hello {{1}}, your quotation {{2}} is ready.", variables: ["name", "quotation_number"], purpose: "quotation", manufacturer_id: "m" },
    { id: "b", name: "reorder_reminder", language: "hi", body: "Namaste {{1}}, {{2}} order {{3}}", variables: ["name", "product", "date"], purpose: "reorder", manufacturer_id: "m" },
  ];
  const t = pickTemplate(templates, "quotation_ready", "en", "m")!;
  assertEquals(t.id, "a");
  assertEquals(renderTemplate(t, { name: "Ramesh", quotation_number: "SF/2026/0003" }), { body: "Hello Ramesh, your quotation SF/2026/0003 is ready.", params: ["Ramesh", "SF/2026/0003"] });
  assertEquals(pickTemplate(templates, "reorder", "hinglish")?.id, "b");
  assertEquals(pickTemplate(templates, "followup", "en"), null);
});
