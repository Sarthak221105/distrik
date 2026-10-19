// Local setup after `supabase db reset`: uploads sample files referenced by
// the seed (catalogue, certificate, two purchase orders) and queues PDF
// generation for the seeded quotations.
//
//   deno run -A scripts/setup-local.ts
//
// Reads the local API URL and secret key from `supabase status -o json`.
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const MID = "11111111-1111-4111-8111-111111111111";

async function localEnv(): Promise<{ url: string; key: string }> {
  const out = await new Deno.Command("supabase", { args: ["status", "-o", "json"], stdout: "piped", stderr: "null" }).output();
  const status = JSON.parse(new TextDecoder().decode(out.stdout));
  const url = status.API_URL ?? status.api_url;
  const key = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY ?? status.service_role_key;
  if (!url || !key) throw new Error("Could not read API_URL / SERVICE_ROLE_KEY from `supabase status -o json`");
  return { url, key };
}

async function simplePdf(title: string, lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 790;
  page.drawText(title, { x: 48, y, size: 18, font: bold, color: rgb(0.06, 0.46, 0.43) });
  y -= 32;
  for (const line of lines) {
    if (y < 60) {
      page = doc.addPage([595, 842]);
      y = 790;
    }
    const isHeading = line.startsWith("# ");
    page.drawText(isHeading ? line.slice(2) : line, { x: 48, y, size: isHeading ? 13 : 10.5, font: isHeading ? bold : font });
    y -= isHeading ? 22 : 16;
  }
  return doc.save();
}

const { url, key } = await localEnv();
const supabase = createClient(url, key, { auth: { persistSession: false } });

const files: { bucket: string; path: string; body: Uint8Array }[] = [
  {
    bucket: "catalogues",
    path: `${MID}/catalogue/shakti-trade-catalogue-2026.pdf`,
    body: await simplePdf("Shakti Foods · Trade Catalogue 2026", [
      "Shakti Masala & Foods Pvt Ltd · Indore, Madhya Pradesh · GSTIN 23AABCS1234F1Z5",
      "",
      "# Kachi Ghani Mustard Oil 5 L Jar (SKO-5L)",
      "Cold pressed, Agmark Grade 1, high pungency. HSN 1514, GST 5%. MOQ 20 jars.",
      "Shelf life 9 months. Ships on pallets of 120 jars.",
      "# Kachi Ghani Mustard Oil 1 L Bottle (SKO-1L)",
      "PET bottle, carton of 12. HSN 1514, GST 5%. MOQ 10 cartons.",
      "# Garam Masala 100 g (SGM-100)",
      "13 whole spices, stone ground. Carton of 60. HSN 0910, GST 5%. MOQ 5 cartons.",
      "# Turmeric Powder 500 g (STP-500)",
      "Salem turmeric, curcumin above 3%. Carton of 24. HSN 0910, GST 5%.",
      "# Kashmiri Chilli Powder 200 g (SCP-200)",
      "Mild heat, ASTA colour 120. Carton of 50. HSN 0910, GST 5%.",
      "",
      "# Logistics",
      "Dispatch within 3 working days from the Indore plant. Freight at actuals;",
      "orders above Rs. 2 lakh within Madhya Pradesh ship freight free.",
      "# Distributor support",
      "Monthly retailer schemes, POS material, dedicated area sales officer above 500 jars a month.",
    ]),
  },
  {
    bucket: "catalogues",
    path: `${MID}/catalogue/fssai-licence.pdf`,
    body: await simplePdf("FSSAI Central Licence", [
      "Licence number 10019043001234",
      "Shakti Masala & Foods Pvt Ltd, Plot 14, Sector F, Sanwer Road, Indore",
      "Valid until 31 March 2028",
    ]),
  },
  {
    bucket: "purchase-orders",
    path: `${MID}/agrawal-po-4471.pdf`,
    body: await simplePdf("PURCHASE ORDER ATC/PO/4471", [
      "Agrawal Trading Company · 12, Hamidia Road, Bhopal 462001 · GSTIN 23AAKPA1234B1Z9",
      "To: Shakti Masala & Foods Pvt Ltd, Indore",
      "Reference: Quotation SF/2026/0001",
      "",
      "SKU        Description                         Qty    Rate (Rs.)   Amount (Rs.)",
      "SKO-5L     Kachi Ghani Mustard Oil 5 L Jar      60     558.00       33,480.00",
      "",
      "Subtotal Rs. 33,480.00   GST 5% Rs. 1,674.00   Total Rs. 35,154.00",
      "Delivery: 12, Hamidia Road, Bhopal 462001",
    ]),
  },
  {
    bucket: "purchase-orders",
    path: `${MID}/rathore-po-0912.pdf`,
    body: await simplePdf("PURCHASE ORDER RA-0912", [
      "Rathore Agencies · Govindpura, Bhopal",
      "To: Shakti Masala & Foods Pvt Ltd, Indore",
      "",
      "SKU        Description                 Qty    Rate (Rs.)    Amount (Rs.)",
      "SGM-100    Garam Masala 100g carton     36     3,200.00      1,15,200.00",
      "",
      "Total Rs. 1,20,960.00 incl. GST",
    ]),
  },
];

for (const f of files) {
  const { error } = await supabase.storage.from(f.bucket).upload(f.path, f.body, {
    contentType: "application/pdf",
    upsert: true,
  });
  console.log(error ? `✗ ${f.bucket}/${f.path}: ${error.message}` : `✓ ${f.bucket}/${f.path}`);
}

// Generate PDFs for the seeded quotations (the worker never resends a quotation already sent).
const { data: quotes } = await supabase.from("quotations").select("id, number").not("status", "eq", "superseded");
for (const q of quotes ?? []) {
  const { error } = await supabase.rpc("queue_send", { p_queue: "quotation_jobs", p_msg: { quotation_id: q.id }, p_delay: 0 });
  console.log(error ? `✗ queue ${q.number}: ${error.message}` : `✓ queued PDF for ${q.number}`);
}
