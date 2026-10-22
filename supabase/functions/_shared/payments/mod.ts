// Payment provider adapter for plan subscriptions. Only the placeholder
// provider exists today: checkout reports "coming soon" and activation is
// done by the system admin. A real gateway (Razorpay, Cashfree, Stripe India)
// implements this interface and its webhook calls activate-application.

import { AppError } from "../http.ts";

export interface CheckoutInput {
  applicationId: string;
  amountPaise: number;
  currency: "INR";
  description: string;
  customer: { name: string; email: string; phone: string };
}

export type CheckoutResult =
  | { status: "unavailable"; provider: string; message: string }
  | { status: "redirect"; provider: string; url: string; providerRef: string };

export interface PaymentEvent {
  applicationId: string;
  providerRef: string;
  status: "paid" | "failed";
  raw: unknown;
}

export interface PaymentProvider {
  name: string;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  verifyWebhook(req: Request, rawBody: string): Promise<PaymentEvent>;
}

export const placeholderProvider: PaymentProvider = {
  name: "placeholder",
  // deno-lint-ignore require-await
  async createCheckout() {
    return {
      status: "unavailable",
      provider: "placeholder",
      message: "Online payment is coming soon. Your application is saved and you are on the waitlist.",
    };
  },
  // deno-lint-ignore require-await
  async verifyWebhook() {
    throw new AppError(501, "payments_not_configured", "No payment gateway is configured yet");
  },
};

export function getPaymentProvider(name = Deno.env.get("PAYMENT_PROVIDER") ?? "placeholder"): PaymentProvider {
  switch (name) {
    case "placeholder":
      return placeholderProvider;
    default:
      throw new AppError(500, "unknown_payment_provider", `Unknown payment provider ${name}`);
  }
}
