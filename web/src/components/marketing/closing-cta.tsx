import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";
import { Container } from "./section-heading";

export function ClosingCta() {
  return (
    <section aria-labelledby="cta-title" className="pb-24 lg:pb-36">
      <Container>
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-3xl sm:rounded-[36px] bg-surface border border-border/80 shadow-xl px-7 py-16 text-center sm:px-14 sm:py-24">
            {/* Ambient lighting inside CTA card with breathing pulse */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(191,83,44,0.12)_0%,transparent_65%)] animate-glow-pulse"
            />

            <span className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface-muted/60 px-5 py-2 text-xs sm:text-base font-semibold text-foreground shadow-2xs transition-all duration-300 hover:border-accent/40">
              <span className="size-2.5 rounded-full bg-accent animate-pulse-dot" />
              Start Expanding Today
            </span>

            <h2 id="cta-title" className="mx-auto mt-8 max-w-6xl text-[42px] leading-[1.02] font-bold tracking-tight text-balance sm:text-[62px] md:text-[78px] lg:text-[94px] xl:text-[106px] 2xl:text-[114px] text-foreground">
              Scale into your next city{" "}
              <span className="font-editorial-serif italic font-normal text-accent block sm:inline drop-shadow-[0_4px_24px_rgba(191,83,44,0.18)]">
                without hiring a new sales team.
              </span>
            </h2>

            <p className="mx-auto mt-8 max-w-4xl text-xl text-pretty text-muted-foreground sm:text-2xl lg:text-[28px] leading-relaxed">
              Choose a transparent plan to reserve your workspace, or request early access to discuss your FMCG expansion goals.
            </p>

            <div className="mt-12 flex flex-col justify-center gap-5 sm:flex-row sm:mt-16">
              <Button asChild size="lg" className="btn-sheen group h-15 sm:h-16 rounded-full bg-primary px-11 text-lg sm:text-xl font-bold text-primary-foreground shadow-xl transition-all duration-300 hover:bg-black hover:scale-105 hover:shadow-2xl active:scale-95">
                <Link href="/#pricing">
                  Get Started
                  <ArrowRight className="size-5.5 transition-transform motion-safe:group-hover:translate-x-1" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="group h-15 sm:h-16 rounded-full border-border bg-surface px-11 text-lg sm:text-xl font-semibold text-foreground shadow-xs transition-all duration-300 hover:bg-surface-muted hover:border-accent/40 hover:scale-105 active:scale-95">
                <a href="#waitlist">
                  Book a Demo
                  <ArrowUpRight className="size-5.5 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5" aria-hidden />
                </a>
              </Button>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
