// Approved WhatsApp templates for messages outside the 24 hour window.

import type { Template } from "./context.ts";
import type { Lang } from "./intents.ts";

const PURPOSE_ALIASES: Record<string, string[]> = {
  followup: ["followup", "follow_up", "followup_nudge"],
  approval_update: ["approval_update"],
  quotation_ready: ["quotation_ready", "quotation"],
  reorder: ["reorder", "reorder_reminder"],
  outreach_opener: ["outreach_opener", "outreach"],
};

export function pickTemplate(templates: Template[], purpose: string, lang: Lang, manufacturerId?: string): Template | null {
  const aliases = PURPOSE_ALIASES[purpose] ?? [purpose];
  const matches = templates.filter((t) =>
    aliases.includes((t.purpose ?? "").toLowerCase()) || aliases.includes(t.name.toLowerCase())
  );
  if (!matches.length) return null;
  const wantLang = lang === "en" ? "en" : "hi";
  const score = (t: Template) =>
    (t.language.toLowerCase().startsWith(wantLang) ? 2 : 0) + (manufacturerId && t.manufacturer_id === manufacturerId ? 1 : 0);
  return [...matches].sort((a, b) => score(b) - score(a))[0];
}

/** Fills {{1}}..{{n}} from the template's variable names. */
export function renderTemplate(t: Template, values: Record<string, string | null | undefined>): { body: string; params: string[] } {
  const vars = t.variables?.length ? t.variables : [];
  const params = vars.map((v) => (values[v] ?? "").toString().trim() || "-");
  const body = t.body.replace(/\{\{(\d+)\}\}/g, (_m, n) => params[Number(n) - 1] ?? "");
  return { body, params };
}
