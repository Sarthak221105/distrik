"use client";

import { ExternalLink, Phone, Sparkles, UserRound } from "lucide-react";
import { ConfidenceTag, ConsentTag } from "@/components/domain/badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { telLink } from "@/components/rep/helpers";
import { formatPhone, titleCase } from "@/lib/format";
import type { LeadContact, LeadRecord } from "@/lib/offline/types";

type Research = {
  summary?: string;
  reason_to_switch?: string;
  brands_carried?: string | string[];
  retail_reach?: string;
  estimated_scale?: string;
  inferred?: boolean;
  decision_makers?: { name?: string; role?: string }[];
  sources?: { url?: string; label?: string }[];
};

function asText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("value" in o) return asText(o.value);
    return JSON.stringify(o);
  }
  return String(v);
}

/** Talking points from the AI's research and what the buyer has already told us. */
export function TalkingPoints({ lead }: { lead: LeadRecord }) {
  const r = (lead.research ?? {}) as Research;
  const q = (lead.qualification ?? {}) as Record<string, unknown>;
  const brands = asText(r.brands_carried) ?? asText(q.brands_carried);
  const facts = [
    { label: "Brands carried", value: brands },
    { label: "Retail reach", value: asText(r.retail_reach) ?? asText(q.retail_reach) },
    { label: "Estimated scale", value: asText(r.estimated_scale) },
  ].filter((f) => f.value);
  const qualification = Object.entries(q)
    .filter(([k]) => k !== "brands_carried" && k !== "retail_reach")
    .map(([k, v]) => ({ label: titleCase(k), value: asText(v) }))
    .filter((f) => f.value);
  const sources = (r.sources ?? []).filter((s) => s.url);
  const empty = !r.reason_to_switch && !r.summary && facts.length === 0 && qualification.length === 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-ai" aria-hidden /> Talking points
        </CardTitle>
        <ConfidenceTag confidence={r.inferred ? "inferred" : lead.confidence} />
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {empty && <p className="text-muted-foreground">No research yet. Ask about current brands, monthly volume and who decides.</p>}
        {r.reason_to_switch && (
          <div className="rounded-lg border border-ai/20 bg-ai-soft p-3">
            <p className="mb-0.5 text-xs font-medium text-ai">Why they might switch</p>
            <p>{r.reason_to_switch}</p>
          </div>
        )}
        {r.summary && <p className="text-muted-foreground">{r.summary}</p>}
        {facts.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {facts.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {(r.decision_makers ?? []).length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Decision makers</p>
            <ul className="mt-1 grid gap-0.5">
              {r.decision_makers!.map((d, i) => (
                <li key={i}>
                  {d.name}
                  {d.role ? <span className="text-muted-foreground"> · {d.role}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
        {qualification.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Already learned from the buyer</p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {qualification.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {sources.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-8 items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="size-3" aria-hidden />
                {s.label ?? "Source"}
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function consentOf(c: LeadContact | null | undefined): string {
  return c?.consents?.find((x) => x.channel === "whatsapp")?.status ?? "none";
}

export function ContactsCard({ contacts }: { contacts: LeadContact[] }) {
  const list = [...contacts].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound className="size-4 text-muted-foreground" aria-hidden /> Contacts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contacts on file. Add one from the web app.</p>
        ) : (
          <ul className="grid gap-2">
            {list.map((c) => {
              const tel = telLink(c.phone_e164);
              return (
                <li key={c.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{c.erased_at ? "Erased contact" : (c.name ?? "Unnamed")}</span>
                      {c.is_primary && <Badge tone="outline">Primary</Badge>}
                      <ConsentTag status={consentOf(c)} />
                    </div>
                    <span className="text-xs text-muted-foreground tabular">
                      {[c.role, c.erased_at ? null : formatPhone(c.phone_e164)].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  {tel && !c.erased_at && (
                    <a
                      href={tel}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-surface-muted"
                      aria-label={`Call ${c.name ?? "contact"}`}
                    >
                      <Phone className="size-4" aria-hidden />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
