"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { publicApi, amountFor, monthlyEquivalent, yearlySavingPct, limitLabel, type BillingCycle, type PublicPlan } from "@/lib/plans";
import { RpcError } from "@/lib/errors";
import { usePublicStats } from "@/components/marketing/use-public-stats";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/misc";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { ErrorState, Skeleton } from "@/components/domain/states";
import { cn } from "@/lib/utils";

// Mirrors submit_tenant_application in SQL; the server repeats every check.
const mobile = z
  .string()
  .trim()
  .refine((v) => {
    const d = v.replace(/\D/g, "");
    return d.length === 10 || (d.length === 12 && d.startsWith("91")) || (d.length === 11 && d.startsWith("0"));
  }, "Enter a 10 digit Indian mobile number");
const optionalMobile = z.string().trim().refine((v) => !v || mobile.safeParse(v).success, "Enter a valid phone number");

const schema = z.object({
  company_name: z.string().trim().min(2, "Enter your company name").max(160),
  legal_name: z.string().trim().max(200),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => !v || /^[0-9]{2}[A-Z0-9]{13}$/.test(v), "GSTIN must be 15 characters"),
  state: z.string().min(1, "Choose your state"),
  city: z.string().trim().max(80),
  address: z.string().trim().max(400),
  company_phone: optionalMobile,
  company_email: z.string().trim().refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email"),
  whatsapp_display_number: optionalMobile,
  owner_name: z.string().trim().min(2, "Enter your full name").max(120),
  owner_email: z.string().trim().email("Enter a valid email address"),
  owner_phone: mobile,
  accept_terms: z.boolean().refine((v) => v, "Accept the Terms and Privacy Policy to continue"),
  website: z.string(),
});
type FormValues = z.infer<typeof schema>;

const STEPS = ["Plan", "Company", "Owner", "Review"] as const;
const STEP_FIELDS: (keyof FormValues)[][] = [
  [],
  ["company_name", "legal_name", "gstin", "state", "city", "address", "company_phone", "company_email", "whatsapp_display_number"],
  ["owner_name", "owner_email", "owner_phone"],
  ["accept_terms"],
];

