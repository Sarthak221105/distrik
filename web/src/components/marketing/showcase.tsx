import type { CSSProperties } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoImage } from "./logo";
import { Reveal } from "./reveal";
import { Container } from "./section-heading";
import { ScrollTilt } from "./motion";

export function ProductShowcase({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="A preview of the Distrik manufacturer dashboard"
      className={cn(
        "overflow-hidden rounded-3xl border border-border/80 bg-surface text-left shadow-xl transition-all duration-300 hover:shadow-2xl",
        className,
      )}
    >
      {/* Browser header bar matching screenshot (3 dots + app.distrik.in / dashboard) */}
      <div className="flex items-center gap-2 border-b border-border/70 bg-surface-muted/40 px-5 py-3.5">
        <div className="flex items-center gap-2" aria-hidden>
          <span className="size-3 rounded-full bg-border" />
          <span className="size-3 rounded-full bg-border" />
          <span className="size-3 rounded-full bg-border" />
        </div>
        <span className="ml-3 font-mono text-xs text-muted-foreground">
          app.distrik.in / dashboard
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr]">
        {/* Left Sidebar */}
        <div className="border-b border-border/60 p-5 md:border-b-0 md:border-r bg-surface-muted/10">
          {/* Logo item */}
          <div className="flex items-center">
            <LogoImage className="h-6 w-auto" />
          </div>

          {/* Nav links */}
          <div className="mt-6 space-y-1.5">
            <div className="rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-2xs">
              Overview
            </div>
            <div className="rounded-xl px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors">
              Lead Review
            </div>
            <div className="rounded-xl px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors">
              WhatsApp Chats
            </div>
            <div className="rounded-xl px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors">
              AI Voice Calls
            </div>
            <div className="rounded-xl px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors">
              Approvals
            </div>
            <div className="rounded-xl px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors">
              Quotations & POs
            </div>
            <div className="rounded-xl px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors">
              Commercial Rules
            </div>
          </div>
        </div>

        {/* Right Main Dashboard Area */}
        <div className="p-6 sm:p-7">
          {/* Welcome heading matching screenshot */}
          <div>
            <h3 className="font-editorial-serif text-2xl sm:text-3xl font-normal italic text-foreground">
              Good morning, Anita.
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              Wednesday · Here&apos;s what&apos;s happening today in Bhopal.
            </p>
          </div>

          {/* Three Stat Boxes matching screenshot */}
          <div className="mt-6 grid grid-cols-3 gap-3.5">
            <div className="rounded-2xl border border-border/70 bg-surface-muted/30 p-4 transition-all hover:border-accent/40 hover:bg-surface">
              <p className="font-editorial-serif text-3xl font-normal text-foreground sm:text-4xl">48</p>
              <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Leads Qualified
              </p>
              <p className="mt-0.5 text-xs font-medium text-success">+14% this week</p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-surface-muted/30 p-4 transition-all hover:border-accent/40 hover:bg-surface">
              <p className="font-editorial-serif text-3xl font-normal text-foreground sm:text-4xl">26</p>
              <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Active Buyers
              </p>
              <p className="mt-0.5 text-xs font-medium text-accent">+8 conversations</p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-surface-muted/30 p-4 transition-all hover:border-accent/40 hover:bg-surface">
              <p className="font-editorial-serif text-3xl font-normal text-foreground sm:text-4xl">4</p>
              <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Needs Approval
              </p>
              <p className="mt-0.5 text-xs font-medium text-warning">Waiting for you</p>
            </div>
          </div>

          {/* Two bottom cards matching screenshot */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {/* Recent Activity */}
            <div className="rounded-2xl border border-border/70 bg-surface-muted/20 p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-accent">
                Recent Activity
              </div>
              <ul className="mt-3 space-y-2.5 text-xs sm:text-[13px]">
                <li className="flex items-start justify-between gap-2">
                  <span className="text-foreground">
                    <span className="font-semibold text-accent">● Priya</span> asked for mustard oil 100 jars
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">2m</span>
                </li>
                <li className="flex items-start justify-between gap-2">
                  <span className="text-foreground">
                    <span className="font-semibold text-accent">● Balaji Kirana</span> AI voice call completed
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">14m</span>
                </li>
                <li className="flex items-start justify-between gap-2">
                  <span className="text-foreground">
                    <span className="font-semibold text-accent">● GST Quote</span> sent to Shree Ganesh (₹558/jar)
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">28m</span>
                </li>
              </ul>
            </div>

            {/* Top Questions / Discussions this week */}
            <div className="rounded-2xl border border-border/70 bg-surface-muted/20 p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-accent">
                Top Questions This Week
              </div>
              <ul className="mt-3 space-y-2 font-editorial-serif text-sm italic text-foreground/90">
                <li>• What is the distributor MOQ for Bhopal?</li>
                <li>• How to raise GST purchase order?</li>
                <li>• Can you offer credit terms for 100 cases?</li>
                <li>• Vendor onboarding steps for FMCG brand?</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardPreview() {
  return (
    <section aria-labelledby="showcase-title" className="scroll-mt-20 py-20 sm:py-28 lg:py-36">
      <Container>
        <Reveal>
          <div className="mx-auto max-w-6xl 2xl:max-w-7xl text-center mb-14 sm:mb-20">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface px-5 py-2 text-xs sm:text-base font-semibold text-foreground shadow-2xs transition-all duration-300 hover:border-accent/40">
              <span className="size-2.5 rounded-full bg-accent animate-pulse-dot" />
              Manufacturer Workspace
            </span>
            <h2 id="showcase-title" className="mt-6 text-[38px] sm:text-[58px] md:text-[72px] lg:text-[84px] xl:text-[94px] font-bold tracking-tight text-foreground leading-[1.03] text-balance">
              Full visibility into every active market,{" "}
              <span className="font-editorial-serif italic font-normal text-accent block sm:inline">
                lead, and order.
              </span>
            </h2>
            <p className="mt-8 text-xl text-muted-foreground sm:text-2xl lg:text-[28px] leading-relaxed text-pretty max-w-5xl mx-auto">
              One central command center to monitor live WhatsApp chats, approve exceptions, and track deals.
            </p>
          </div>
        </Reveal>

        <Reveal className="relative mx-auto max-w-5xl">
          <ScrollTilt>
            <ProductShowcase />
          </ScrollTilt>

          {/* Floating black pill badge matching screenshot */}
          <div className="mt-5 flex justify-end">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-xs sm:text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105">
              <span className="size-2 rounded-full bg-accent animate-pulse-dot" />
              A preview of the Manufacturer dashboard
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
