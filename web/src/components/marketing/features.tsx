import type { ReactNode } from "react";
import { Check, FileText, Repeat, ScanSearch, ShieldCheck, Smartphone, UserCheck, MessageCircle, Hand } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ApprovalCardMockup,
  DiscoveryMockup,
  LeadReviewMockup,
  QuotationMockup,
  RepPhoneMockup,
  ReorderMockup,
  WhatsAppChatMockup,
} from "./mockups";
import { Reveal } from "./reveal";
import { Container, SectionHeading } from "./section-heading";

type Block = {
  id: string;
  icon: ReactNode;
  kicker: string;
  title: string;
  body: string;
  points: string[];
  mockup: ReactNode;
};

const blocks: Block[] = [
  {
    id: "feature-discovery",
    icon: <ScanSearch aria-hidden />,
    kicker: "Discovery and scoring",
    title: "Say the market. Get buyers worth calling.",
    body: "Type an instruction like “Find 75 FMCG distributors in Bhopal”. Distrik collects businesses from reviewed sources, removes duplicates, researches each one and scores how well it fits your product.",
    points: [
      "Plain-language objective, parsed into product, buyer type, city and target",
      "Automatic cleaning, de-duplication and classification",
      "A fit score with the reasons behind it",
    ],
    mockup: <DiscoveryMockup />,
  },
  {
    id: "feature-review",
    icon: <UserCheck aria-hidden />,
    kicker: "Lead Review by your team",
    title: "Nobody is contacted until your team says yes.",
    body: "Every discovered business lands in Lead Review. Your owner or sales head approves, rejects, edits, merges duplicates and assigns reps. Outreach starts only for approved buyers.",
    points: [
      "Pending, Needs review, Approved and Rejected queues",
      "Flags for possible duplicates, low confidence and missing phones",
      "Bulk actions and a full review history",
    ],
    mockup: <LeadReviewMockup />,
  },
  {
    id: "feature-whatsapp",
    icon: <MessageCircle aria-hidden />,
    kicker: "WhatsApp AI agent",
    title: "Sells in the buyer’s language, inside your price floors.",
    body: "The AI answers product questions, shares your catalogue, qualifies interest and negotiates on WhatsApp in English, Hindi or Hinglish. Every price it quotes comes from your rules, checked in the database.",
    points: [
      "Facts come from your own products, specs and documents",
      "Quotes at or above your floor on its own",
      "Anything lower becomes a request to your team, not a promise",
    ],
    mockup: <WhatsAppChatMockup />,
  },
  {
    id: "feature-approvals",
    icon: <Hand aria-hidden />,
    kicker: "One-tap approvals",
    title: "Exceptions come to you with the full picture.",
    body: "When a buyer asks for less than your floor, special terms or credit, the AI pauses and asks. You see the ask against your floor and hard minimum, then approve, counter or decline in one tap. The conversation picks up from there.",
    points: [
      "Price guardrail shows exactly where the ask sits",
      "Approval limits per person, for sales heads",
      "Notifications on web and phone",
    ],
    mockup: <ApprovalCardMockup className="mx-auto max-w-md" />,
  },
];

type Card = { icon: ReactNode; title: string; body: string; mockup: ReactNode };

const cards: Card[] = [
  {
    icon: <FileText aria-hidden />,
    title: "GST quotations and PO matching",
    body: "Agreed deals become numbered GST quotation PDFs with HSN and tax lines, sent on WhatsApp. When the buyer’s purchase order arrives, Distrik reads it and matches it line by line. A person confirms every order.",
    mockup: <QuotationMockup />,
  },
  {
    icon: <Repeat aria-hidden />,
    title: "Reorder predictions",
    body: "From each account’s order history, Distrik predicts when the next order is due and flags accounts that are due or overdue, with a reminder ready to send to buyers who have opted in.",
    mockup: <ReorderMockup />,
  },
  {
    icon: <Smartphone aria-hidden />,
    title: "A phone app for your reps",
    body: "Reps see only their assigned leads, take over escalated chats, log calls and update stages. It installs from the browser and keeps working offline, syncing when the signal returns.",
    mockup: <RepPhoneMockup />,
  },
];

export function Features() {
  return (
    <section id="product" aria-labelledby="product-title" className="scroll-mt-20 py-20 lg:py-section">
      <Container>
        <Reveal>
          <SectionHeading
            id="product-title"
            eyebrow="What Distrik does"
            title="From “find me buyers” to a confirmed order"
            description="Distrik does the repetitive sales work and brings back only the decisions that need a person: which leads to contact, which exceptions to allow and which orders to confirm."
          />
        </Reveal>

        <div className="mt-16 grid gap-20 sm:mt-20 sm:gap-28">
          {blocks.map((b, i) => (
            <article
              key={b.id}
              aria-labelledby={b.id}
              className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20 xl:gap-28"
            >
              <Reveal className={cn("grid max-w-xl content-start gap-5", i % 2 === 1 ? "lg:order-2" : "lg:justify-self-end")}>
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary [&_svg]:size-4">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary-soft">{b.icon}</span>
                  {b.kicker}
                </p>
                <h3 id={b.id} className="text-h4 font-medium text-balance sm:text-h3">
                  {b.title}
                </h3>
                <p className="text-base text-pretty text-muted-foreground sm:text-lg">{b.body}</p>
                <ul className="grid gap-2.5">
                  {b.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm sm:text-base">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                        <Check className="size-3" aria-hidden />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={120} className={cn("relative isolate", i % 2 === 1 && "lg:order-1")}>
                <div
                  aria-hidden
                  className="absolute -inset-4 -z-10 rounded-[2rem] bg-linear-to-br from-primary-soft via-surface-muted to-transparent sm:-inset-6"
                />
                <div className="mx-auto w-full max-w-md transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] motion-safe:hover:-translate-y-1.5 lg:max-w-xl">{b.mockup}</div>
              </Reveal>
            </article>
          ))}
        </div>

        <div className="mt-24 grid grid-cols-1 gap-6 sm:mt-32 md:grid-cols-3 xl:gap-8">
          {cards.map((c, i) => (
            <Reveal key={c.title} delay={i * 100} className="h-full min-w-0">
              <article className="group flex h-full flex-col gap-5 rounded-2xl bg-surface shadow-sm p-6 transition-[box-shadow,border-color,translate] duration-300 hover:shadow-xl motion-safe:hover:-translate-y-1">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary [&_svg]:size-5">
                  {c.icon}
                </span>
                <div className="grid gap-2">
                  <h3 className="text-h4 font-medium">{c.title}</h3>
                  <p className="text-sm text-pretty text-muted-foreground">{c.body}</p>
                </div>
                <div className="mt-auto min-w-0 overflow-hidden rounded-xl bg-surface-muted p-3 sm:p-4">{c.mockup}</div>
              </article>
            </Reveal>
          ))}
        </div>

        <p className="mt-10 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          Screens are illustrative. Names and figures are examples, not customer data.
        </p>
      </Container>
    </section>
  );
}
