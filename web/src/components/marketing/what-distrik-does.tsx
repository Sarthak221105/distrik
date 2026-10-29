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
    <section id="product" aria-labelledby="about-title" className="scroll-mt-20 py-20 sm:py-28 lg:py-36">
      <Container>
        <Reveal>
          <div className="mx-auto max-w-6xl 2xl:max-w-7xl text-center">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface px-5 py-2 text-xs sm:text-base font-semibold text-foreground shadow-2xs transition-all duration-300 hover:border-accent/40">
              <span className="size-2.5 rounded-full bg-accent animate-pulse-dot" />
              AI-Powered FMCG Expansion
            </span>
            <h2 id="about-title" className="mt-6 text-[38px] sm:text-[58px] md:text-[72px] lg:text-[84px] xl:text-[94px] font-bold tracking-tight text-foreground leading-[1.03] text-balance">
              An AI sales agent built specifically for FMCG manufacturers{" "}
              <span className="font-editorial-serif italic font-normal text-accent block sm:inline">
                expanding into new markets.
              </span>
            </h2>
            <p className="mt-8 text-xl leading-relaxed text-muted-foreground sm:text-2xl lg:text-[28px] text-pretty max-w-5xl mx-auto">
              Distrik helps FMCG manufacturers discover the right distributors, start conversations on WhatsApp,
              negotiate within approved price limits, and turn qualified leads into orders, with your team in control.
            </p>
          </div>
        </Reveal>

        <div className="mt-16 sm:mt-24 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((item, idx) => (
            <Reveal key={item.title} delay={idx * 80} className="h-full">
              <div className="card-hover-effect group flex h-full flex-col justify-between rounded-3xl border border-border/80 bg-surface p-8 sm:p-9 shadow-xs hover:border-accent/50 hover:shadow-xl transition-all duration-300">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent shadow-2xs transition-all duration-300 group-hover:scale-110 group-hover:bg-accent group-hover:text-white">
                      <item.icon className="size-7" aria-hidden />
                    </div>
                    <span className="text-xs sm:text-[13px] font-bold text-accent uppercase tracking-wider">
                      {item.highlight}
                    </span>
                  </div>
                  <h3 className="mt-8 text-2xl sm:text-[26px] font-bold text-foreground tracking-tight">{item.title}</h3>
                  <p className="mt-3.5 text-base sm:text-lg leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
