import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Languages, MapPin, PhoneCall, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "./section-heading";
import { WaitlistCount } from "./waitlist-count";

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export function Hero() {
  return (
    <section id="hero" aria-labelledby="hero-title" className="relative isolate overflow-hidden pt-4 sm:pt-6 pb-12 sm:pb-18 lg:pb-22">
      {/* Soft warm ambient lighting glow with subtle breathing animation */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 -z-10 h-[435px] w-full max-w-[1200px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(191,83,44,0.12)_0%,rgba(245,238,228,0.38)_45%,transparent_75%)] blur-3xl animate-glow-pulse"
      />

      <Container className="relative flex flex-col items-center text-center">
        {/* Floating dynamic micro-cards flanking the hero gracefully on wide screens */}
        <div
          aria-hidden
          className="hidden xl:flex items-center gap-2.5 absolute left-1 sm:left-2 top-[60%] -translate-y-1/2 z-10 animate-float-slow rounded-xl border border-border/80 bg-surface/90 px-3 py-2 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-accent/40"
        >
          <div className="flex size-7.5 items-center justify-center rounded-lg bg-accent-soft text-accent shadow-2xs">
            <Sparkles className="size-3.5" />
          </div>
          <div className="text-left">
            <p className="text-[11px] sm:text-xs font-semibold text-foreground tracking-tight">Nagpur & Pune</p>
            <p className="text-[10px] text-muted-foreground font-medium">18 FMCG Dealers Verified</p>
          </div>
          <span className="size-1.5 rounded-full bg-success animate-pulse" />
        </div>

        <div
          aria-hidden
          className="hidden xl:flex items-center gap-2.5 absolute right-1 sm:right-2 top-[68%] -translate-y-1/2 z-10 animate-float-alt rounded-xl border border-border/80 bg-surface/90 px-3 py-2 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-accent/40"
        >
          <div className="flex size-7.5 items-center justify-center rounded-lg bg-surface-muted text-foreground shadow-2xs">
            <PhoneCall className="size-3.5 text-accent" />
          </div>
          <div className="text-left">
            <p className="text-[11px] sm:text-xs font-semibold text-foreground tracking-tight">AI Voice Call · Hindi</p>
            <p className="text-[10px] text-muted-foreground font-medium">₹4.2L Order PO Drafted</p>
          </div>
          <span className="size-1.5 rounded-full bg-accent animate-pulse" />
        </div>

        {/* Pill Badge: subtle warm pill with animated terracotta dot & sparkles */}
        <div
          className="animate-enter group inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs sm:text-sm font-medium text-foreground shadow-2xs transition-all duration-300 hover:border-accent/40 hover:shadow-xs"
          style={delay(0)}
        >
          <span className="size-2 rounded-full bg-accent animate-pulse-dot" aria-hidden />
          <span className="text-muted-foreground">The AI Sales Agent for Indian FMCG</span>
          <span className="text-border">|</span>
          <span className="font-semibold text-accent inline-flex items-center gap-1">
            Now in Early Access
            <Sparkles className="size-3 text-accent" />
          </span>
        </div>

        {/* Refined, Proportional Headline (75% scale) */}
        <h1
          id="hero-title"
          className="animate-enter mt-5 max-w-3xl lg:max-w-4xl xl:max-w-[1020px] 2xl:max-w-[1100px] text-[32px] leading-[1.08] font-bold tracking-tight text-balance sm:mt-6 sm:text-[45px] md:text-[54px] lg:text-[60px] xl:text-[68px] 2xl:text-[72px] text-foreground"
          style={delay(100)}
        >
          From Finding Dealers to Closing Orders.{" "}
          <span className="block font-editorial-serif italic font-normal text-accent mt-1.5 sm:mt-2 drop-shadow-[0_2px_12px_rgba(191,83,44,0.12)]">
            AI Handles the Sales Journey.
          </span>
        </h1>

        {/* Proportionally sized supporting copy */}
        <p
          className="animate-enter mt-4.5 max-w-xl sm:max-w-2xl lg:max-w-[660px] text-sm leading-relaxed text-pretty text-muted-foreground sm:mt-5 sm:text-base lg:text-[17px] xl:text-[18px]"
          style={delay(200)}
        >
          Distrik helps FMCG manufacturers discover the right distributors, start conversations on WhatsApp,
          negotiate within approved price limits, and turn qualified leads into orders, with your team in control.
        </p>

        {/* Interactive CTA buttons with tactile hover feedback & sheen */}
        <div className="animate-enter mt-6 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row sm:mt-7.5" style={delay(300)}>
          <Button
            asChild
            size="lg"
            className="btn-sheen group h-11 sm:h-12 rounded-full bg-primary px-7 sm:px-8 text-sm sm:text-base font-semibold text-primary-foreground shadow-md transition-all duration-300 hover:bg-black hover:scale-105 hover:shadow-lg active:scale-95"
          >
            <Link href="/#pricing">
              Get Started
              <ArrowRight className="size-4 transition-transform motion-safe:group-hover:translate-x-1" aria-hidden />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="group h-11 sm:h-12 rounded-full border-border bg-surface px-7 sm:px-8 text-sm sm:text-base font-medium text-foreground shadow-2xs transition-all duration-300 hover:bg-surface-muted hover:border-accent/40 hover:scale-105 active:scale-95"
          >
            <a href="#waitlist">
              Book a Demo
              <ArrowUpRight className="size-4 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5" aria-hidden />
            </a>
          </Button>
        </div>

        {/* Waitlist count & feature trust badges with hover transitions */}
        <div className="animate-enter mt-7 flex flex-col items-center gap-4 sm:mt-8.5" style={delay(400)}>
          <WaitlistCount className="text-xs sm:text-sm" />
          <ul className="flex flex-wrap justify-center gap-x-6 sm:gap-x-8 lg:gap-x-9 gap-y-2.5 text-xs sm:text-sm lg:text-[14px] font-medium text-muted-foreground">
            <li className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
              <ShieldCheck className="size-3.5 text-accent" aria-hidden /> Strict Price Guardrails
            </li>
            <li className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
              <PhoneCall className="size-3.5 text-accent" aria-hidden /> WhatsApp & AI Voice Calling
            </li>
            <li className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
              <Languages className="size-3.5 text-accent" aria-hidden /> English · Hindi · Hinglish
            </li>
            <li className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
              <MapPin className="size-3.5 text-accent" aria-hidden /> DPDP India Compliant
            </li>
          </ul>
        </div>
      </Container>
    </section>
  );
}
