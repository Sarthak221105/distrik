import type { CSSProperties } from "react";
import { Bell, Bot, Check, CheckCheck, MessageCircle, Search, TrendingUp, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { GuardrailBar } from "./mockups";

/*
 * The hero product shot: the owner dashboard as one labelled image. Names and
 * numbers are illustrative. Columns collapse on small screens so it stays
 * legible on a phone.
 */

const kpis = [
  { label: "Pending approvals", value: "4", note: "Waiting for you", tone: "text-warning" },
  { label: "Leads to review", value: "48", note: "Bhopal · FMCG", tone: "text-primary" },
  { label: "Conversations today", value: "26", note: "+8 vs yesterday", tone: "text-success" },
  { label: "Orders this month", value: "₹4.6L", note: "12 orders", tone: "text-foreground" },
] as const;

const funnel = [
  { stage: "Identified", n: 212, w: 100 },
  { stage: "Approved", n: 143, w: 67 },
  { stage: "Conversations", n: 61, w: 29 },
  { stage: "Quoted", n: 24, w: 11 },
  { stage: "Ordered", n: 12, w: 6 },
] as const;

const week = [38, 52, 46, 64, 72, 58, 81];

export function ProductShowcase({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Illustration of the Distrik owner dashboard: four approvals waiting, 48 leads to review, 26 WhatsApp conversations today and ₹4.6 lakh of orders this month. An approval card shows a buyer asking ₹540 a jar against a ₹558 floor, next to a sales funnel and a live WhatsApp chat handled by the AI."
      className={cn("overflow-hidden rounded-[22px] bg-surface text-left shadow-xl ring-1 ring-black/5 dark:ring-white/10", className)}
    >
      {/* app top bar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <span className="flex items-center gap-2 font-display text-sm font-medium whitespace-nowrap sm:text-base">
          <span className="flex size-6 items-center justify-center rounded-md bg-linear-to-br from-primary to-periwinkle text-[11px] font-semibold text-white">
            D
          </span>
          Shakti Foods
        </span>
        <span className="mx-auto hidden items-center gap-1 rounded-full bg-surface-muted p-1 text-[11px] font-medium whitespace-nowrap text-muted-foreground lg:flex">
          <span className="rounded-full bg-band px-3 py-1 text-white dark:bg-primary dark:text-primary-foreground">Overview</span>
          <span className="px-3 py-1">Lead Review</span>
          <span className="px-3 py-1">Approvals</span>
          <span className="px-3 py-1">Pipeline</span>
          <span className="px-3 py-1">Orders</span>
        </span>
        <span className="ml-auto flex items-center gap-1.5 lg:ml-0">
          {[Search, Bell].map((Icon, i) => (
            <span key={i} className="flex size-7 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
              <Icon className="size-3.5" aria-hidden />
            </span>
          ))}
          <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-[10px] font-semibold text-primary">AS</span>
        </span>
      </div>

      <div className="grid gap-4 bg-surface-muted/60 p-4 sm:gap-5 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-display text-xl font-medium sm:text-[28px] sm:leading-tight">Namaste, Anita!</p>
            <p className="text-xs text-muted-foreground sm:text-sm">Here is what needs you today, and how Bhopal is moving.</p>
          </div>
          <span className="hidden rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm sm:inline-flex">
            + Start sales
          </span>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k, i) => (
            <div
              key={k.label}
              className="animate-enter rounded-2xl bg-surface p-3 shadow-sm sm:p-4"
              style={{ "--d": `${900 + i * 90}ms` } as CSSProperties}
            >
              <p className="text-[11px] text-muted-foreground sm:text-xs">{k.label}</p>
              <p className={cn("mt-1 font-display text-2xl font-medium tabular sm:text-[30px]", k.tone)}>{k.value}</p>
              <p className="text-[11px] text-muted-foreground">{k.note}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.25fr_1fr_1fr]">
          {/* approval */}
          <div className="grid content-start gap-3 rounded-2xl bg-surface p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                <TriangleAlert className="size-3" aria-hidden /> Needs approval
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground">Expires in 19 h</span>
            </div>
            <div>
              <p className="text-sm font-semibold">Mehta Distributors asks ₹540 / jar</p>
              <p className="text-xs text-muted-foreground">Mustard oil 5 L · 100 jars · deal ₹54,000 + GST</p>
            </div>
            <GuardrailBar />
            <p className="flex gap-1.5 rounded-xl bg-ai-soft p-2.5 text-[11px] leading-snug text-ai">
              <Bot className="size-3.5 shrink-0" aria-hidden />
              Buys 100 jars a month, 2× your Bhopal average. Margin stays at 8.3%.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex h-8 items-center gap-1 rounded-lg bg-success px-3 text-xs font-medium text-white">
                <Check className="size-3.5" aria-hidden /> Approve ₹540
              </span>
              <span className="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium">Counter ₹550</span>
            </div>
          </div>

          {/* funnel + weekly bars */}
          <div className="hidden content-start gap-4 rounded-2xl bg-surface p-4 shadow-sm sm:grid sm:p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Funnel · Bhopal</p>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                <TrendingUp className="size-3" aria-hidden /> 5.6% to order
              </span>
            </div>
            <div className="grid gap-2">
              {funnel.map((f, i) => (
                <div key={f.stage} className="grid grid-cols-[84px_1fr_32px] items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground">{f.stage}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-muted">
                    <span
                      className="animate-grow block h-full origin-left rounded-full bg-linear-to-r from-primary to-periwinkle"
                      style={{ width: `${f.w}%`, "--d": `${1100 + i * 80}ms` } as CSSProperties}
                    />
                  </span>
                  <span className="text-right font-semibold tabular">{f.n}</span>
                </div>
              ))}
            </div>
            <div className="flex h-20 items-end gap-1.5 border-t border-border pt-3">
              {week.map((h, i) => (
                <span key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span
                    className={cn("animate-rise w-full origin-bottom rounded-md", i === week.length - 1 ? "bg-primary" : "bg-primary-soft")}
                    style={{ height: `${h}%`, "--d": `${1200 + i * 60}ms` } as CSSProperties}
                  />
                  <span className="text-[9px] text-muted-foreground">{"MTWTFSS"[i]}</span>
                </span>
              ))}
            </div>
          </div>

          {/* live chat */}
          <div className="hidden content-start gap-2.5 rounded-2xl bg-surface p-4 shadow-sm lg:grid lg:p-5">
            <div className="flex items-center gap-2">
              <MessageCircle className="size-4 text-success" aria-hidden />
              <p className="text-sm font-semibold">Live on WhatsApp</p>
              <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden /> AI replying
              </span>
            </div>
            <p className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-muted px-3 py-2 text-[12px] leading-snug">
              Rate kya hai 5L mustard oil ka? 100 jar chahiye
            </p>
            <p className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-primary-soft px-3 py-2 text-[12px] leading-snug">
              <span className="mb-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-ai">
                <Bot className="size-3" aria-hidden /> Distrik AI
              </span>
              ₹575 per jar for 100 jars, plus 5% GST. Catalogue bhej raha hoon.
            </p>
            <p className="max-w-[60%] rounded-2xl rounded-tl-sm bg-surface-muted px-3 py-2 text-[12px]">540 me de do</p>
            <p className="ml-auto flex max-w-[88%] items-end gap-1 rounded-2xl rounded-tr-sm bg-primary-soft px-3 py-2 text-[12px] leading-snug">
              Best rate ₹558 hai. ₹540 team se confirm karta hoon.
              <CheckCheck className="size-3 shrink-0 text-info" aria-hidden />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
