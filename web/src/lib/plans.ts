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

export const DEFAULT_PLANS: PublicPlan[] = [
  {
    code: "basic",
    name: "Basic",
    tagline: "For a first new market",
    monthly_price_paise: 500000,
    yearly_price_paise: 4800000,
    features: [
      "AI WhatsApp sales agent (English, Hindi, Hinglish)",
      "Buyer discovery and Lead Review",
      "Price floors and approval guardrails",
      "GST quotations and PO matching",
      "Rep app with offline mode",
      "Email support",
    ],
    limits: { seats: 3, active_campaigns: 1, prospects_per_month: 100 },
    is_featured: false,
  },
  {
    code: "growth",
    name: "Growth",
    tagline: "For manufacturers expanding city by city",
    monthly_price_paise: 900000,
    yearly_price_paise: 8640000,
    features: [
      "Everything in Basic",
      "Reorder predictions and follow ups",
      "Analytics and AI health",
      "Catalogue extraction to Product Brain",
      "Priority support",
    ],
    limits: { seats: 10, active_campaigns: 3, prospects_per_month: 400 },
    is_featured: true,
  },
  {
    code: "scale",
    name: "Scale",
    tagline: "For multi-state sales teams",
    monthly_price_paise: 2000000,
    yearly_price_paise: 19200000,
    features: [
      "Everything in Growth",
      "Unlimited campaigns",
      "Delegated permissions for sales heads",
      "Guided onboarding",
      "Dedicated success manager",
    ],
    limits: { seats: 25, active_campaigns: null, prospects_per_month: 1500 },
    is_featured: false,
  },
];

export const DEFAULT_PUBLIC_STATS: PublicStats = {
  waitlist_count: 142,
  plans: DEFAULT_PLANS,
};


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
  stats: async (): Promise<PublicStats> => {
    try {
      const res = await getSupabaseBrowser().rpc("public_stats");
      if (res.data && typeof res.data === "object") {
        const stats = res.data as Partial<PublicStats>;
        if (Array.isArray(stats.plans) && stats.plans.length > 0) {
          return res.data as PublicStats;
        }
      }
      return DEFAULT_PUBLIC_STATS;
    } catch {
      return DEFAULT_PUBLIC_STATS;
    }
  },
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
