"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Info, Package, Sparkles, Wand2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatINR, titleCase } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/misc";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { unwrapList, useProductsLite, useTrackScreen } from "@/components/manufacturer/hooks";
import type { Json } from "@/lib/database.types";

type Parsed = {
  city: string | null;
  state: string | null;
  category: string | null;
  target_count: number | null;
  buyer_types: string[];
  product_hints: string[];
  confidence: number | null;
  clarifications: string[];
};

const BUYER_TYPES = ["distributor", "super_stockist", "wholesaler", "dealer", "retailer", "modern_trade"];

type Plan = {
  name: string;
  city: string;
  state: string;
  category: string;
  target: string;
  buyerTypes: string[];
};

function normaliseParsed(raw: unknown): Parsed {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
  const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    city: str(r.city),
    state: str(r.state),
    category: str(r.category),
    target_count: num(r.target_count),
    buyer_types: arr(r.buyer_types),
    product_hints: arr(r.product_hints),
    confidence: num(r.confidence),
    clarifications: arr(r.clarifications),
  };
}

export function StartSalesForm() {
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  useTrackScreen("start_sales");
  const products = useProductsLite();
  const states = useQuery({
    queryKey: ["india-states"],
    queryFn: async () => unwrapList(await supabase.from("india_states").select("code, name").order("name")),
    staleTime: Infinity,
  });

  const [step, setStep] = useState<"write" | "preview">("write");
  const [objective, setObjective] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [showOverrides, setShowOverrides] = useState(false);
  const [overrides, setOverrides] = useState({ city: "", state: "", target: "" });
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [parseFailed, setParseFailed] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>({ name: "", city: "", state: "", category: "", target: "75", buyerTypes: ["distributor"] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [parsing, setParsing] = useState(false);

  const active = useMemo(() => (products.data ?? []).filter((p) => p.status === "active"), [products.data]);

  async function preview() {
    const errs: Record<string, string> = {};
    if (!objective.trim()) errs.objective = "Describe the market you want to sell into";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setParsing(true);
    setParseFailed(null);
    let p: Parsed | null = null;
    try {
      const { data, error } = await supabase.functions.invoke("parse-objective", {
        body: { objective: objective.trim(), product_ids: productIds },
      });
      if (error) throw error;
      p = normaliseParsed(data);
    } catch (e) {
      setParseFailed(
        e instanceof Error && e.message
          ? `The AI could not read the objective (${e.message}). Fill in the market below.`
          : "The AI could not read the objective. Fill in the market below.",
      );
    }
    setParsing(false);
    setParsed(p);

    // Product hints preselect matching products when none were picked.
    if (p && productIds.length === 0 && p.product_hints.length) {
      const hints = p.product_hints.map((h) => h.toLowerCase());
      const matched = active
        .filter((pr) => hints.some((h) => pr.name.toLowerCase().includes(h) || h.includes(pr.sku.toLowerCase()) || pr.sku.toLowerCase() === h))
        .map((pr) => pr.id);
      if (matched.length) setProductIds(matched);
    }
    setPlan((prev) => ({
      name: prev.name,
      city: overrides.city || p?.city || prev.city,
      state: overrides.state || p?.state || prev.state,
      category: p?.category ?? prev.category,
      target: overrides.target || (p?.target_count ? String(p.target_count) : prev.target),
      buyerTypes: p?.buyer_types.length ? p.buyer_types.filter((b) => BUYER_TYPES.includes(b)) : prev.buyerTypes,
    }));
    setStep("preview");
  }

  const create = useRpc(
    async () =>
      unwrap(
        await supabase.rpc("create_campaign", {
          p_objective: objective.trim(),
          p_product_ids: productIds,
          p_city: plan.city.trim(),
          p_state: plan.state.trim(),
          p_category: plan.category.trim() || undefined,
          p_target_count: Number(plan.target),
          p_parsed: {
            ...(parsed ?? {}),
            buyer_types: plan.buyerTypes,
            confirmed: { city: plan.city, state: plan.state, category: plan.category, target_count: Number(plan.target) },
            parse_failed: !!parseFailed,
          } as Json,
          p_name: plan.name.trim() || undefined,
        }),
      ),
    {
      invalidate: [qk.campaigns()],
      success: "Campaign started. Buyers arrive in Lead Review for your team to approve as they are found and scored.",
      onSuccess: (id) => router.push(`/campaigns/${id}`),
      onError: (e) => {
        const map: Record<string, string> = { product_ids: "products", target_count: "target" };
        if (e.field) setErrors({ [map[e.field] ?? e.field]: e.message });
        if (e.field === "objective") setStep("write");
      },
    },
  );

  function confirm() {
    const errs: Record<string, string> = {};
    if (!plan.city.trim()) errs.city = "Pick a city for this campaign";
    if (!plan.state.trim()) errs.state = "Pick the state";
    const n = Number(plan.target);
    if (!Number.isInteger(n) || n < 1 || n > 500) errs.target = "Target count must be between 1 and 500";
    if (productIds.length === 0) errs.products = "Pick at least one product";
    setErrors(errs);
    if (Object.keys(errs).length === 0) create.mutate(undefined);
  }

  const productPicker = (
    <Field label="Products to sell" error={errors.products}>
      {products.isLoading ? (
        <LoadingSkeleton rows={2} />
      ) : products.error ? (
        <ErrorState error={products.error} onRetry={() => products.refetch()} />
      ) : active.length === 0 ? (
        <EmptyState
          icon={<Package aria-hidden />}
          title="No active products"
          description="Add a product or upload a catalogue first. Campaigns sell products from your catalogue."
          action={
            <Button asChild size="sm">
              <Link href="/products">Go to products</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Active products">
          {active.map((p) => {
            const checked = productIds.includes(p.id);
            return (
              <li key={p.id}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${checked ? "border-primary bg-primary-soft/40" : "border-border"}`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) =>
                      setProductIds((ids) => (v ? [...ids, p.id] : ids.filter((x) => x !== p.id)))
                    }
                    className="mt-0.5"
                    aria-label={p.name}
                  />
                  <span className="grid gap-0.5">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.sku} · {formatINR(p.distributor_price_paise)} per {p.unit} · MOQ {p.moq}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Field>
  );

  if (step === "write") {
    return (
      <Card>
        <CardContent className="grid gap-5 p-5">
          <Field
            label="Objective"
            htmlFor="objective"
            error={errors.objective}
            hint="Plain language is fine: the market, buyer type, product and how many buyers you want."
          >
            <Textarea
              id="objective"
              rows={4}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Find 75 grocery distributors and wholesalers in Indore for our Kachi Ghani mustard oil"
              aria-invalid={!!errors.objective}
            />
          </Field>
          {productPicker}
          <div className="grid gap-3">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="justify-self-start"
              aria-expanded={showOverrides}
              onClick={() => setShowOverrides((v) => !v)}
            >
              {showOverrides ? "Hide" : "Add"} optional overrides
            </Button>
            {showOverrides && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="City" htmlFor="ov-city">
                  <Input id="ov-city" value={overrides.city} onChange={(e) => setOverrides((o) => ({ ...o, city: e.target.value }))} />
                </Field>
                <Field label="State" htmlFor="ov-state">
                  <NativeSelect id="ov-state" value={overrides.state} onChange={(e) => setOverrides((o) => ({ ...o, state: e.target.value }))}>
                    <option value="">From objective</option>
                    {(states.data ?? []).map((s) => (
                      <option key={s.code} value={s.name}>{s.name}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Target prospects" htmlFor="ov-target">
                  <Input
                    id="ov-target"
                    inputMode="numeric"
                    value={overrides.target}
                    onChange={(e) => setOverrides((o) => ({ ...o, target: e.target.value.replace(/[^0-9]/g, "") }))}
                  />
                </Field>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={preview} loading={parsing}>
              <Wand2 aria-hidden /> Preview plan
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const confidencePct = parsed?.confidence !== null && parsed?.confidence !== undefined ? Math.round(parsed.confidence * 100) : null;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-ai" aria-hidden /> Parsed plan
            </CardTitle>
            <CardDescription>Check and edit every field. Nothing runs until you confirm.</CardDescription>
          </div>
          {confidencePct !== null && (
            <Badge tone={confidencePct >= 75 ? "success" : confidencePct >= 50 ? "warning" : "danger"}>
              AI confidence {confidencePct}%
            </Badge>
          )}
        </CardHeader>
        <CardContent className="grid gap-5">
          <blockquote className="rounded-lg border-l-4 border-primary bg-surface-muted px-3 py-2 text-sm">“{objective}”</blockquote>

          {parseFailed && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <p>{parseFailed}</p>
            </div>
          )}
          {parsed && parsed.clarifications.length > 0 && (
            <div className="rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-sm">
              <p className="font-medium text-info">The AI needs you to check:</p>
              <ul className="mt-1 list-disc pl-5">
                {parsed.clarifications.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-semibold">Market</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="City" htmlFor="pl-city" error={errors.city}>
                <Input id="pl-city" value={plan.city} aria-invalid={!!errors.city} onChange={(e) => setPlan((p) => ({ ...p, city: e.target.value }))} />
              </Field>
              <Field label="State" htmlFor="pl-state" error={errors.state}>
                <NativeSelect id="pl-state" value={plan.state} aria-invalid={!!errors.state} onChange={(e) => setPlan((p) => ({ ...p, state: e.target.value }))}>
                  <option value="">Select a state</option>
                  {plan.state && !(states.data ?? []).some((s) => s.name === plan.state) && <option value={plan.state}>{plan.state}</option>}
                  {(states.data ?? []).map((s) => (
                    <option key={s.code} value={s.name}>{s.name}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Target prospects" htmlFor="pl-target" error={errors.target} hint="50 to 100 works best">
                <Input
                  id="pl-target"
                  inputMode="numeric"
                  value={plan.target}
                  aria-invalid={!!errors.target}
                  onChange={(e) => setPlan((p) => ({ ...p, target: e.target.value.replace(/[^0-9]/g, "") }))}
                />
              </Field>
              <Field label="Category (optional)" htmlFor="pl-category" className="sm:col-span-2">
                <Input id="pl-category" value={plan.category} onChange={(e) => setPlan((p) => ({ ...p, category: e.target.value }))} placeholder="e.g. edible oils" />
              </Field>
              <Field label="Campaign name (optional)" htmlFor="pl-name">
                <Input id="pl-name" value={plan.name} onChange={(e) => setPlan((p) => ({ ...p, name: e.target.value }))} placeholder={plan.city ? `${plan.city} · this month` : ""} />
              </Field>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Buyer types</legend>
            <div className="flex flex-wrap gap-2">
              {BUYER_TYPES.map((b) => {
                const on = plan.buyerTypes.includes(b);
                return (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setPlan((p) => ({ ...p, buyerTypes: on ? p.buyerTypes.filter((x) => x !== b) : [...p.buyerTypes, b] }))
                    }
                    className={`rounded-full border px-3 py-1 text-sm ${on ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:bg-surface-muted"}`}
                  >
                    {on ? "✓ " : ""}
                    {titleCase(b)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {parsed && parsed.product_hints.length > 0 && (
            <p className="text-xs text-muted-foreground">AI product hints: {parsed.product_hints.join(", ")}</p>
          )}
          {productPicker}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
        <p>
          <strong>What happens next:</strong> the AI finds buyers, then cleans, de-duplicates, researches and scores them automatically. The results
          arrive in <strong>Lead Review</strong>, where your team approves or rejects each one. Nobody is contacted until a prospect is approved and
          you launch outreach.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" onClick={() => setStep("write")}>
          <ArrowLeft aria-hidden /> Edit objective
        </Button>
        <Button onClick={confirm} loading={create.isPending}>
          Confirm and find buyers
        </Button>
      </div>
    </div>
  );
}
