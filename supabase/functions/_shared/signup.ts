// Pure helpers for the public signup endpoint (unit tested in
// tests/signup.test.ts). The SQL function submit_tenant_application repeats
// every rule; these checks only give fast, friendly errors.

import { AppError } from "./http.ts";
import { EMAIL_RE, GSTIN_RE } from "./tenants.ts";

/** Bump when the Terms or Privacy Policy change; stored on every application. */
export const CURRENT_TERMS_VERSION = "2026-10-20";

export type ApplicationInput = {
  plan_code: string;
  billing_cycle: "monthly" | "yearly";
  company_name: string;
  legal_name: string | null;
  gstin: string | null;
  state: string;
  city: string | null;
  address: string | null;
  company_phone: string | null;
  company_email: string | null;
  whatsapp_display_number: string | null;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  terms_version: string;
};

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};

function indianMobile(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const digits = v.replace(/\D/g, "");
  const d = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return d.length === 10 ? `+91${d}` : null;
}

/** Bots fill every field; people never see the hidden "website" field. */
export function honeypotTripped(body: Record<string, unknown>): boolean {
  return typeof body.website === "string" && body.website.trim() !== "";
}

export function validateApplication(body: Record<string, unknown>): ApplicationInput {
  const fail = (code: string, message: string, field: string): never => {
    throw new AppError(400, code, message, field);
  };
  const plan = str(body.plan_code, 40) ?? fail("invalid_plan", "Choose a plan", "plan_code");
  const cycle = body.billing_cycle === "yearly" ? "yearly" : body.billing_cycle === "monthly" || body.billing_cycle === undefined ? "monthly" : fail("invalid_cycle", "Billing must be monthly or yearly", "billing_cycle");
  const company = str(body.company_name, 160);
  if (!company || company.length < 2) fail("company_name_required", "Enter your company name", "company_name");
  const state = str(body.state, 80) ?? fail("invalid_state", "Choose your state", "state");
  const gstin = str(body.gstin, 15)?.toUpperCase() ?? null;
  if (gstin && !GSTIN_RE.test(gstin)) fail("invalid_gstin", "GSTIN must be 15 characters", "gstin");
  const ownerName = str(body.owner_name, 120);
  if (!ownerName || ownerName.length < 2) fail("owner_name_required", "Enter your full name", "owner_name");
  const ownerEmail = str(body.owner_email, 254)?.toLowerCase() ?? "";
  if (!EMAIL_RE.test(ownerEmail)) fail("invalid_email", "Enter a valid email address", "owner_email");
  const ownerPhone = indianMobile(body.owner_phone) ?? fail("invalid_phone", "Enter a 10 digit Indian mobile number", "owner_phone");
  const companyEmail = str(body.company_email, 254)?.toLowerCase() ?? null;
  if (companyEmail && !EMAIL_RE.test(companyEmail)) fail("invalid_email", "Enter a valid company email", "company_email");
  let companyPhone: string | null = null;
  if (str(body.company_phone, 20)) {
    companyPhone = indianMobile(body.company_phone) ?? fail("invalid_phone", "Enter a valid company phone number", "company_phone");
  }
  if (body.accept_terms !== true) fail("terms_required", "Accept the Terms and Privacy Policy to continue", "accept_terms");

  return {
    plan_code: plan,
    billing_cycle: cycle,
    company_name: company!,
    legal_name: str(body.legal_name, 200),
    gstin,
    state,
    city: str(body.city, 80),
    address: str(body.address, 400),
    company_phone: companyPhone,
    company_email: companyEmail,
    whatsapp_display_number: str(body.whatsapp_display_number, 20),
    owner_name: ownerName!,
    owner_email: ownerEmail,
    owner_phone: ownerPhone,
    terms_version: CURRENT_TERMS_VERSION,
  };
}

/** Sliding window limiter per key (per IP), kept in the isolate's memory. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limit: number, private windowMs: number) {}
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "";
  return fwd.split(",")[0]?.trim() || "unknown";
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Random, URL safe token for the public status page (only its hash is stored). */
export function newStatusToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
