"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatINR, formatINRCompact, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FunnelCounts = {
  identified: number;
  contacted: number;
  conversations: number;
  qualified: number;
  quoted: number;
  ordered: number;
};

export const FUNNEL_STEPS: { key: keyof FunnelCounts; label: string }[] = [
  { key: "identified", label: "Identified" },
  { key: "contacted", label: "Contacted" },
  { key: "conversations", label: "Conversations" },
  { key: "qualified", label: "Qualified" },
  { key: "quoted", label: "Quoted" },
  { key: "ordered", label: "Ordered" },
];

export function sumFunnel(rows: Partial<Record<keyof FunnelCounts, number | null>>[]): FunnelCounts {
  const out: FunnelCounts = { identified: 0, contacted: 0, conversations: 0, qualified: 0, quoted: 0, ordered: 0 };
  for (const r of rows) for (const s of FUNNEL_STEPS) out[s.key] += Number(r[s.key] ?? 0);
  return out;
}

function pctOf(n: number, d: number) {
  return d > 0 ? `${((n / d) * 100).toFixed(n / d < 0.1 ? 1 : 0)}%` : "–";
}

/** Lightweight CSS funnel for the dashboard (no chart library needed). */
export function FunnelBars({ counts, className }: { counts: FunnelCounts; className?: string }) {
  const top = Math.max(counts.identified, 1);
  return (
    <ol className={cn("grid gap-2", className)} aria-label="Sales funnel">
      {FUNNEL_STEPS.map((s, i) => {
        const v = counts[s.key];
        const prev = i === 0 ? null : counts[FUNNEL_STEPS[i - 1]!.key];
        return (
          <li key={s.key} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm">
            <span className="text-muted-foreground">{s.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
              <span className="block h-full rounded-full bg-primary" style={{ width: `${(v / top) * 100}%` }} />
            </span>
            <span className="w-24 text-right tabular">
              <strong>{formatNumber(v)}</strong>
              {prev !== null && <span className="ml-1 text-xs text-muted-foreground">{pctOf(v, prev)}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const axisTick = { fill: "var(--muted-foreground)", fontSize: 12 };

function ChartTooltipBox({
  active,
  label,
  rows,
}: {
  active?: boolean;
  label?: string;
  rows: { name: string; value: string }[];
}) {
  if (!active) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-medium">{label}</p>}
      {rows.map((r) => (
        <p key={r.name} className="tabular">
          <span className="text-muted-foreground">{r.name}: </span>
          {r.value}
        </p>
      ))}
    </div>
  );
}

export function FunnelChart({ counts }: { counts: FunnelCounts }) {
  const data = FUNNEL_STEPS.map((s, i) => ({
    step: s.label,
    value: counts[s.key],
    conv: i === 0 ? "" : pctOf(counts[s.key], counts[FUNNEL_STEPS[i - 1]!.key]),
  }));
  return (
    <figure className="grid gap-2">
      <div className="h-64" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" tick={axisTick} allowDecimals={false} />
            <YAxis type="category" dataKey="step" width={100} tick={axisTick} />
            <Tooltip
              cursor={{ fill: "var(--surface-muted)" }}
              content={({ active, payload, label }) => (
                <ChartTooltipBox
                  active={active}
                  label={String(label ?? "")}
                  rows={payload?.length ? [{ name: "Prospects", value: formatNumber(Number(payload[0]!.value)) }] : []}
                />
              )}
            />
            <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="value" position="right" fill="var(--foreground)" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Funnel:{" "}
        {data.map((d) => `${d.step} ${d.value}${d.conv ? ` (${d.conv} of previous step)` : ""}`).join(", ")}.
      </figcaption>
    </figure>
  );
}

export type RevenuePoint = { month: string; label: string; revenue_paise: number; orders: number; accounts: number };

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <figure className="grid gap-2">
      <div className="h-64" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 8, right: 8, top: 16, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={axisTick} />
            <YAxis tick={axisTick} tickFormatter={(v: number) => formatINRCompact(v)} width={64} />
            <Tooltip
              cursor={{ fill: "var(--surface-muted)" }}
              content={({ active, payload, label }) => {
                const p = payload?.[0]?.payload as RevenuePoint | undefined;
                return (
                  <ChartTooltipBox
                    active={active}
                    label={String(label ?? "")}
                    rows={
                      p
                        ? [
                            { name: "Revenue", value: formatINR(p.revenue_paise, { whole: true }) },
                            { name: "Orders", value: formatNumber(p.orders) },
                            { name: "Accounts", value: formatNumber(p.accounts) },
                          ]
                        : []
                    }
                  />
                );
              }}
            />
            <Bar dataKey="revenue_paise" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Revenue by month: {data.map((d) => `${d.label} ${formatINR(d.revenue_paise, { whole: true })} from ${d.orders} orders`).join(", ")}.
      </figcaption>
    </figure>
  );
}

export type CityPoint = { city: string; prospects: number; contacted: number; qualified: number; customers: number; revenue_paise: number };

export function CityChart({ data }: { data: CityPoint[] }) {
  const rows = data.map((d) => ({
    ...d,
    rate: d.prospects > 0 ? Math.round((d.customers / d.prospects) * 1000) / 10 : 0,
  }));
  return (
    <figure className="grid gap-2">
      <div className="h-64" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ left: 8, right: 8, top: 16, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="city" tick={axisTick} />
            <YAxis tick={axisTick} allowDecimals={false} width={40} />
            <Tooltip
              cursor={{ fill: "var(--surface-muted)" }}
              content={({ active, payload, label }) => {
                const p = payload?.[0]?.payload as (CityPoint & { rate: number }) | undefined;
                return (
                  <ChartTooltipBox
                    active={active}
                    label={String(label ?? "")}
                    rows={
                      p
                        ? [
                            { name: "Prospects", value: formatNumber(p.prospects) },
                            { name: "Qualified", value: formatNumber(p.qualified) },
                            { name: "Customers", value: `${formatNumber(p.customers)} (${p.rate}%)` },
                          ]
                        : []
                    }
                  />
                );
              }}
            />
            <Bar dataKey="prospects" name="Prospects" fill="var(--border)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="qualified" name="Qualified" fill="var(--info)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="customers" name="Customers" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-hidden>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-border" /> Prospects
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-info" /> Qualified
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" /> Customers
        </li>
      </ul>
      <figcaption className="sr-only">
        Conversion by city:{" "}
        {rows.map((d) => `${d.city}: ${d.prospects} prospects, ${d.qualified} qualified, ${d.customers} customers (${d.rate}%)`).join("; ")}.
      </figcaption>
    </figure>
  );
}

export function TrendLine({ data, dataKey, label }: { data: Record<string, number | string>[]; dataKey: string; label: string }) {
  return (
    <div className="h-40" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={axisTick} />
          <YAxis tick={axisTick} width={32} allowDecimals={false} />
          <Tooltip
            content={({ active, payload, label: l }) => (
              <ChartTooltipBox
                active={active}
                label={String(l ?? "")}
                rows={payload?.length ? [{ name: label, value: formatNumber(Number(payload[0]!.value)) }] : []}
              />
            )}
          />
          <Line type="monotone" dataKey={dataKey} stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
