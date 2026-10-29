import type { Metadata } from "next";
import Link from "next/link";
import { AiCallingSection } from "@/components/marketing/ai-calling";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { FaqAccordion, type FaqItem } from "@/components/marketing/faq";
import { Hero } from "@/components/marketing/hero";
import { CONTACT_EMAIL } from "@/components/marketing/links";
import { PricingPlans } from "@/components/marketing/pricing";
import { Reveal } from "@/components/marketing/reveal";
import { Container, SectionHeading } from "@/components/marketing/section-heading";
import { SalesJourney } from "@/components/marketing/sales-journey";
import { WaitlistCount } from "@/components/marketing/waitlist-count";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { WhatDistrikDoes } from "@/components/marketing/what-distrik-does";

export const metadata: Metadata = {
  title: { absolute: "Distrik · AI Sales Agent for FMCG Manufacturers" },
  description:
    "From finding dealers to closing orders. Distrik helps FMCG manufacturers discover distributors, reach out via WhatsApp and AI calling, negotiate within price limits, and turn qualified leads into orders.",
};

const faqs: FaqItem[] = [
  {
    q: "What is Distrik?",
    a: (
      <p>
        Distrik is an AI-powered sales agent for FMCG manufacturers. It identifies prospective distributors in any
        city, initiates conversations via WhatsApp and AI phone calls, answers product queries, negotiates within
        your price floors, and brings qualified purchase orders directly to your sales team.
      </p>
    ),
  },
  {
    q: "How does payment work right now?",
    a: (
      <>
        <p>
          Online payment is coming soon. Today, you choose a plan and submit your company details to join the waitlist
          with your reserved pricing tier.
        </p>
        <p>
          When your spot opens, we activate your workspace and email you an activation link. You are not charged before
          then. Plans are billed monthly, or yearly at a 20% discount, plus GST.
        </p>
      </>
    ),
  },
  {
    q: "Can the AI quote below my approved price?",
    a: (
      <p>
        Never. Every price quoted by the AI is verified against your rules at the database level, not left to an AI
        prompt. At or above your floor price, the AI quotes automatically. Below your floor but above your hard minimum,
        it routes a one-tap approval to your sales head. Below your hard minimum, requests are automatically refused.
      </p>
    ),
  },
  {
    q: "How does Distrik support AI calling and WhatsApp?",
    a: (
      <p>
        Distrik uses AI-powered voice calls to introduce your brand, verify dealer details, and qualify distributor
        interest. Once qualified, conversations seamlessly continue on WhatsApp with product catalogues, price discussions,
        and GST quotation delivery.
      </p>
    ),
  },
  {
    q: "How do you handle WhatsApp consent and DPDP compliance?",
    a: (
      <p>
        Distrik is strictly consent-first. It only messages buyers who have engaged or opted in, uses Meta-approved
        templates outside WhatsApp’s 24-hour window, and honors STOP opt-outs immediately. All data is hosted securely in
        India in accordance with the Digital Personal Data Protection (DPDP) Act, 2023.
      </p>
    ),
  },
  {
    q: "Which languages does the AI support?",
    a: (
      <p>
        The AI conducts conversations and calls in the distributor’s preferred language: English, Hindi, or Hinglish.
      </p>
    ),
  },
  {
    q: "Can my sales team manage and override the AI?",
    a: (
      <p>
        Yes. Your sales team has full oversight. Sales heads review discovered leads, approve custom commercial terms,
        and take over active conversations at any time. Field reps receive assigned leads through their dedicated portal.
      </p>
    ),
  },
  {
    q: "Can I cancel my subscription?",
    a: (
      <p>
        Yes. Monthly subscriptions can be cancelled at any time and remain active until the end of the billing period.
        Yearly subscriptions follow our <Link href="/policies/refunds">cancellation and refunds policy</Link>. For
        questions, contact <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
];

export default function LandingPage() {
  return (
    <>
      {/* 1. Hero Section: Value Proposition & Clear CTA */}
      <Hero />

      {/* 2. What Distrik Does: FMCG Core Offering */}
      <WhatDistrikDoes />

      {/* 3. End-to-End Sales Journey: 5-Step Visual Flow */}
      <SalesJourney />

      {/* 4. Multichannel Capabilities: AI Calling & WhatsApp Automation */}
      <AiCallingSection />

      {/* Pricing Section */}
      <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 py-20 lg:py-24">
        <Container>
          <Reveal>
            <SectionHeading
              id="pricing-title"
              eyebrow="Pricing"
              title="Transparent plans for growing manufacturers"
              description="Simple pricing per company plus GST. Select a plan based on your team size and how many expansion markets you want to run simultaneously."
            />
          </Reveal>
          <PricingPlans className="mt-12" />
        </Container>
      </section>

      {/* FAQ Section */}
      <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 bg-surface/50 py-20 lg:py-24">
        <Container className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
          <Reveal>
            <SectionHeading
              id="faq-title"
              align="left"
              eyebrow="FAQ"
              title="Frequently asked questions"
              description={
                <>
                  Have more questions about deploying Distrik for your sales team? Contact us at{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {CONTACT_EMAIL}
                  </a>
                  .
                </>
              }
            />
          </Reveal>
          <Reveal delay={100}>
            <FaqAccordion items={faqs} />
          </Reveal>
        </Container>
      </section>

      {/* Waitlist Section */}
      <section id="waitlist" aria-labelledby="waitlist-title" className="scroll-mt-20 py-20 lg:py-24">
        <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <SectionHeading
              id="waitlist-title"
              align="left"
              eyebrow="Early Access"
              title="Join the manufacturer waitlist"
              description="We are onboarding FMCG manufacturers in select batches. Enter your work email to reserve your launch spot and early access pricing."
            />
            <div className="mt-6">
              <WaitlistCount />
            </div>
          </Reveal>
          <Reveal delay={100}>
            <WaitlistForm />
          </Reveal>
        </Container>
      </section>

      {/* 7. Final Closing CTA */}
      <ClosingCta />
    </>
  );
}
