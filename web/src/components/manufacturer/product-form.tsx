"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { rupeesToPaise } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import type { Tables, TablesInsert } from "@/lib/database.types";

export const GST_RATES = ["0", "0.25", "3", "5", "12", "18", "28", "40"] as const;

const money = z
  .string()
  .trim()
  .refine((v) => v === "" || (Number.isFinite(Number(v.replace(/[₹,\s]/g, ""))) && Number(v.replace(/[₹,\s]/g, "")) >= 0), "Enter an amount in rupees");

export const productSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  sku: z.string().trim().min(1, "SKU is required").max(40, "Keep the SKU under 40 characters"),
  category: z.string().trim(),
  description: z.string().trim(),
  unit: z.string().trim().min(1, "Unit is required, for example jar or carton"),
  mrp: money,
  distributor: money.refine((v) => v !== "", "Distributor price is required"),
  cost: money,
  moq: z.string().trim().regex(/^[1-9][0-9]*$/, "MOQ must be a whole number of at least 1"),
  hsn: z.string().trim().regex(/^$|^[0-9]{4,8}$/, "HSN is 4 to 8 digits"),
  gst: z.enum(GST_RATES),
  certifications: z.string().trim(),
  status: z.enum(["draft", "active", "archived"]),
});

export type ProductFormValues = z.infer<typeof productSchema>;

const toRupees = (p: number | null | undefined) => (p === null || p === undefined ? "" : String(p / 100));

export function productToForm(p?: Tables<"products"> | null): ProductFormValues {
  return {
    name: p?.name ?? "",
    sku: p?.sku ?? "",
    category: p?.category ?? "",
    description: p?.description ?? "",
    unit: p?.unit ?? "unit",
    mrp: toRupees(p?.mrp_paise),
    distributor: toRupees(p?.distributor_price_paise),
    cost: toRupees(p?.cost_paise),
    moq: String(p?.moq ?? 1),
    hsn: p?.hsn_code ?? "",
    gst: (GST_RATES.find((g) => Number(g) === Number(p?.gst_rate ?? 18)) ?? "18") as ProductFormValues["gst"],
    certifications: (p?.certifications ?? []).join(", "),
    status: (p?.status as ProductFormValues["status"]) ?? "active",
  };
}

/** Create or edit a product; prices are typed in rupees and stored as paise. */
export function ProductForm({ product, onDone }: { product?: Tables<"products"> | null; onDone: () => void }) {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const form = useForm<ProductFormValues>({ resolver: zodResolver(productSchema), defaultValues: productToForm(product) });
  const { register, handleSubmit, formState, setError } = form;
  const e = formState.errors;

  const save = useRpc(
    async (v: ProductFormValues) => {
      const paise = (s: string) => (s === "" ? null : rupeesToPaise(s));
      const row: TablesInsert<"products"> = {
        manufacturer_id: viewer.manufacturerId!,
        name: v.name,
        sku: v.sku.toUpperCase(),
        category: v.category || null,
        description: v.description || null,
        unit: v.unit,
        mrp_paise: paise(v.mrp),
        distributor_price_paise: paise(v.distributor),
        cost_paise: paise(v.cost),
        moq: Number(v.moq),
        hsn_code: v.hsn || null,
        gst_rate: Number(v.gst),
        certifications: v.certifications ? v.certifications.split(",").map((c) => c.trim()).filter(Boolean) : [],
        status: v.status,
      };
      if (product) return unwrap(await supabase.from("products").update(row).eq("id", product.id).select("id").single());
      return unwrap(await supabase.from("products").insert(row).select("id").single());
    },
    {
      invalidate: [qk.products()],
      success: product ? "Product saved" : "Product added. Set its price tiers in Commercial rules.",
      onSuccess: onDone,
      onError: (err) => {
        if (err.code === "23505") setError("sku", { message: "Another product already uses this SKU" });
      },
    },
  );

  return (
    <form className="grid gap-4" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Product name" htmlFor="pf-name" error={e.name?.message} className="sm:col-span-2">
          <Input id="pf-name" {...register("name")} aria-invalid={!!e.name} />
        </Field>
        <Field label="SKU" htmlFor="pf-sku" error={e.sku?.message}>
          <Input id="pf-sku" {...register("sku")} aria-invalid={!!e.sku} className="uppercase" />
        </Field>
        <Field label="Category" htmlFor="pf-cat">
          <Input id="pf-cat" {...register("category")} placeholder="edible oils" />
        </Field>
        <Field label="Description" htmlFor="pf-desc" className="sm:col-span-2">
          <Textarea id="pf-desc" rows={2} {...register("description")} />
        </Field>
        <Field label="Unit of sale" htmlFor="pf-unit" error={e.unit?.message}>
          <Input id="pf-unit" {...register("unit")} aria-invalid={!!e.unit} placeholder="jar, carton of 60" />
        </Field>
        <Field label="MOQ (units)" htmlFor="pf-moq" error={e.moq?.message}>
          <Input id="pf-moq" inputMode="numeric" {...register("moq")} aria-invalid={!!e.moq} />
        </Field>
        <Field label="MRP (₹)" htmlFor="pf-mrp" error={e.mrp?.message}>
          <Input id="pf-mrp" inputMode="decimal" {...register("mrp")} aria-invalid={!!e.mrp} />
        </Field>
        <Field label="Distributor price (₹)" htmlFor="pf-dp" error={e.distributor?.message} hint="List price to trade, before GST">
          <Input id="pf-dp" inputMode="decimal" {...register("distributor")} aria-invalid={!!e.distributor} />
        </Field>
        <Field label="Cost (₹, private)" htmlFor="pf-cost" error={e.cost?.message} hint="Used only to show margin on approvals">
          <Input id="pf-cost" inputMode="decimal" {...register("cost")} aria-invalid={!!e.cost} />
        </Field>
        <Field label="HSN code" htmlFor="pf-hsn" error={e.hsn?.message}>
          <Input id="pf-hsn" inputMode="numeric" {...register("hsn")} aria-invalid={!!e.hsn} />
        </Field>
        <Field label="GST rate" htmlFor="pf-gst">
          <NativeSelect id="pf-gst" {...register("gst")}>
            {GST_RATES.map((g) => <option key={g} value={g}>{g}%</option>)}
          </NativeSelect>
        </Field>
        <Field label="Status" htmlFor="pf-status">
          <NativeSelect id="pf-status" {...register("status")}>
            <option value="active">Active (AI may sell it)</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </NativeSelect>
        </Field>
        <Field label="Certifications" htmlFor="pf-cert" hint="Comma separated, e.g. FSSAI, AGMARK" className="sm:col-span-2">
          <Input id="pf-cert" {...register("certifications")} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending}>{product ? "Save product" : "Add product"}</Button>
      </div>
    </form>
  );
}
