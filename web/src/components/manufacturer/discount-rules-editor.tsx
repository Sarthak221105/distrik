"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, Pencil, Plus, Trash2 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatINR, rupeesToPaise } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { PriceGuardrailMeter } from "@/components/domain/price-guardrail-meter";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { unwrapList, type ProductLite } from "@/components/manufacturer/hooks";
import type { Tables } from "@/lib/database.types";

type Rule = Tables<"discount_rules">;

export function effectiveFloor(rule: Pick<Rule, "floor_price_paise" | "max_discount_pct">, distributorPaise: number | null) {
  if (rule.max_discount_pct === null || distributorPaise === null) return rule.floor_price_paise;
  const cap = Math.ceil((distributorPaise * (100 - Number(rule.max_discount_pct))) / 100);
  return Math.max(rule.floor_price_paise, cap);
}

type FormState = { qty: string; floor: string; hard: string; maxDisc: string; terms: string; credit: string };
const emptyForm: FormState = { qty: "", floor: "", hard: "", maxDisc: "", terms: "", credit: "" };
const r2 = (p: number | null) => (p === null ? "" : String(p / 100));

/** Per product quantity tiers: what the AI may offer alone and what a human may approve. */
export function DiscountRulesEditor({ product }: { product: ProductLite }) {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const rules = useQuery({
    queryKey: qk.rules(product.id),
    queryFn: async () =>
      unwrapList(await supabase.from("discount_rules").select("*").eq("product_id", product.id).order("qty_from")),
  });

  const open = (r: Rule | "new") => {
    setEditing(r);
    setErrors({});
    setForm(
      r === "new"
        ? { ...emptyForm, qty: String(product.moq) }
        : { qty: String(r.qty_from), floor: r2(r.floor_price_paise), hard: r2(r.hard_minimum_paise), maxDisc: r.max_discount_pct === null ? "" : String(r.max_discount_pct), terms: r.payment_terms ?? "", credit: r2(r.max_credit_paise) },
    );
  };

  const floorP = rupeesToPaise(form.floor);
  const hardP = rupeesToPaise(form.hard);
  const previewFloor =
    Number.isFinite(floorP) && form.floor
      ? effectiveFloor({ floor_price_paise: floorP, max_discount_pct: form.maxDisc ? Number(form.maxDisc) : null }, product.distributor_price_paise)
      : null;

  const save = useRpc(
    async () => {
      const row = {
        manufacturer_id: viewer.manufacturerId!,
        product_id: product.id,
        qty_from: Number(form.qty),
        floor_price_paise: floorP,
        hard_minimum_paise: hardP,
        max_discount_pct: form.maxDisc ? Number(form.maxDisc) : null,
        payment_terms: form.terms.trim() || null,
        max_credit_paise: form.credit ? rupeesToPaise(form.credit) : null,
      };
      if (editing && editing !== "new") return unwrap(await supabase.from("discount_rules").update(row).eq("id", editing.id));
      return unwrap(await supabase.from("discount_rules").insert(row));
    },
    {
      invalidate: [qk.rules(product.id), qk.products()],
      success: "Price tier saved. The AI uses it from the next message.",
      onSuccess: () => setEditing(null),
      onError: (e) => {
        if (e.code === "23505") setErrors({ qty: "A tier already starts at this quantity" });
        else if (/hard_minimum_below_floor/.test(e.message)) setErrors({ hard: "Hard minimum must be at or below the floor" });
      },
    },
  );

  const remove = useRpc(async (id: string) => unwrap(await supabase.from("discount_rules").delete().eq("id", id)), {
    invalidate: [qk.rules(product.id), qk.products()],
    success: "Tier removed",
  });

  function submit() {
    const e: Record<string, string> = {};
    if (!/^[1-9][0-9]*$/.test(form.qty)) e.qty = "Whole number of at least 1";
    if (!form.floor || !Number.isFinite(floorP) || floorP <= 0) e.floor = "Enter the floor price in rupees";
    if (!form.hard || !Number.isFinite(hardP) || hardP <= 0) e.hard = "Enter the hard minimum in rupees";
    else if (Number.isFinite(floorP) && hardP > floorP) e.hard = "Hard minimum must be at or below the floor";
    if (form.maxDisc && (!Number.isFinite(Number(form.maxDisc)) || Number(form.maxDisc) < 0 || Number(form.maxDisc) > 90))
      e.maxDisc = "Between 0 and 90";
    if (form.credit && !Number.isFinite(rupeesToPaise(form.credit))) e.credit = "Enter an amount in rupees";
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate(undefined);
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          List price {formatINR(product.distributor_price_paise)} per {product.unit} · MOQ {product.moq}
        </p>
        <Button size="sm" onClick={() => open("new")}>
          <Plus aria-hidden /> Add tier
        </Button>
      </div>
      {rules.isLoading ? (
        <LoadingSkeleton variant="table" rows={3} />
      ) : rules.error ? (
        <ErrorState error={rules.error} onRetry={() => rules.refetch()} />
      ) : rules.data!.length === 0 ? (
        <EmptyState
          title="No price tiers"
          description="Without a tier the AI never goes below the list price, and every lower ask is rejected. Add tiers to allow volume pricing."
          action={<Button size="sm" onClick={() => open("new")}>Add first tier</Button>}
        />
      ) : (
        <Table>
          <caption className="sr-only">Price tiers for {product.name}</caption>
          <THead>
            <TR>
              <TH scope="col">From qty</TH>
              <TH scope="col" className="text-right">Floor</TH>
              <TH scope="col" className="text-right">Hard minimum</TH>
              <TH scope="col" className="text-right">Max discount</TH>
              <TH scope="col" className="text-right">Effective floor</TH>
              <TH scope="col">Payment terms</TH>
              <TH scope="col" className="text-right">Max credit</TH>
              <TH scope="col"><span className="sr-only">Actions</span></TH>
            </TR>
          </THead>
          <TBody>
            {rules.data!.map((r) => {
              const eff = effectiveFloor(r, product.distributor_price_paise);
              return (
                <TR key={r.id}>
                  <TD className="tabular">{r.qty_from}+</TD>
                  <TD className="text-right tabular">{formatINR(r.floor_price_paise)}</TD>
                  <TD className="text-right tabular">{formatINR(r.hard_minimum_paise)}</TD>
                  <TD className="text-right tabular">{r.max_discount_pct === null ? "–" : `${Number(r.max_discount_pct)}%`}</TD>
                  <TD className="text-right font-medium tabular">
                    {formatINR(eff)}
                    {eff > r.floor_price_paise && <span className="block text-xs font-normal text-warning">raised by discount cap</span>}
                  </TD>
                  <TD className="max-w-48 text-sm">{r.payment_terms ?? "–"}</TD>
                  <TD className="text-right tabular">{formatINR(r.max_credit_paise)}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="size-8" aria-label={`Edit tier from ${r.qty_from}`} onClick={() => open(r)}>
                        <Pencil aria-hidden />
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button size="icon" variant="ghost" className="size-8 text-danger" aria-label={`Delete tier from ${r.qty_from}`}>
                            <Trash2 aria-hidden />
                          </Button>
                        }
                        title={`Delete the ${r.qty_from}+ tier?`}
                        description="Asks at this quantity fall back to the next lower tier, or the list price if there is none."
                        confirmLabel="Delete tier"
                        variant="danger"
                        onConfirm={() => remove.mutateAsync(r.id)}
                      />
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      <p className="flex gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Effective floor = the higher of your floor and list price × (1 − max discount). The AI may offer at or above it alone; between it and the hard
        minimum needs a human; below the hard minimum is always rejected.
      </p>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? `New tier for ${product.name}` : "Edit tier"} description="Prices per unit in rupees, before GST.">
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field label="From quantity" htmlFor="t-qty" error={errors.qty} hint={Number(form.qty) < product.moq ? `Below the MOQ of ${product.moq}` : undefined}>
              <Input id="t-qty" inputMode="numeric" value={form.qty} aria-invalid={!!errors.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} />
            </Field>
            <Field label="Max discount % (optional)" htmlFor="t-disc" error={errors.maxDisc}>
              <Input id="t-disc" inputMode="decimal" value={form.maxDisc} aria-invalid={!!errors.maxDisc} onChange={(e) => setForm((f) => ({ ...f, maxDisc: e.target.value }))} />
            </Field>
            <Field label="Floor (₹) — AI may offer alone" htmlFor="t-floor" error={errors.floor}>
              <Input id="t-floor" inputMode="decimal" value={form.floor} aria-invalid={!!errors.floor} onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))} />
            </Field>
            <Field label="Hard minimum (₹) — lowest a human may approve" htmlFor="t-hard" error={errors.hard}>
              <Input id="t-hard" inputMode="decimal" value={form.hard} aria-invalid={!!errors.hard} onChange={(e) => setForm((f) => ({ ...f, hard: e.target.value }))} />
            </Field>
            <Field label="Payment terms" htmlFor="t-terms" className="sm:col-span-2">
              <Input id="t-terms" value={form.terms} onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))} placeholder="15 days credit from invoice date" />
            </Field>
            <Field label="Max credit (₹, optional)" htmlFor="t-credit" error={errors.credit}>
              <Input id="t-credit" inputMode="decimal" value={form.credit} aria-invalid={!!errors.credit} onChange={(e) => setForm((f) => ({ ...f, credit: e.target.value }))} />
            </Field>
            <div className="rounded-lg bg-surface-muted px-3 py-2 text-sm" aria-live="polite">
              <span className="text-xs text-muted-foreground">Effective floor</span>
              <p className="font-semibold tabular">{previewFloor === null ? "–" : formatINR(previewFloor)}</p>
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" loading={save.isPending}>Save tier</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Live "test a price": runs the real evaluate_offer rule in the database. */
export function TestPriceBox({ product }: { product: ProductLite }) {
  const supabase = getSupabaseBrowser();
  const [qty, setQty] = useState(String(product.moq));
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string>();

  const test = useRpc(
    async (vars: { qty: number; price: number }) =>
      (unwrap(await supabase.rpc("evaluate_offer", { p_product: product.id, p_qty: vars.qty, p_requested_paise: vars.price })) ?? [])[0] ?? null,
    { silentError: false },
  );
  const r = test.data;
  const requested = test.variables?.price;
  const decisionTone = r?.decision === "accept" ? "text-success" : r?.decision === "needs_approval" ? "text-warning" : "text-danger";
  const decisionLabel: Record<string, string> = {
    accept: "Accept: the AI can agree on its own",
    needs_approval: "Needs approval: the AI will ask you",
    reject: "Reject: the AI will hold the floor",
  };

  return (
    <div className="grid gap-3">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const q = Number(qty);
          const p = rupeesToPaise(price);
          if (!Number.isInteger(q) || q < 1) return setError("Enter a quantity");
          if (!price || !Number.isFinite(p) || p <= 0) return setError("Enter a price in rupees");
          setError(undefined);
          test.mutate({ qty: q, price: p });
        }}
      >
        <Field label="Quantity" htmlFor="tp-qty" className="w-28">
          <Input id="tp-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Buyer asks (₹ per unit)" htmlFor="tp-price" className="w-44">
          <Input id="tp-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Button type="submit" variant="secondary" loading={test.isPending}>Test price</Button>
      </form>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {r && (
        <div className="grid gap-3 rounded-lg border border-border p-3" aria-live="polite">
          <p className={`text-sm font-semibold ${decisionTone}`}>{decisionLabel[r.decision] ?? r.decision}</p>
          <p className="text-xs text-muted-foreground">
            Reason: {r.reason.replace(/_/g, " ")}
            {r.tier_qty_from ? ` · tier from ${r.tier_qty_from} units` : " · no tier reached"}
            {r.floor_paise ? ` · counter at ${formatINR(r.floor_paise)}` : ""}
          </p>
          <PriceGuardrailMeter requested={requested ?? null} floor={r.floor_paise} hardMinimum={r.hard_minimum_paise} list={product.distributor_price_paise} />
        </div>
      )}
    </div>
  );
}

