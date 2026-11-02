import { CheckCircle2, ChevronRight, FileCheck, Filter, Handshake, MessageSquareText, Search, UserCheck } from "lucide-react";
import { Container } from "./section-heading";
import { Reveal } from "./reveal";

const steps = [
  {
    step: "01",
    name: "Discover",
    icon: Search,
    headline: "Target City Discovery",
    description: "Find potential distributors and retailers in your target city or expansion zone.",
  },
  {
    step: "02",
    name: "Qualify",
    icon: Filter,
    headline: "Fit & Potential Scoring",
    description: "Score prospects based on business fit, GST credentials, and expansion potential.",
  },
  {
    step: "03",
    name: "Connect",
    icon: MessageSquareText,
    headline: "WhatsApp & AI Calling",
    description: "Start and manage conversations through WhatsApp and AI-powered calling.",
  },
  {
    step: "04",
    name: "Negotiate",
    icon: Handshake,
    headline: "Rule-Based Quotations",
    description: "Discuss pricing, answer queries, and generate quotations within manufacturer-approved rules.",
  },
  {
    step: "05",
    name: "Close",
    icon: FileCheck,
    headline: "Orders & Human Handoff",
    description: "Follow up, capture orders, and hand off exceptions or approvals to the human sales team.",
  },
];

export function SalesJourney() {
  return (
    <section id="how-it-works" aria-labelledby="journey-title" className="scroll-mt-20 py-14 sm:py-20 lg:py-26">
      <Container>
        <Reveal>
          <div className="mx-auto max-w-4xl lg:max-w-5xl text-center">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-foreground shadow-2xs transition-all duration-300 hover:border-accent/40">
              <span className="size-2 rounded-full bg-accent animate-pulse-dot" />
              End-to-End Sales Journey
            </span>
            <h2 id="journey-title" className="mt-4.5 text-[28px] sm:text-[42px] md:text-[52px] lg:text-[62px] xl:text-[70px] font-bold tracking-tight text-foreground leading-[1.08] text-balance">
              How Distrik turns city expansion into{" "}
              <span className="font-editorial-serif italic font-normal text-accent block sm:inline">
                predictable repeat orders.
              </span>
            </h2>
            <p className="mt-6 text-base text-muted-foreground sm:text-lg lg:text-[21px] leading-relaxed text-pretty max-w-4xl mx-auto">
              A seamless five-step journey from dealer discovery to confirmed purchase orders, with full human oversight.
            </p>
          </div>
        </Reveal>

        {/* 5-Step Flow */}
        <div className="relative mt-12 sm:mt-18">
          {/* Animated glowing track on large screens */}
          <div
            aria-hidden
            className="absolute top-1/2 left-[5%] right-[5%] -translate-y-8 hidden h-0.5 overflow-hidden bg-accent/20 xl:block"
          >
            <div className="h-full w-44 bg-gradient-to-r from-transparent via-accent to-transparent animate-[glow-line_3.5s_linear_infinite]" />
          </div>

          <div className="grid gap-4.5 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((item, idx) => (
              <Reveal key={item.name} delay={idx * 70} className="h-full">
                <div className="card-hover-effect group relative flex h-full flex-col justify-between rounded-2xl border border-border/80 bg-surface p-5 sm:p-6 shadow-xs hover:border-accent/50 hover:shadow-xl transition-all duration-300">
                  <div>
                    {/* Step badge & icon */}
                    <div className="flex items-center justify-between">
                      <span className="flex size-11 items-center justify-center rounded-xl bg-surface-muted text-sm font-bold text-foreground tabular-nums transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-105 shadow-2xs">
                        {item.step}
                      </span>
                      <item.icon className="size-5 text-muted-foreground transition-all duration-300 group-hover:text-accent group-hover:scale-115" aria-hidden />
                    </div>

                    {/* Step title */}
                    <div className="mt-6">
                      <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                        {item.name}
                      </h3>
                      <p className="mt-1.5 text-[11px] sm:text-xs font-bold text-accent tracking-wide uppercase">
                        {item.headline}
                      </p>
                    </div>

                    {/* Step description */}
                    <p className="mt-3 text-xs sm:text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
