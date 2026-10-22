"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, Megaphone, Sparkles, Target, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/domain/states";
import { formatINR } from "@/lib/format";
import {
  amountFor,
  limitLabel,
  monthlyEquivalent,
  yearlySavingPct,
  type BillingCycle,
  type PublicPlan,
} from "@/lib/plans";
import { cn } from "@/lib/utils";
import { usePublicStats } from "./use-public-stats";

export function signupHref(plan: Pick<PublicPlan, "code">, cycle: BillingCycle) {
  return `/signup?plan=${encodeURIComponent(plan.code)}&cycle=${cycle}`;
}

function plural(n: number | null | undefined, one: string, many: string) {
  return n === 1 ? one : many;
}

/** Plan limits as readable lines ("3 seats", "Unlimited active campaigns"). */
export function planLimitLines(plan: PublicPlan): { icon: ReactNode; label: string }[] {
  const { seats, active_campaigns, prospects_per_month } = plan.limits ?? {};
  const lines: { icon: ReactNode; label: string }[] = [];
  if (seats !== undefined) lines.push({ icon: <Users aria-hidden />, label: limitLabel(seats, plural(seats, "team seat", "team seats")) });
  if (active_campaigns !== undefined)
    lines.push({
      icon: <Megaphone aria-hidden />,
      label: limitLabel(active_campaigns, plural(active_campaigns, "active campaign", "active campaigns")),
    });
  if (prospects_per_month !== undefined)
    lines.push({
      icon: <Target aria-hidden />,
      label: `${limitLabel(prospects_per_month, plural(prospects_per_month, "prospect", "prospects"))} a month`,
    });
  return lines;
}

/* ------------------------------------------------------------- toggle */

export function BillingCycleToggle({
  value,
  onChange,
  savingPct,
  className,
}: {
  value: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
  savingPct: number;
  className?: string;
}) {
  const name = useId();
  const options: { value: BillingCycle; label: string }[] = [
    { value: "monthly", label: "Monthly" },
    { value: "yearly", label: "Yearly" },
  ];
  return (
    <fieldset className={cn("inline-flex flex-wrap items-center justify-center gap-3", className)}>
      <legend className="sr-only">Billing cycle</legend>
      <div className="inline-flex rounded-full border border-border bg-surface p-1 shadow-sm">
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "relative cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                checked ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </div>
      {savingPct > 0 && (
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
          Save {savingPct}% yearly
        </span>
      )}
    </fieldset>
  );
}

/* --------------------------------------------------------------- card */

export function PlanPrice({ plan, cycle, size = "lg" }: { plan: PublicPlan; cycle: BillingCycle; size?: "lg" | "sm" }) {
  const perMonth = monthlyEquivalent(plan, cycle);
  const showStrike = cycle === "yearly" && plan.monthly_price_paise > perMonth;
  return (
    <div className="grid gap-1">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {showStrike && (
          <span className={cn("text-muted-foreground line-through tabular", size === "lg" ? "text-lg" : "text-sm")}>
            <span className="sr-only">Was </span>
            {formatINR(plan.monthly_price_paise, { whole: true })}
          </span>
        )}
        <span className={cn("font-display font-medium tabular", size === "lg" ? "text-h2" : "text-h3")}>
          {formatINR(perMonth, { whole: true })}
        </span>
        <span className="text-sm text-muted-foreground">/ month + GST</span>
      </p>
      <p className="text-xs text-muted-foreground tabular">
        {cycle === "yearly" ? `Billed ${formatINR(amountFor(plan, "yearly"), { whole: true })} yearly + GST` : "Billed monthly · cancel any time"}
      </p>
    </div>
  );
}

