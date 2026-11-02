import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";
import { Container } from "./section-heading";

export function ClosingCta() {
  return (
    <section aria-labelledby="cta-title" className="pb-18 lg:pb-26">
      <Container>
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-2xl sm:rounded-3xl bg-surface border border-border/80 shadow-xl px-5 py-12 text-center sm:px-10 sm:py-18">
            {/* Ambient lighting inside CTA card with breathing pulse */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(191,83,44,0.12)_0%,transparent_65%)] animate-glow-pulse"
            />

            <span className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface-muted/60 px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-foreground shadow-2xs transition-all duration-300 hover:border-accent/40">
              <span className="size-2 rounded-full bg-accent animate-pulse-dot" />
              Start Expanding Today
            </span>

            <h2 id="cta-title" className="mx-auto mt-8 max-w-4xl text-[32px] leading-[1.08] font-bold tracking-tight text-balance sm:text-[46px] md:text-[58px] lg:text-[70px] xl:text-[80px] 2xl:text-[86px] text-foreground">
              Scale into your next city{" "}
              <span className="font-editorial-serif italic font-normal text-accent block sm:inline drop-shadow-[0_4px_24px_rgba(191,83,44,0.18)]">
                without hiring a new sales team.
              </span>
            </h2>

            <p className="mx-auto mt-6 max-w-3xl text-base text-pretty text-muted-foreground sm:text-lg lg:text-[21px] leading-relaxed">
              Choose a transparent plan to reserve your workspace, or request early access to discuss your FMCG expansion goals.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row sm:mt-11">
              <Button asChild size="lg" className="btn-sheen group h-11 sm:h-12 rounded-full bg-primary px-8 text-sm sm:text-base font-bold text-primary-foreground shadow-xl transition-all duration-300 hover:bg-black hover:scale-105 hover:shadow-2xl active:scale-95">
                <Link href="/#pricing">
                  Get Started
                  <ArrowRight className="size-4 transition-transform motion-safe:group-hover:translate-x-1" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="group h-11 sm:h-12 rounded-full border-border bg-surface px-8 text-sm sm:text-base font-semibold text-foreground shadow-xs transition-all duration-300 hover:bg-surface-muted hover:border-accent/40 hover:scale-105 active:scale-95">
                <a href="#waitlist">
                  Book a Demo
                  <ArrowUpRight className="size-4 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5" aria-hidden />
                </a>
              </Button>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