export function SignupForm({ initialPlan, initialCycle }: { initialPlan?: string; initialCycle?: BillingCycle }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [planCode, setPlanCode] = useState(initialPlan ?? "growth");
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle ?? "monthly");
  const [serverError, setServerError] = useState<string>();

  const stats = usePublicStats();
  const states = useQuery({
    queryKey: ["india-states"],
    queryFn: async () => (await getSupabaseBrowser().from("india_states").select("code, name").order("name")).data ?? [],
  });

  const plans = stats.data?.plans ?? [];
  const plan = plans.find((p) => p.code === planCode) ?? plans.find((p) => p.is_featured) ?? plans[0];

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      company_name: "", legal_name: "", gstin: "", state: "", city: "", address: "", company_phone: "",
      company_email: "", whatsapp_display_number: "", owner_name: "", owner_email: "", owner_phone: "",
      accept_terms: false, website: "",
    },
  });
  const { register, formState, handleSubmit, trigger, setValue, setError, control } = form;
  const errors = formState.errors;

  async function next() {
    const ok = await trigger(STEP_FIELDS[step], { shouldFocus: true });
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!plan) return;
    setServerError(undefined);
    try {
      const res = await publicApi.submitApplication({ ...values, plan_code: plan.code, billing_cycle: cycle });
      router.push(`/signup/status/${res.status_token}`);
    } catch (e) {
      const err = e instanceof RpcError ? e : new RpcError({ code: "error", message: "Could not submit your application" });
      const field = err.field as keyof FormValues | undefined;
      if (field && field in values) {
        setError(field, { message: err.message });
        const stepWithField = STEP_FIELDS.findIndex((f) => f.includes(field));
        if (stepWithField >= 0) setStep(stepWithField);
      } else {
        setServerError(err.message);
      }
    }
  });

  const values = useWatch({ control }) as FormValues;

  return (
    <div className="mx-auto grid w-full max-w-[1280px] gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_360px] lg:gap-12 lg:px-12 lg:py-16">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary">Create your workspace</p>
        <h1 className="mt-2 text-[34px] leading-[1.15] font-medium tracking-tight sm:text-[40px]">Tell us about your company</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Takes about two minutes. Online payment is coming soon: your application joins the waitlist and we email your sign in
          link as soon as your workspace is ready.
        </p>

        <ol className="mt-6 flex flex-wrap gap-2" aria-label="Signup steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm",
                  i === step ? "border-primary bg-primary-soft font-medium text-primary" : i < step ? "border-border text-foreground" : "border-border text-muted-foreground",
                )}
              >
                <span className={cn("inline-flex size-5 items-center justify-center rounded-full text-[11px]", i < step ? "bg-primary text-primary-foreground" : "bg-surface-muted")}>
                  {i < step ? <Check className="size-3" aria-hidden /> : i + 1}
                </span>
                {s}
              </button>
            </li>
          ))}
        </ol>

        <form className="mt-6" onSubmit={onSubmit} noValidate>
          {/* honeypot: hidden from people, filled by bots */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="website">Website</label>
            <input id="website" tabIndex={-1} autoComplete="off" {...register("website")} />
          </div>

          {step === 0 && (
            <section aria-labelledby="plan-heading" className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="plan-heading" className="text-h4 font-medium">Choose a plan</h2>
                <div role="radiogroup" aria-label="Billing cycle" className="inline-flex rounded-lg bg-surface-muted p-1 text-sm">
                  {(["monthly", "yearly"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={cycle === c}
                      onClick={() => setCycle(c)}
                      className={cn("rounded-md px-3 py-1.5", cycle === c ? "bg-surface font-medium shadow-sm" : "text-muted-foreground")}
                    >
                      {c === "monthly" ? "Monthly" : `Yearly${plans.length ? ` · save ${yearlySavingPct(plans)}%` : ""}`}
                    </button>
                  ))}
                </div>
              </div>
              {stats.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>
              ) : stats.error ? (
                <ErrorState title="Could not load plans" error={stats.error} onRetry={() => stats.refetch()} />
              ) : (
                <div role="radiogroup" aria-label="Plan" className="grid gap-3 sm:grid-cols-3">
                  {plans.map((p) => (
                    <PlanOption key={p.code} plan={p} cycle={cycle} selected={plan?.code === p.code} onSelect={() => setPlanCode(p.code)} />
                  ))}
                </div>
              )}
            </section>
          )}

          {step === 1 && (
            <section aria-labelledby="company-heading" className="grid gap-4">
              <h2 id="company-heading" className="text-h4 font-medium">Company</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Company or brand name" htmlFor="company_name" error={errors.company_name?.message}>
                  <Input id="company_name" autoComplete="organization" aria-invalid={!!errors.company_name} {...register("company_name")} />
                </Field>
                <Field label="Legal name (optional)" htmlFor="legal_name" error={errors.legal_name?.message}>
                  <Input id="legal_name" {...register("legal_name")} />
                </Field>
                <Field label="State" htmlFor="state" error={errors.state?.message}>
                  <NativeSelect id="state" aria-invalid={!!errors.state} {...register("state")}>
                    <option value="">Choose a state…</option>
                    {(states.data ?? []).map((s) => (
                      <option key={s.code} value={s.name}>{s.name}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="GSTIN (optional)" htmlFor="gstin" error={errors.gstin?.message} hint="15 characters; the first two digits must match your state">
                  <Input id="gstin" className="uppercase" maxLength={15} aria-invalid={!!errors.gstin} {...register("gstin")} />
                </Field>
                <Field label="City" htmlFor="city" error={errors.city?.message}>
                  <Input id="city" autoComplete="address-level2" {...register("city")} />
                </Field>
                <Field label="Company phone (optional)" htmlFor="company_phone" error={errors.company_phone?.message}>
                  <Input id="company_phone" inputMode="tel" {...register("company_phone")} />
                </Field>
                <Field label="Company email (optional)" htmlFor="company_email" error={errors.company_email?.message}>
                  <Input id="company_email" type="email" {...register("company_email")} />
                </Field>
                <Field label="WhatsApp business number (optional)" htmlFor="whatsapp_display_number" error={errors.whatsapp_display_number?.message} hint="The number buyers will chat with; we connect it during onboarding">
                  <Input id="whatsapp_display_number" inputMode="tel" {...register("whatsapp_display_number")} />
                </Field>
                <Field label="Address (optional)" htmlFor="address" error={errors.address?.message} className="sm:col-span-2">
                  <Textarea id="address" rows={2} autoComplete="street-address" {...register("address")} />
                </Field>
              </div>
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="owner-heading" className="grid gap-4">
              <h2 id="owner-heading" className="text-h4 font-medium">Workspace owner</h2>
              <p className="text-sm text-muted-foreground">The owner manages the team, price rules and approvals. Your sign in link goes to this email.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="owner_name" error={errors.owner_name?.message}>
                  <Input id="owner_name" autoComplete="name" aria-invalid={!!errors.owner_name} {...register("owner_name")} />
                </Field>
                <Field label="Work email" htmlFor="owner_email" error={errors.owner_email?.message}>
                  <Input id="owner_email" type="email" autoComplete="email" aria-invalid={!!errors.owner_email} {...register("owner_email")} />
                </Field>
                <Field label="Mobile number" htmlFor="owner_phone" error={errors.owner_phone?.message} hint="Used to sign in with a one-time code">
                  <Input id="owner_phone" inputMode="tel" autoComplete="tel" aria-invalid={!!errors.owner_phone} {...register("owner_phone")} />
                </Field>
              </div>
            </section>
          )}

          {step === 3 && (
            <section aria-labelledby="review-heading" className="grid gap-4">
              <h2 id="review-heading" className="text-h4 font-medium">Review and submit</h2>
              <Card className="divide-y divide-border text-sm">
                <ReviewRow label="Plan" value={plan ? `${plan.name} · ${cycle} · ${formatINR(amountFor(plan, cycle), { whole: true })} + GST` : "–"} onEdit={() => setStep(0)} />
                <ReviewRow label="Company" value={[values.company_name, values.gstin && `GSTIN ${values.gstin.toUpperCase()}`, [values.city, values.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")} onEdit={() => setStep(1)} />
                <ReviewRow label="Owner" value={[values.owner_name, values.owner_email, values.owner_phone].filter(Boolean).join(" · ")} onEdit={() => setStep(2)} />
              </Card>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  id="accept_terms"
                  checked={values.accept_terms}
                  onCheckedChange={(v) => setValue("accept_terms", v === true, { shouldValidate: true })}
                  aria-invalid={!!errors.accept_terms}
                  className="mt-0.5"
                />
                <span>
                  I agree to the{" "}
                  <Link href="/policies/terms" target="_blank" className="font-medium text-primary underline">Terms of Service</Link>,{" "}
                  <Link href="/policies/privacy" target="_blank" className="font-medium text-primary underline">Privacy Policy</Link> and{" "}
                  <Link href="/policies/refunds" target="_blank" className="font-medium text-primary underline">Cancellation & Refund Policy</Link>.
                </span>
              </label>
              {errors.accept_terms && <p className="text-xs text-danger" role="alert">{errors.accept_terms.message}</p>}
              {serverError && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{serverError}</p>}
            </section>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft aria-hidden /> Back
              </Button>
            ) : (
              <span />
            )}
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={next} disabled={step === 0 && !plan}>
                Continue <ArrowRight aria-hidden />
              </Button>
            ) : (
              <Button type="submit" size="lg" loading={formState.isSubmitting}>
                Submit application
              </Button>
            )}
          </div>
        </form>
      </div>

      <aside className="h-fit rounded-2xl bg-surface p-6 shadow-md lg:sticky lg:top-24" aria-label="Order summary">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your plan</p>
        {plan ? (
          <>
            <p className="mt-1 font-display text-h4 font-medium">{plan.name}</p>
            <p className="tabular mt-1 font-display text-h3 font-medium">
              {formatINR(monthlyEquivalent(plan, cycle), { whole: true })}
              <span className="text-sm font-normal text-muted-foreground"> /month + GST</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {cycle === "yearly" ? `Billed ${formatINR(plan.yearly_price_paise, { whole: true })} yearly` : "Billed monthly"}
            </p>
            <ul className="mt-4 grid gap-1.5 text-sm">
              <li>{limitLabel(plan.limits.seats, "team seats")}</li>
              <li>{limitLabel(plan.limits.active_campaigns, "active campaigns")}</li>
              <li>{limitLabel(plan.limits.prospects_per_month, "prospects a month")}</li>
            </ul>
          </>
        ) : (
          <Skeleton className="mt-2 h-24" />
        )}
        <div className="mt-5 flex gap-2 rounded-lg bg-primary-soft p-3 text-xs text-primary">
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          <span>Payment is not taken today. You join the waitlist and we activate your workspace by email.</span>
        </div>
      </aside>
    </div>
  );
}

function PlanOption({ plan, cycle, selected, onSelect }: { plan: PublicPlan; cycle: BillingCycle; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex h-full flex-col gap-2 rounded-2xl border bg-surface p-5 text-left shadow-sm transition-[box-shadow,border-color]",
        selected ? "border-primary ring-2 ring-primary/25 shadow-md" : "border-transparent hover:shadow-md",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-display text-lg font-medium">{plan.name}</span>
        {plan.is_featured && <Badge tone="primary">Most popular</Badge>}
      </span>
      <span className="tabular font-display text-h4 font-medium">
        {formatINR(monthlyEquivalent(plan, cycle), { whole: true })}
        <span className="text-xs font-normal text-muted-foreground"> /mo</span>
      </span>
      {plan.tagline && <span className="text-xs text-muted-foreground">{plan.tagline}</span>}
      <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
        {selected ? (<><Check className="size-3" aria-hidden /> Selected</>) : "Select"}
      </span>
    </button>
  );
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 p-3">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value || "–"}</p>
      </div>
      <Button type="button" variant="link" size="sm" onClick={onEdit}>
        Edit
      </Button>
    </div>
  );
}
