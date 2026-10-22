import type { Metadata } from "next";
import Link from "next/link";
import { Benefits } from "@/components/marketing/benefits";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { FaqAccordion, type FaqItem } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { CONTACT_EMAIL } from "@/components/marketing/links";
import { PoliciesSummary } from "@/components/marketing/policies-summary";
import { PricingPlans } from "@/components/marketing/pricing";
import { Reveal } from "@/components/marketing/reveal";
import { Container, SectionHeading } from "@/components/marketing/section-heading";
import { WaitlistCount } from "@/components/marketing/waitlist-count";
import { WaitlistForm } from "@/components/marketing/waitlist-form";

export const metadata: Metadata = {
  title: { absolute: "Distrik · AI sales employee for Indian manufacturers" },
  description:
    "Distrik finds and scores distributors in the market you name, lets your team approve every lead, and sells to them on WhatsApp in English, Hindi or Hinglish without ever going below your price floors. Data stays in India.",
};

const faqs: FaqItem[] = [
  {
    q: "What is Distrik?",
    a: (
      <p>
        Distrik is an AI sales employee for Indian manufacturers, not a CRM and not a lead list. You upload products,
        set your price rules and name a market. Distrik finds and scores buyers, your team approves who to contact, and
        an AI agent talks to them on WhatsApp, sends GST quotations and reads purchase orders. It brings back only the
        decisions that need a person.
      </p>
    ),
  },
  {
    q: "How does payment work right now?",
    a: (
      <>
        <p>
          Online payment is coming soon. Today, you choose a plan and submit your company details. That puts you on the
          waitlist with your chosen plan.
        </p>
        <p>
          When your spot opens, we activate your workspace and email you a sign-in link. You are not charged before
          then. Plans are billed monthly, or yearly up front at a discount, plus GST.
        </p>
      </>
    ),
  },
  {
    q: "Can the AI quote below my price?",
    a: (
      <p>
        No. Every price the AI quotes is checked against your rules by the database, not by the AI. At or above your
        floor, it can offer on its own. Below the floor but above your hard minimum, it tells the buyer it is checking
        with the team and sends you a one-tap approval. Below your hard minimum, the offer is refused.
      </p>
    ),
  },
  {
    q: "How do you handle WhatsApp consent?",
    a: (
      <p>
        Distrik is consent-first. It only messages a buyer who has engaged or opted in, uses Meta-approved templates
        outside WhatsApp’s 24-hour window, and caps daily messages. A buyer who replies STOP is opted out before the next
        message can be sent. There are no cold broadcasts to purchased lists. See our{" "}
        <Link href="/policies/privacy#consent">privacy notice</Link>.
      </p>
    ),
  },
  {
    q: "Where is my data stored?",
    a: (
      <p>
        In India. Your products, buyers, conversations and documents are stored in Mumbai. We follow the Digital
        Personal Data Protection Act, 2023: each contact has a recorded basis and consent evidence, and a person can ask
        for their data to be erased. Read the <Link href="/policies/privacy#dpdp">DPDP notice</Link>.
      </p>
    ),
  },
  {
    q: "Which languages does the AI speak?",
    a: (
      <p>
        The agent replies in the buyer’s language: English, Hindi or Hinglish. The app your team uses is in English
        today, with a Hindi interface planned.
      </p>
    ),
  },
  {
    q: "Can my sales team use it?",
    a: (
      <p>
        Yes. Owners invite their team. Sales heads can review leads and approve deals up to a limit you set. Reps get a
        phone app that shows only their assigned leads, lets them take over chats and log calls, and keeps working
        offline. The number of team seats depends on your plan.
      </p>
    ),
  },
  {
    q: "Can I cancel?",
    a: (
      <p>
        Yes. A monthly plan can be cancelled any time and stops at the end of the current month. Yearly plans are billed
        up front; refunds follow our <Link href="/policies/refunds">cancellation and refunds policy</Link>. Questions?
        Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
];

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Features />
      <Benefits />
      <HowItWorks />
      <PoliciesSummary />

      <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 py-20 lg:py-section">
        <Container>
          <Reveal>
            <SectionHeading
              id="pricing-title"
              eyebrow="Pricing"
              title="Simple plans for every stage"
              description="One price per company, plus GST. Pick a plan by team size and how many markets you want to work at once."
            />
          </Reveal>
          <PricingPlans className="mt-12" />
        </Container>
      </section>

      <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 bg-surface py-20 lg:py-section">
        <Container className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
          <Reveal>
            <SectionHeading
              id="faq-title"
              align="left"
              eyebrow="FAQ"
              title="Questions, answered"
              description={
                <>
                  Something else on your mind? Write to{" "}
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

      <section id="waitlist" aria-labelledby="waitlist-title" className="scroll-mt-20 py-20 lg:py-section">
        <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <SectionHeading
              id="waitlist-title"
              align="left"
              eyebrow="Early access"
              title="Join the waitlist"
              description="We are opening Distrik to manufacturers in batches. Leave your email and we will tell you when your spot opens. No payment needed."
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

      <ClosingCta />
    </>
  );
}
