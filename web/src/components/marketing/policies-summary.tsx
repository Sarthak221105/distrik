import Link from "next/link";
import { ArrowRight, Ban, Lock, MessageCircle, Scale, ShieldCheck } from "lucide-react";
import { Reveal } from "./reveal";
import { Container } from "./section-heading";

const items = [
  {
    icon: MessageCircle,
    title: "Consent & Opt-Out",
    body: "We message buyers only after opt-in. Replying STOP immediately opts them out.",
    href: "/policies/privacy#consent",
    linkText: "Consent terms",
  },
  {
    icon: Scale,
    title: "Price Guardrails",
    body: "Database-enforced pricing floors. Quotes below your floor require human approval.",
    href: "/policies/terms#ai-agent",
    linkText: "Price guardrails",
  },
  {
    icon: Lock,
    title: "Data Protection & DPDP",
    body: "Stored in India with Mumbai data sovereignty under India's DPDP Act 2023.",
    href: "/policies/privacy#dpdp",
    linkText: "DPDP compliance",
  },
  {
    icon: Ban,
    title: "Responsible Messaging",
    body: "Zero cold broadcasts to bought lists. Strict Meta 24-hour window compliance.",
    href: "/policies/terms#acceptable-use",
    linkText: "Acceptable use",
  },
];

export function PoliciesSummary() {
  return (
    <section id="policies" aria-labelledby="policies-title" className="scroll-mt-20 border-y border-border/70 bg-surface/50 py-18 sm:py-24 lg:py-28">
      <Container>
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <Reveal>
            <div>
              <span className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface px-5 py-2 text-xs sm:text-base font-semibold text-foreground shadow-2xs transition-all duration-300 hover:border-accent/40">
                <span className="size-2.5 rounded-full bg-accent animate-pulse-dot" />
                Trust & Governance
              </span>
              <h2 id="policies-title" className="mt-6 text-[36px] sm:text-[54px] lg:text-[70px] xl:text-[80px] font-bold tracking-tight text-foreground leading-[1.04]">
                Guardrails built into the platform,{" "}
                <span className="font-editorial-serif italic font-normal text-accent block sm:inline">
                  not left to AI prompts.
                </span>
              </h2>
            </div>
          </Reveal>
          <Link
            href="/policies"
            className="inline-flex shrink-0 items-center gap-2 text-base sm:text-lg font-semibold text-accent underline-offset-4 hover:underline transition-transform hover:translate-x-1"
          >
            Read all legal policies <ArrowRight className="size-5" aria-hidden />
          </Link>
        </div>

        <div className="mt-14 sm:mt-18 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <Reveal key={it.title} delay={i * 60} className="h-full">
              <div className="card-hover-effect flex h-full flex-col justify-between rounded-3xl border border-border/80 bg-surface p-7 sm:p-8 shadow-2xs hover:border-accent/50 hover:shadow-xl transition-all duration-300">
                <div>
                  <div className="flex items-center gap-3.5">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent shadow-2xs">
                      <it.icon className="size-6" aria-hidden />
                    </span>
                    <h3 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{it.title}</h3>
                  </div>
                  <p className="mt-4 text-base sm:text-lg leading-relaxed text-muted-foreground">{it.body}</p>
                </div>
                <Link
                  href={it.href}
                  className="mt-6 inline-flex items-center gap-2 text-sm sm:text-base font-semibold text-accent hover:underline"
                >
                  {it.linkText} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
