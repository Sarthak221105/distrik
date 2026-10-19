// PDF text extraction for the no-AI fallbacks (catalogue-extract, po-parse).

import { extractText, getDocumentProxy } from "npm:unpdf@1.9.0";

export async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: string[] }> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [String(text)]).map((t) => t.replace(/[ \t]+/g, " ").trim());
  return { text: pages.join("\n\n"), pages };
}

/** Splits text into knowledge chunks of roughly maxChars, on paragraph / sentence boundaries. */
export function chunkText(text: string, maxChars = 900): string[] {
  const paras = text.split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z])/).map((p) => p.trim()).filter((p) => p.length > 0);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + " " + p).trim().length > maxChars && cur) {
      chunks.push(cur.trim());
      cur = "";
    }
    if (p.length > maxChars) {
      for (let i = 0; i < p.length; i += maxChars) chunks.push(p.slice(i, i + maxChars).trim());
    } else cur = (cur + " " + p).trim();
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.filter((c) => c.length >= 20);
}
