"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
export { invokeFn, toE164 } from "@/lib/edge";
import { qk } from "@/lib/query-keys";
import { NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function JsonView({ value, className, label }: { value: unknown; className?: string; label?: string }) {
  if (value === null || value === undefined) return <span className="text-xs text-muted-foreground">–</span>;
  return (
    <pre
      aria-label={label}
      tabIndex={0}
      className={cn("max-h-64 overflow-auto rounded-md border border-border bg-surface-muted p-2 font-mono text-[11px] leading-relaxed", className)}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export type ManufacturerOption = { id: string; name: string; whatsapp_phone_number_id: string | null };

export function useManufacturers() {
  return useQuery({
    queryKey: qk.system("manufacturers"),
    queryFn: async () =>
      (unwrap(await getSupabaseBrowser().from("manufacturers").select("id, name, whatsapp_phone_number_id").order("name")) ??
        []) as ManufacturerOption[],
    staleTime: 5 * 60_000,
  });
}

export function ManufacturerSelect({
  id,
  value,
  onChange,
  allowAll = true,
  className,
  filter,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  allowAll?: boolean;
  className?: string;
  filter?: (m: ManufacturerOption) => boolean;
}) {
  const m = useManufacturers();
  const list = (m.data ?? []).filter((x) => (filter ? filter(x) : true));
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className} disabled={m.isLoading}>
      {allowAll ? <option value="">All tenants</option> : <option value="">Choose a tenant…</option>}
      {list.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Normalises a value for "same or different" comparisons (case, spacing, punctuation). */
export function comparable(v: unknown, kind: "text" | "phone" = "text"): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (kind === "phone") return s.replace(/\D/g, "").slice(-10);
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
