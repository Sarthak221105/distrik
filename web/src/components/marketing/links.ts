// Absolute hash links so they work from /signup and /policies too.
export const productLinks = [
  { href: "/#product", label: "Product" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
] as const;

export const policyLinks = [
  { href: "/policies/terms", label: "Terms of service" },
  { href: "/policies/privacy", label: "Privacy & DPDP notice" },
  { href: "/policies/refunds", label: "Cancellation & refunds" },
] as const;

export const CONTACT_EMAIL = "hello@distrik.test";
export const POLICY_VERSION = "2026-10-20";