export function PlanCard({
  plan,
  cycle,
  href,
  ctaLabel,
  selected,
  className,
}: {
  plan: PublicPlan;
  cycle: BillingCycle;
  /** Defaults to /signup?plan=<code>&cycle=<cycle>. Pass null to hide the button. */
  href?: string | null;
  ctaLabel?: string;
  selected?: boolean;
  className?: string;
}) {
  const featured = plan.is_featured;
  const titleId = useId();
  const link = href === undefined ? signupHref(plan, cycle) : href;
  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "relative flex h-full flex-col gap-6 rounded-2xl border bg-surface p-6 transition-[box-shadow,translate] duration-300 motion-safe:hover:-translate-y-1 hover:shadow-xl",
        featured ? "border-primary shadow-xl ring-1 ring-primary" : "border-transparent shadow-sm",
        selected && "ring-2 ring-primary",
        className,
      )}
    >
      {featured && (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm">
          <Sparkles className="size-3" aria-hidden /> Most popular
        </span>
      )}
      <div className="grid gap-1.5">
        <h3 id={titleId} className="text-h4 font-medium">
          {plan.name}
        </h3>
        {plan.tagline && <p className="text-sm text-muted-foreground">{plan.tagline}</p>}
      </div>

      <PlanPrice plan={plan} cycle={cycle} />

      {link && (
        <Button asChild size="lg" variant={featured ? "default" : "outline"} className="w-full">
          <Link href={link}>
            {ctaLabel ?? `Choose ${plan.name}`}
            <span className="sr-only"> ({cycle === "yearly" ? "billed yearly" : "billed monthly"})</span>
          </Link>
        </Button>
      )}

      <div className="grid gap-4 border-t border-border pt-5">
        <ul className="grid gap-2" aria-label={`${plan.name} limits`}>
          {planLimitLines(plan).map((l) => (
            <li key={l.label} className="flex items-center gap-2 text-sm font-medium [&_svg]:size-4 [&_svg]:text-primary">
              {l.icon}
              {l.label}
            </li>
          ))}
        </ul>
        {plan.features.length > 0 && (
          <ul className="grid gap-2" aria-label={`${plan.name} features`}>
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export function PlanCardSkeleton() {
  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-surface shadow-sm p-6" aria-hidden>
      <div className="grid gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-10 w-36" />
      <Skeleton className="h-11 w-full" />
      <div className="grid gap-2 border-t border-border pt-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Compact one-line plan summary, e.g. for the signup page. */
export function PlanSummary({
  plan,
  cycle,
  action,
  className,
}: {
  plan: PublicPlan;
  cycle: BillingCycle;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-4", className)}>
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="flex items-center gap-2 font-semibold">
          {plan.name}
          {plan.is_featured && (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">Most popular</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{planLimitLines(plan).map((l) => l.label).join(" · ")}</p>
      </div>
      <PlanPrice plan={plan} cycle={cycle} size="sm" />
      {action}
    </div>
  );
}

/* ------------------------------------------------------------ section */

/**
 * Billing toggle plus the plan grid, fed by publicApi.stats() through
 * TanStack Query. Handles loading, empty and error states.
 */
export function PricingPlans({
  initialCycle = "monthly",
  showFootnote = true,
  className,
}: {
  initialCycle?: BillingCycle;
  showFootnote?: boolean;
  className?: string;
}) {
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const { data, isPending, isError, error, refetch } = usePublicStats();
  const plans = data?.plans ?? [];
  const saving = yearlySavingPct(plans);

  return (
    <div className={cn("grid gap-10", className)}>
      <div className="flex justify-center">
        <BillingCycleToggle value={cycle} onChange={setCycle} savingPct={saving} />
      </div>

      {isPending ? (
        <div className="mx-auto grid max-w-xl gap-6 lg:max-w-[1280px] lg:grid-cols-3" aria-busy="true">
          <span className="sr-only" role="status">
            Loading plans
          </span>
          <PlanCardSkeleton />
          <PlanCardSkeleton />
          <PlanCardSkeleton />
        </div>
      ) : isError ? (
        <ErrorState
          title="Could not load plans"
          error={error}
          onRetry={() => void refetch()}
          className="mx-auto w-full max-w-xl"
        />
      ) : plans.length === 0 ? (
        <EmptyState
          title="Plans are being finalised"
          description="Join the waitlist and we will email you as soon as plans open."
          action={
            <Button asChild>
              <Link href="/#waitlist">Join the waitlist</Link>
            </Button>
          }
          className="mx-auto w-full max-w-xl bg-surface"
        />
      ) : (
        <div
          className={cn(
            "mx-auto grid w-full items-stretch gap-6 pt-3",
            plans.length === 1 ? "max-w-md" : plans.length === 2 ? "max-w-3xl md:grid-cols-2" : "max-w-xl lg:max-w-[1280px] lg:grid-cols-3 xl:gap-8",
          )}
        >
          {plans.map((p) => (
            <PlanCard key={p.code} plan={p} cycle={cycle} />
          ))}
        </div>
      )}

      {showFootnote && (
        <p className="mx-auto max-w-2xl text-center text-sm text-pretty text-muted-foreground">
          Prices in INR, exclusive of GST. Online payment is coming soon: choose a plan to join the waitlist, and we will
          activate your workspace and email you a sign-in link.
        </p>
      )}
    </div>
  );
}
