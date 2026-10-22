import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, Lock, ReceiptIndianRupee } from "lucide-react";
import { CONTACT_EMAIL } from "@/components/marketing/links";
import { DraftNotice } from "@/components/marketing/policy-document";
import { Container } from "@/components/marketing/section-heading";

export const metadata: Metadata = {
  title: "Policies",
  description: "Distrik's terms of service, privacy and DPDP notice, and cancellation and refunds policy.",
};

const docs = [
  {
    href: "/policies/terms",
    icon: FileText,
    title: "Terms of service",
    body: "Who Distrik is for, billing, what the AI agent may and may not do, acceptable use and your data.",
  },
  {
    href: "/policies/privacy",
    icon: Lock,
    title: "Privacy and DPDP notice",
    body: "What personal data we handle and why, retention, storage in India, WhatsApp consent and your rights, including erasure.",
  },
  {
    href: "/policies/refunds",
    icon: ReceiptIndianRupee,
    title: "Cancellation and refunds",
    body: "How to cancel monthly and yearly plans, the 7-day refund on your first payment and how refunds are paid.",
  },
];

const commitments = [
  "The AI quotes only prices your rules allow. Anything below your floor needs a person.",
  "Buyers are messaged only after they engage or opt in. STOP opts them out at once.",
  "No cold broadcasts to purchased number lists.",
  "Data is stored in India and handled in line with the DPDP Act, 2023.",
];

export default function PoliciesIndexPage() {
  return (
    <>
      <header className="border-b border-border bg-surface">
        <Container className="grid gap-5 py-12 sm:py-16">
          <h1 className="text-[38px] leading-[1.1] font-medium tracking-tight sm:text-h2">Policies</h1>
          <DraftNotice />
          <p className="max-w-3xl text-base text-pretty text-muted-foreground sm:text-lg">
            The rules we hold ourselves and our customers to. These drafts will be finalised after legal review, before
            Distrik opens to paying customers.
          </p>
        </Container>
      </header>

      <Container className="grid gap-12 py-12 sm:py-16">
        <section aria-labelledby="docs-title">
          <h2 id="docs-title" className="sr-only">
            Policy documents
          </h2>
          <ul className="grid gap-5 md:grid-cols-3">
            {docs.map((d) => (
              <li key={d.href}>
                <Link
                  href={d.href}
                  className="group flex h-full flex-col gap-4 rounded-2xl bg-surface shadow-sm p-6 transition-[border-color,box-shadow,translate] duration-300 hover:shadow-lg motion-safe:hover:-translate-y-0.5"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <d.icon className="size-5" aria-hidden />
                  </span>
                  <span className="text-lg font-semibold">{d.title}</span>
                  <span className="text-sm text-pretty text-muted-foreground">{d.body}</span>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Read <ArrowRight className="size-4 transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="commitments-title" className="rounded-2xl bg-surface shadow-sm p-6 sm:p-8">
          <h2 id="commitments-title" className="text-h4 font-medium">
            What we commit to, in short
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {commitments.map((c) => (
              <li key={c} className="flex items-start gap-3 text-sm sm:text-base">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-muted-foreground">
            Questions? Write to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary underline-offset-4 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </Container>
    </>
  );
}
