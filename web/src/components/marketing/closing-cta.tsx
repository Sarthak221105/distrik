import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";
import { Container } from "./section-heading";

export function ClosingCta() {
  return (
    <section aria-labelledby="cta-title" className="pb-20 lg:pb-section">
      <Container>
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-3xl bg-surface shadow-lg px-6 py-14 text-center sm:px-12 sm:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(36rem_18rem_at_50%_0%,var(--primary-soft),transparent_70%),radial-gradient(24rem_14rem_at_100%_100%,var(--accent-soft),transparent_70%)]"
            />
            <h2 id="cta-title" className="mx-auto max-w-2xl text-[34px] leading-[1.15] font-medium tracking-tight text-balance sm:text-[40px] lg:text-h2">
              Open your next market without hiring a new sales team
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
              Pick a plan to reserve your place, or join the waitlist and we will be in touch when early access opens.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="group h-12 px-6">
                <Link href="/#pricing">
                  Choose a plan
                  <ArrowRight className="transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6">
                <a href="#waitlist">Join the waitlist</a>
              </Button>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
