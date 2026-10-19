// Environment access. Secrets exist only inside Edge Functions.

export function env(name: string, fallback = ""): string {
  try {
    const v = Deno.env.get(name);
    return v === undefined || v === null ? fallback : v.trim();
  } catch {
    return fallback;
  }
}

function firstKey(jsonName: string): string {
  const raw = env(jsonName);
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? "";
  } catch {
    return "";
  }
}

export function supabaseUrl(): string {
  const url = env("SUPABASE_URL");
  if (!url) throw new Error("SUPABASE_URL is not set");
  return url.replace(/\/$/, "");
}

/** Service role credential: the legacy JWT or the new secret key, whichever the runtime provides. */
export function serviceKey(): string {
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || firstKey("SUPABASE_SECRET_KEYS") || env("SUPABASE_SECRET_KEY");
  if (!key) throw new Error("No service role key (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEYS) is set");
  return key;
}

/** Public (anon / publishable) key, used for user scoped clients. */
export function anonKey(): string {
  const key = env("SUPABASE_ANON_KEY") || firstKey("SUPABASE_PUBLISHABLE_KEYS") || env("SUPABASE_PUBLISHABLE_KEY");
  if (!key) throw new Error("No anon key (SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEYS) is set");
  return key;
}

export const config = {
  whatsappProvider: () => env("WHATSAPP_PROVIDER", "sandbox") || "sandbox",
  whatsappAppSecret: () => env("WHATSAPP_APP_SECRET"),
  whatsappAccessToken: () => env("WHATSAPP_ACCESS_TOKEN"),
  whatsappVerifyToken: () => env("WHATSAPP_VERIFY_TOKEN"),
  workerSecret: () => env("WORKER_SECRET"),
  anthropicKey: () => env("ANTHROPIC_API_KEY"),
  aiModel: () => env("AI_MODEL") || "claude-sonnet-5-5",
  vapidPublic: () => env("VAPID_PUBLIC_KEY"),
  vapidPrivate: () => env("VAPID_PRIVATE_KEY"),
  vapidSubject: () => env("VAPID_SUBJECT", "mailto:ops@example.com"),
  resendKey: () => env("RESEND_API_KEY"),
  emailFrom: () => env("EMAIL_FROM", "AI Sales OS <noreply@example.com>"),
  appUrl: () => env("APP_URL", "http://localhost:3000").replace(/\/$/, ""),
  googlePlacesKey: () => env("GOOGLE_PLACES_API_KEY"),
  researchWebSearch: () => env("RESEARCH_WEB_SEARCH") === "true",
};
