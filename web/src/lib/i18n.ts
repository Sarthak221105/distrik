// English strings are externalised here; a Hindi bundle is phase 2 (PRD 13).
import en from "@/messages/en.json";

type Messages = typeof en;
const bundles: Record<string, Messages> = { en };

export function t(key: string, vars?: Record<string, string | number>, locale = "en"): string {
  const bundle = bundles[locale] ?? en;
  const value = key.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], bundle);
  let s = typeof value === "string" ? value : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
