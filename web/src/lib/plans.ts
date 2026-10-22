"use client";

import { invokeFn } from "@/lib/edge";
import { unwrap } from "@/lib/errors";
import { getSupabaseBrowser } from "@/lib/supabase/client";

// Public plans and waitlist, served by the public-signup Edge Function
// (no sign in needed). Prices are integer paise; yearly is billed up front.
export type BillingCycle = "monthly" | "yearly";

export type PublicPlan = {
  code: string;
  name: string;
  tagline: string | null;
  monthly_price_paise: number;
  yearly_price_paise: number;
  features: string[];
  limits: { seats?: number | null; active_campaigns?: number | null; prospects_per_month?: number | null };
  is_featured: boolean;
};

export type PublicStats = { waitlist_count: number; plans: PublicPlan[] };

export type SubmitResult = {
  ok: true;
  status_token: string;
  plan_name: string;
  billing_cycle: BillingCycle;
  amount_paise: number;
  waitlist_position: number;
  waitlist_count: number;
  payment: { status: "unavailable"; provider: string; message: string } | { status: "redirect"; url: string; provider: string };
};

export type ApplicationStatus = {
  status: "pending_payment" | "paid" | "active" | "rejected" | "cancelled";
  company_name: string;
  owner_name: string;
  owner_email: string;
  plan_code: string;
  plan_name: string;
  billing_cycle: BillingCycle;
  amount_paise: number;
  waitlist_position: number;
  waitlist_count: number;
  payment_status: string | null;
  created_at: string;
  activated_at: string | null;
};

export const publicApi = {
  // Read-only, so it goes straight to the database (granted to anon) and keeps
  // working even when Edge Functions are unavailable.
  stats: async () => unwrap(await getSupabaseBrowser().rpc("public_stats")) as unknown as PublicStats,
  joinWaitlist: (body: { email: string; name?: string; company?: string; website?: string }) =>
    invokeFn<{ joined: boolean; position: number; waitlist_count: number }>("public-signup", { action: "join_waitlist", ...body }),
  submitApplication: (body: Record<string, unknown>) => invokeFn<SubmitResult>("public-signup", { action: "submit_application", ...body }),
  status: (token: string) => invokeFn<ApplicationStatus>("public-signup", { action: "status", token }),
};

/** Price shown per month for a cycle (yearly is shown as its monthly equivalent). */
export function monthlyEquivalent(plan: PublicPlan, cycle: BillingCycle): number {
  return cycle === "yearly" ? Math.round(plan.yearly_price_paise / 12) : plan.monthly_price_paise;
}

export function amountFor(plan: PublicPlan, cycle: BillingCycle): number {
  return cycle === "yearly" ? plan.yearly_price_paise : plan.monthly_price_paise;
}

export function yearlySavingPct(plans: PublicPlan[]): number {
  const p = plans.find((x) => x.monthly_price_paise > 0);
  if (!p) return 0;
  return Math.round((1 - p.yearly_price_paise / (p.monthly_price_paise * 12)) * 100);
}

export function limitLabel(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return `Unlimited ${unit}`;
  return `${value.toLocaleString("en-IN")} ${unit}`;
}
