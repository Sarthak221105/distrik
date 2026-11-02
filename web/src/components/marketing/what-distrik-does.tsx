import { Building2, CheckCircle2, MessageSquareText, PhoneCall, Scale, TrendingUp, Users } from "lucide-react";
import { Container } from "./section-heading";
import { Reveal } from "./reveal";

const pillars = [
  {
    icon: Building2,
    title: "Pinpoint FMCG Buyers",
    description: "Identify and score active distributors, stockists, and retail networks in any chosen city or region.",
    highlight: "City Intelligence",
  },
  {
    icon: MessageSquareText,
    title: "Conversational Outreach",
    description: "Connect via WhatsApp and AI phone calls to introduce products, answer distributor queries, and share catalogues.",
    highlight: "WhatsApp & Voice",
  },
  {
    icon: Scale,
    title: "Strict Commercial Rules",
    description: "Negotiate volume tiers and discounts strictly within your predefined price floors. The database blocks underpricing.",
    highlight: "100% Price Compliance",
  },
  {
    icon: Users,
    title: "Your Team in Control",
    description: "Review scored leads before first contact, approve edge-case commercial exceptions in one tap, and confirm orders.",
    highlight: "Human Oversight",
  },
];

export function WhatDistrikDoes() {
  return (
    <section id="product" aria-labelledby="about-title" className="scroll-mt-20 py-14 sm:py-20 lg:py-26">
      <Container>
        <Reveal>
          <div className="mx-auto max-w-4xl lg:max-w-5xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-foreground shadow-2xs transition-all duration-300 hover:border-accent/40">
              <span className="size-2 rounded-full bg-accent animate-pulse-dot" />
              AI-Powered FMCG Expansion
            </span>
            <h2 id="about-title" className="mt-4.5 text-[28px] sm:text-[42px] md:text-[52px] lg:text-[62px] xl:text-[70px] font-bold tracking-tight text-foreground leading-[1.08] text-balance">
              An AI sales agent built specifically for FMCG manufacturers{" "}
              <span className="font-editorial-serif italic font-normal text-accent block sm:inline">
                expanding into new markets.
              </span>
            </h2>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg lg:text-[21px] text-pretty max-w-4xl mx-auto">
              Distrik helps FMCG manufacturers discover the right distributors, start conversations on WhatsApp,
              negotiate within approved price limits, and turn qualified leads into orders, with your team in control.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 sm:mt-18 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((item, idx) => (
            <Reveal key={item.title} delay={idx * 80} className="h-full">
              <div className="card-hover-effect group flex h-full flex-col justify-between rounded-2xl border border-border/80 bg-surface p-6 sm:p-7 shadow-xs hover:border-accent/50 hover:shadow-xl transition-all duration-300">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent shadow-2xs transition-all duration-300 group-hover:scale-110 group-hover:bg-accent group-hover:text-white">
                      <item.icon className="size-5.5" aria-hidden />
                    </div>
                    <span className="text-[11px] sm:text-xs font-bold text-accent uppercase tracking-wider">
                      {item.highlight}
                    </span>
                  </div>
                  <h3 className="mt-6 text-lg sm:text-xl font-bold text-foreground tracking-tight">{item.title}</h3>
                  <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
