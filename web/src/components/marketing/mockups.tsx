import type { ReactNode } from "react";
import {
  Bot,
  CalendarClock,
  Check,
  CheckCheck,
  CircleCheck,
  FileText,
  MapPin,
  Phone,
  Sparkles,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Product-style illustrations built in JSX. Each one is a single labelled
 * image for assistive tech (role="img"), with nothing focusable inside.
 * Names, prices and counts are an illustrative example, not customer data.
 */

function Mock({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "overflow-hidden rounded-2xl bg-surface shadow-sm text-left shadow-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

function WindowBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-surface-muted/60 px-4 py-2.5">
      <span className="flex gap-1.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
      </span>
      <span className="truncate text-xs font-medium text-muted-foreground">{title}</span>
      {right && <span className="ml-auto shrink-0">{right}</span>}
    </div>
  );
}

function Pill({ tone, children }: { tone: "primary" | "success" | "warning" | "danger" | "ai" | "neutral"; children: ReactNode }) {
  const tones = {
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    ai: "bg-ai-soft text-ai",
    neutral: "bg-surface-muted text-muted-foreground",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap [&_svg]:size-3", tones[tone])}>
      {children}
    </span>
  );
}

function FakeButton({ tone = "outline", children }: { tone?: "primary" | "success" | "outline" | "ghost"; children: ReactNode }) {
  const tones = {
    primary: "bg-primary text-primary-foreground",
    success: "bg-success text-white",
    outline: "border border-border bg-surface",
    ghost: "text-muted-foreground",
  } as const;
  return (
    <span className={cn("inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-medium whitespace-nowrap", tones[tone])}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ chat */

function Bubble({
  side,
  time,
  children,
}: {
  side: "buyer" | "ai";
  time: string;
  children: ReactNode;
}) {
  const ai = side === "ai";
  return (
    <div className={cn("flex", ai ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm",
          ai ? "rounded-tr-sm bg-primary-soft text-foreground" : "rounded-tl-sm bg-surface text-foreground",
        )}
      >
        {ai && (
          <span className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-ai">
            <Bot className="size-3" aria-hidden /> Distrik AI
          </span>
        )}
        <span className="block">{children}</span>
        <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          {time}
          {ai && <CheckCheck className="size-3 text-info" aria-hidden />}
        </span>
      </div>
    </div>
  );
}

export function WhatsAppChatMockup({ className }: { className?: string }) {
  return (
    <Mock
      className={className}
      label="Illustration of a WhatsApp conversation. A Bhopal distributor asks in Hinglish for the rate of 100 jars of 5 litre mustard oil. The Distrik AI quotes ₹575 a jar and shares the catalogue. The buyer asks for ₹540. The AI offers ₹558, the lowest price the manufacturer allows on its own, and says it is checking ₹540 with the team. An approval request is sent to the owner."
    >
      <div className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 text-xs font-semibold">
          MD
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">Mehta Distributors</span>
          <span className="block truncate text-[11px] opacity-80">Bhopal · replies handled by Distrik AI</span>
        </span>
        <span className="ml-auto rounded-full bg-primary-foreground/15 px-2 py-0.5 text-[10px] font-medium">Hinglish</span>
      </div>
      <div className="grid gap-2.5 bg-surface-muted px-3 py-4 sm:px-4">
        <span className="mx-auto rounded-md bg-surface/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          Opted in · Today
        </span>
        <Bubble side="buyer" time="10:42">
          Rate kya hai 5L mustard oil ka? 100 jar chahiye
        </Bubble>
        <Bubble side="ai" time="10:42">
          Namaste! Kachi ghani mustard oil, 5 L jar: <strong>₹575 per jar</strong> for 100 jars, plus 5% GST. Catalogue bhej
          raha hoon.
          <span className="mt-2 flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5 text-[11px]">
            <FileText className="size-4 text-danger" aria-hidden /> Catalogue-2026.pdf
          </span>
        </Bubble>
        <Bubble side="buyer" time="10:44">
          540 me de do
        </Bubble>
        <Bubble side="ai" time="10:44">
          100 jars par best rate <strong>₹558</strong> hai. ₹540 ke liye main team se check kar raha hoon, thodi der mein
          confirm karta hoon.
        </Bubble>
        <span className="mx-auto mt-1 inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 text-[11px] font-medium text-warning">
          <TriangleAlert className="size-3" aria-hidden />
          Approval sent to owner: ₹540 is below the ₹558 floor
        </span>
      </div>
    </Mock>
  );
}

/* -------------------------------------------------------------- approval */

export function GuardrailBar() {
  // Scale ₹520 – ₹600. Hard minimum ₹530, floor ₹558, ask ₹540.
  const pct = (v: number) => ((v - 520) / 80) * 100;
  return (
    <div className="grid gap-1.5">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div className="absolute inset-y-0 left-0 bg-danger/35" style={{ width: `${pct(530)}%` }} />
        <div className="absolute inset-y-0 bg-warning/40" style={{ left: `${pct(530)}%`, width: `${pct(558) - pct(530)}%` }} />
        <div className="absolute inset-y-0 right-0 bg-success/35" style={{ left: `${pct(558)}%` }} />
        <div className="absolute inset-y-[-3px] w-1 rounded bg-foreground" style={{ left: `calc(${pct(540)}% - 2px)` }} />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular">
        <span>
          Hard min <strong className="text-foreground">₹530</strong>
        </span>
        <span>
          Ask <strong className="text-warning">₹540</strong>
        </span>
        <span>
          Floor <strong className="text-foreground">₹558</strong>
        </span>
      </div>
    </div>
  );
}

export function ApprovalCardMockup({ className }: { className?: string }) {
  return (
    <Mock
      className={className}
      label="Illustration of an approval card. Mehta Distributors asks ₹540 a jar for 100 jars. A price guardrail bar shows the ask sits between the ₹530 hard minimum and the ₹558 floor, so it needs a person. Buttons: approve ₹540, counter at ₹550, or decline."
    >
      <div className="grid gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="warning">
            <TriangleAlert aria-hidden /> Needs approval
          </Pill>
          <Pill tone="neutral">Price below floor</Pill>
          <span className="ml-auto text-[11px] text-muted-foreground">2 min ago</span>
        </div>
        <div>
          <p className="text-sm font-semibold">Mehta Distributors asks ₹540 / jar</p>
          <p className="text-xs text-muted-foreground">Mustard oil 5 L · 100 jars · deal ₹54,000 + GST</p>
        </div>
        <GuardrailBar />
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-warning">
          <TriangleAlert className="size-3" aria-hidden /> Below floor, above hard minimum: a person decides
        </p>
        <div className="flex flex-wrap gap-2">
          <FakeButton tone="success">
            <Check className="mr-1 size-3.5" aria-hidden /> Approve ₹540
          </FakeButton>
          <FakeButton>Counter ₹550</FakeButton>
          <FakeButton tone="ghost">Decline</FakeButton>
        </div>
      </div>
    </Mock>
  );
}

/* ----------------------------------------------------------- lead review */

const leads = [
  { name: "Mehta Distributors", type: "FMCG distributor", area: "MP Nagar", fit: 86, flag: null },
  { name: "Shree Ganesh Traders", type: "Wholesaler", area: "Hamidia Rd", fit: 78, flag: "Possible duplicate" },
  { name: "Jain Agencies", type: "FMCG distributor", area: "Kolar Rd", fit: 74, flag: null },
  { name: "Narmada Supply Co.", type: "Super stockist", area: "Govindpura", fit: 69, flag: "Missing phone" },
] as const;

export function LeadReviewMockup({ className }: { className?: string }) {
  return (
    <Mock
      className={className}
      label="Illustration of the Lead Review screen for FMCG distributors in Bhopal. Tabs show 48 pending, 9 needing review and 18 approved. Each scored lead has a fit score and flags such as possible duplicate or missing phone, with approve and reject actions."
    >
      <WindowBar title="Lead Review · FMCG distributors, Bhopal" />
      <div className="flex gap-1 overflow-hidden border-b border-border px-3 pt-3 text-xs">
        <span className="rounded-t-md border-b-2 border-primary px-2 pb-2 font-semibold text-foreground">Pending 48</span>
        <span className="px-2 pb-2 text-muted-foreground">Needs review 9</span>
        <span className="px-2 pb-2 text-muted-foreground">Approved 18</span>
      </div>
      <div className="divide-y divide-border">
        {leads.map((l, i) => (
          <div key={l.name} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded border",
                i < 2 ? "border-primary bg-primary text-primary-foreground" : "border-border",
              )}
            >
              {i < 2 && <Check className="size-3" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{l.name}</span>
              <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                {l.type} <span className="hidden sm:inline">· {l.area}</span>
              </span>
            </span>
            {l.flag && (
              <span className="hidden sm:inline-flex">
                <Pill tone="warning">
                  <TriangleAlert aria-hidden /> {l.flag}
                </Pill>
              </span>
            )}
            <span
              className={cn(
                "w-10 shrink-0 rounded-md py-0.5 text-center text-xs font-semibold tabular",
                l.fit >= 80 ? "bg-success-soft text-success" : l.fit >= 72 ? "bg-primary-soft text-primary" : "bg-warning-soft text-warning",
              )}
            >
              {l.fit}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-muted/50 px-3 py-2.5 sm:px-4">
        <span className="text-[11px] text-muted-foreground">2 selected</span>
        <span className="ml-auto flex gap-2">
          <FakeButton tone="ghost">Reject</FakeButton>
          <FakeButton tone="primary">Approve 2</FakeButton>
        </span>
      </div>
    </Mock>
  );
}

/* ------------------------------------------------------------- discovery */

export function DiscoveryMockup({ className }: { className?: string }) {
  const steps = [
    { label: "Found in lawful sources", value: "212 businesses", pct: 100 },
    { label: "Cleaned and de-duplicated", value: "143 unique", pct: 100 },
    { label: "Researched and classified", value: "143 profiled", pct: 100 },
    { label: "Scored for fit", value: "75 ready to review", pct: 82 },
  ];
  return (
    <Mock
      className={className}
      label="Illustration of a campaign. The objective 'Find 75 FMCG distributors in Bhopal' is parsed into product, buyer type, city and target. Distrik finds 212 businesses, cleans them down to 143 unique records, researches them, and scores the best 75 for review."
    >
      <WindowBar title="Start sales" right={<Pill tone="ai"><Sparkles aria-hidden /> Parsed</Pill>} />
      <div className="grid gap-4 p-4">
        <div className="rounded-xl border border-primary/30 bg-primary-soft/60 px-3 py-2.5 text-sm font-medium">
          “Find 75 FMCG distributors in Bhopal”
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone="neutral">Product: Mustard oil 5 L</Pill>
          <Pill tone="neutral">Buyer: FMCG distributor</Pill>
          <Pill tone="neutral">
            <MapPin aria-hidden /> Bhopal
          </Pill>
          <Pill tone="neutral">Target: 75</Pill>
        </div>
        <div className="grid gap-3">
          {steps.map((s) => (
            <div key={s.label} className="grid gap-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5">
                  {s.pct === 100 ? (
                    <CircleCheck className="size-3.5 text-success" aria-hidden />
                  ) : (
                    <span className="size-3.5 rounded-full border-2 border-primary border-t-transparent" aria-hidden />
                  )}
                  {s.label}
                </span>
                <span className="font-medium tabular text-muted-foreground">{s.value}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div className={cn("h-full rounded-full", s.pct === 100 ? "bg-success/70" : "bg-primary")} style={{ width: `${s.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Mock>
  );
}

/* ------------------------------------------------------------- quotation */

export function QuotationMockup({ className }: { className?: string }) {
  return (
    <Mock
      className={className}
      label="Illustration of a GST quotation: 100 jars of 5 litre mustard oil, HSN 1514, at ₹558, subtotal ₹55,800, IGST 5% ₹2,790, total ₹58,590. Below it, the buyer's purchase order is shown as matched on item, quantity, rate and GSTIN."
    >
      <div className="grid gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Quotation</p>
            <p className="text-sm font-semibold tabular">QT-2026-0142</p>
          </div>
          <Pill tone="primary">CGST · SGST · IGST</Pill>
        </div>
        <div className="overflow-hidden rounded-lg border border-border text-[11px]">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-surface-muted px-3 py-1.5 font-medium text-muted-foreground">
            <span>Item · HSN</span>
            <span>Qty × Rate</span>
            <span className="text-right">Amount</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 tabular">
            <span className="min-w-0 truncate">Mustard oil 5 L · 1514</span>
            <span>100 × ₹558</span>
            <span className="text-right">₹55,800</span>
          </div>
          <div className="grid gap-1 border-t border-border px-3 py-2 tabular">
            <span className="flex justify-between text-muted-foreground">
              <span>IGST 5%</span>
              <span>₹2,790</span>
            </span>
            <span className="flex justify-between font-semibold">
              <span>Total</span>
              <span>₹58,590</span>
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-success/30 bg-success-soft/60 px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
            <CircleCheck className="size-3.5" aria-hidden /> PO BH-7781 matched
          </p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {["Item", "Qty", "Rate", "GSTIN"].map((f) => (
              <span key={f} className="inline-flex items-center gap-1">
                <Check className="size-3 text-success" aria-hidden /> {f}
              </span>
            ))}
          </p>
        </div>
      </div>
    </Mock>
  );
}

/* --------------------------------------------------------------- reorder */

export function ReorderMockup({ className }: { className?: string }) {
  const rows = [
    { name: "Mehta Distributors", when: "Due in 3 days", tone: "primary" as const, every: "every ~21 days" },
    { name: "Jain Agencies", when: "Due today", tone: "warning" as const, every: "every ~30 days" },
    { name: "Shree Ganesh Traders", when: "2 days overdue", tone: "danger" as const, every: "every ~14 days" },
  ];
  return (
    <Mock
      className={className}
      label="Illustration of predicted reorders: one account due in 3 days, one due today and one 2 days overdue, each with its usual ordering gap and a reminder ready to send."
    >
      <div className="grid gap-2 p-4">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
            <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{r.name}</span>
              <span className="block text-[11px] text-muted-foreground">Mustard oil 5 L · {r.every}</span>
            </span>
            <Pill tone={r.tone}>{r.when}</Pill>
          </div>
        ))}
      </div>
    </Mock>
  );
}

/* ------------------------------------------------------------- rep phone */

export function RepPhoneMockup({ className }: { className?: string }) {
  return (
    <Mock
      className={cn("mx-auto w-full max-w-[260px] rounded-[2rem] border-4 border-foreground/80 p-0", className)}
      label="Illustration of the rep phone app while offline. A banner says two changes will sync when the connection returns. The Today list shows an escalated lead to call and a reorder due."
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2 text-[10px] font-medium text-muted-foreground">
        <span>9:41</span>
        <span className="h-1.5 w-12 rounded-full bg-foreground/80" aria-hidden />
        <WifiOff className="size-3" aria-hidden />
      </div>
      <div className="mx-3 flex items-center gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-[11px] font-medium text-warning">
        <WifiOff className="size-3" aria-hidden /> Offline · 2 changes will sync
      </div>
      <div className="grid gap-2 p-3">
        <p className="text-sm font-semibold">Today</p>
        <div className="rounded-lg border border-border p-2.5">
          <div className="flex items-center gap-2">
            <Pill tone="danger">Escalated</Pill>
            <span className="text-[10px] text-muted-foreground">assigned to you</span>
          </div>
          <p className="mt-1.5 text-[13px] font-medium">Shree Ganesh Traders</p>
          <p className="text-[11px] text-muted-foreground">Wants 30-day credit terms</p>
          <span className="mt-2 flex gap-1.5">
            <FakeButton tone="primary">
              <Phone className="mr-1 size-3" aria-hidden /> Call
            </FakeButton>
            <FakeButton>Log call</FakeButton>
          </span>
        </div>
        <div className="rounded-lg border border-border p-2.5">
          <Pill tone="primary">Reorder due</Pill>
          <p className="mt-1.5 text-[13px] font-medium">Mehta Distributors</p>
        </div>
      </div>
    </Mock>
  );
}
