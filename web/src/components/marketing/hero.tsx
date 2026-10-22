import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Languages, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollTilt, StaggerWords } from "./motion";
import { Container } from "./section-heading";
import { ProductShowcase } from "./showcase";
import { WaitlistCount } from "./waitlist-count";

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      {/* soft brand wash behind the copy */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem] bg-[radial-gradient(56rem_28rem_at_50%_-8%,var(--primary-soft),transparent_70%),radial-gradient(30rem_20rem_at_8%_30%,var(--accent-soft),transparent_70%),radial-gradient(30rem_20rem_at_92%_30%,var(--accent-soft),transparent_70%)]"
      />

      <Container className="flex flex-col items-center pt-12 text-center sm:pt-16 lg:pt-20">
        <a
          href="#waitlist"
          className="animate-enter group inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 py-1 pr-3 pl-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground sm:text-sm"
          style={delay(0)}
        >
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
            Early access
          </span>
          Pre-launch: join the waitlist
          <ArrowUpRight className="size-3.5 transition-transform motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5" aria-hidden />
        </a>

        <h1
          id="hero-title"
          className="mt-6 max-w-[15ch] text-[42px] leading-[1.06] font-medium tracking-tight text-balance sm:mt-8 sm:max-w-[18ch] sm:text-[56px] lg:text-h1 xl:max-w-[20ch]"
        >
          <StaggerWords text="Your AI sales employee for" start={80} />{" "}
          <span className="animate-enter inline-block bg-linear-to-r from-primary via-accent to-periwinkle bg-clip-text pb-1 text-transparent" style={delay(380)}>
            new markets
          </span>
        </h1>

        <p
          className="animate-enter mt-5 max-w-2xl text-base text-pretty text-muted-foreground sm:mt-6 sm:text-lg"
          style={delay(480)}
        >
          Name a city and a buyer type. Distrik finds and scores distributors, your team approves who to contact, and an AI
          agent sells to them on WhatsApp in English, Hindi or Hinglish, never below your price floors.
        </p>

        <div className="animate-enter mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row" style={delay(580)}>
          <Button
            asChild
            size="lg"
            className="btn-sheen group h-12 rounded-xl bg-linear-to-b from-[#4a6cf7] to-primary px-7 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 dark:from-periwinkle dark:to-primary"
          >
            <Link href="/#pricing">
              Choose a plan
              <ArrowRight className="transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="group h-12 rounded-xl px-7">
            <a href="#waitlist">
              Join the waitlist
              <ArrowUpRight className="transition-transform motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5" aria-hidden />
            </a>
          </Button>
        </div>

        <div className="animate-enter mt-7 flex flex-col items-center gap-3" style={delay(680)}>
          <WaitlistCount />
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" aria-hidden /> Prices stay inside your rules
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Languages className="size-4 text-primary" aria-hidden /> English · Hindi · Hinglish
            </li>
            <li className="inline-flex items-center gap-1.5">
              <MapPin className="size-4 text-primary" aria-hidden /> Data stays in India
            </li>
          </ul>
        </div>
      </Container>

      {/* product shot on a striped light field, like a stage */}
      <div className="relative mt-14 sm:mt-20">
        <div
          aria-hidden
          className="hero-stripes pointer-events-none absolute inset-x-0 top-10 bottom-0 -z-10 [mask-image:linear-gradient(to_bottom,transparent,black_28%,black_70%,transparent)]"
        />
        <Container className="pb-16 sm:pb-24 lg:pb-28">
          <div className="animate-enter mx-auto max-w-[1280px]" style={delay(760)}>
            <ScrollTilt>
              <div className="rounded-[28px] bg-white/45 p-2 shadow-xl ring-1 ring-white/70 backdrop-blur-sm sm:p-3 dark:bg-white/5 dark:ring-white/10">
                <ProductShowcase />
              </div>
            </ScrollTilt>
            <p className="mt-5 text-center text-xs text-muted-foreground">Illustrative example. Names and figures are not customer data.</p>
          </div>
        </Container>
      </div>
    </section>
  );
}
