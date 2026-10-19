"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, FileText, Globe, MapPin, MessageSquare, NotebookPen, Truck } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { t } from "@/lib/i18n";
import { formatDate, formatDateTime, formatINR, timeAgo, titleCase } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { useRealtime } from "@/hooks/use-realtime";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Separator } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfidenceTag, MatchStatusBadge, ReviewStatusBadge, StagePill, StatusBadge } from "@/components/domain/badges";
import { ConversationThread } from "@/components/domain/conversation-thread";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { FitBreakdownPanel, ResearchPanel } from "@/components/manufacturer/fit-breakdown-panel";
import { ContactsCard } from "@/components/manufacturer/contacts-card";
import { NegotiationTimeline } from "@/components/manufacturer/negotiation-timeline";
import { OpenPdfButton } from "@/components/manufacturer/quotation-preview";
import { StageMenu, type Stage } from "@/components/manufacturer/stage-menu";
import { unwrapList, useTeam, useTrackScreen } from "@/components/manufacturer/hooks";

const QUAL_LABELS: Record<string, string> = {
  current_suppliers: "Current suppliers",
  monthly_volume: "Monthly volume",
  decision_maker: "Decision maker",
  timeline: "Timeline",
  objections: "Objections",
  brands_carried: "Brands carried",
  retail_reach: "Retail reach",
  credit_expectation: "Credit expectation",
  notes: "Notes",
};

export function ProspectDetail({ id }: { id: string }) {
  const supabase = getSupabaseBrowser();
  const qc = useQueryClient();
  const viewer = useViewer();
  const team = useTeam();
  useTrackScreen("prospect_detail", { prospect_id: id });
  const [stageError, setStageError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const canManage = viewer.role === "owner" || viewer.role === "sales_head";

  const prospect = useQuery({
    queryKey: qk.prospect(id),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("prospects")
          .select("*, source:sources(name), campaign:campaigns(id, name)")
          .eq("id", id)
          .maybeSingle(),
      ),
  });

  const conversations = useQuery({
    queryKey: qk.conversationsForProspect(id),
    queryFn: async () =>
      unwrapList(
        await supabase
          .from("conversations")
          .select("id, channel, last_inbound_at, last_outbound_at, unread_count, ai_paused, contact:contacts(name, phone_e164)")
          .eq("prospect_id", id)
          .order("last_inbound_at", { ascending: false, nullsFirst: false }),
      ),
  });

  const docs = useQuery({
    queryKey: ["prospect-docs", id],
    queryFn: async () => {
      const [q, po, o] = await Promise.all([
        supabase
          .from("quotations")
          .select("id, number, version, status, total_paise, valid_until, sent_at, pdf_path, created_at")
          .eq("prospect_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("purchase_orders")
          .select("id, created_at, match_status, status, quotation_id, parsed")
          .eq("prospect_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select("id, number, total_paise, status, ordered_on, shipments(status), payments(status, due_date)")
          .eq("prospect_id", id)
          .order("ordered_on", { ascending: false }),
      ]);
      return { quotations: unwrapList(q), pos: unwrapList(po), orders: unwrapList(o) };
    },
  });

  const events = useQuery({
    queryKey: qk.prospectEvents(id),
    queryFn: async () =>
      unwrapList(
        await supabase
          .from("prospect_events")
          .select("id, kind, from_stage, to_stage, body, data, actor_id, created_at")
          .eq("prospect_id", id)
          .order("created_at", { ascending: false })
          .limit(100),
      ),
  });

  useRealtime({ table: "prospects", filter: `id=eq.${id}`, invalidate: [qk.prospect(id), qk.prospectEvents(id)] });
  useRealtime({ table: "conversations", filter: `prospect_id=eq.${id}`, invalidate: [qk.conversationsForProspect(id)] });
  useRealtime({ table: "quotations", filter: `prospect_id=eq.${id}`, invalidate: [["prospect-docs", id], qk.negotiations(id)] });
  useRealtime({ table: "purchase_orders", filter: `prospect_id=eq.${id}`, invalidate: [["prospect-docs", id]] });

  const setStage = useRpc(
    async (to: Stage) => unwrap(await supabase.rpc("set_stage", { p_prospect: id, p_to: to })),
    {
      invalidate: [qk.prospect(id), qk.prospectEvents(id), qk.prospects()],
      success: (_d, to) => `Moved to ${t(`stage.${to}`)}`,
      onSuccess: () => setStageError(null),
      onError: (e) => setStageError(e.message),
    },
  );

  const assign = useRpc(
    async (repId: string) => {
      unwrap(await supabase.from("prospects").update({ assigned_rep_id: repId || null }).eq("id", id));
      const name = repId ? (team.byId.get(repId)?.full_name ?? "a rep") : "nobody";
      await supabase.rpc("log_prospect_event", { p_prospect: id, p_kind: "note", p_body: `Assigned to ${name}` });
      return repId;
    },
    {
      invalidate: [qk.prospect(id), qk.prospectEvents(id), qk.prospects()],
      success: (r) => (r ? "Rep assigned. They have been given access to this lead." : "Rep unassigned"),
    },
  );

  const addNote = useRpc(
    async (body: string) =>
      unwrap(
        await supabase.rpc("log_prospect_event", {
          p_prospect: id,
          p_kind: "note",
          p_body: body,
          p_idempotency_key: crypto.randomUUID(),
        }),
      ),
    {
      invalidate: [qk.prospectEvents(id)],
      success: "Note added",
      onSuccess: () => setNote(""),
    },
  );

  if (prospect.isLoading) return <LoadingSkeleton variant="detail" />;
  if (prospect.error) return <ErrorState error={prospect.error} onRetry={() => prospect.refetch()} />;
  if (!prospect.data)
    return (
      <EmptyState
        title="Prospect not found"
        description="It may belong to another account, or it was merged into another record."
        action={
          <Button asChild variant="outline">
            <Link href="/pipeline">Back to pipeline</Link>
          </Button>
        }
      />
    );

  const p = prospect.data;
  const source = p.source as { name: string } | null;
  const campaign = p.campaign as { id: string; name: string } | null;
  const qualification = (p.qualification && typeof p.qualification === "object" && !Array.isArray(p.qualification)
    ? p.qualification
    : {}) as Record<string, { value?: string; at?: string } | string>;
  const qualEntries = Object.entries(qualification);

  return (
    <div className="grid gap-6">
      <PageHeader
        back={
          <Link href={campaign ? `/campaigns/${campaign.id}` : "/pipeline"} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <ArrowLeft className="size-3" aria-hidden /> {campaign ? campaign.name : "Pipeline"}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.name} <StagePill stage={p.stage} />
            {p.review_status !== "approved" && <ReviewStatusBadge status={p.review_status} />}
            {p.is_stale && <StatusBadge status="stale" />}
          </span>
        }
        description={`${titleCase(p.type)}${p.city ? ` · ${p.city}` : ""}${p.state ? `, ${p.state}` : ""} · in ${t(`stage.${p.stage}`)} since ${formatDate(p.stage_changed_at)}`}
        actions={
          canManage ? (
            <>
              <div className="flex items-center gap-2">
                <Label htmlFor="assign-rep" className="text-xs text-muted-foreground">Rep</Label>
                <NativeSelect
                  id="assign-rep"
                  className="w-44"
                  value={p.assigned_rep_id ?? ""}
                  disabled={assign.isPending || p.review_status !== "approved"}
                  title={p.review_status !== "approved" ? "Approve the prospect in Lead Review before assigning a rep" : undefined}
                  onChange={(e) => assign.mutate(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {(team.data ?? [])
                    .filter((m) => m.role === "rep" && (m.active || m.user_id === p.assigned_rep_id))
                    .map((m) => (
                      <option key={m.user_id} value={m.user_id}>{m.full_name ?? m.email}</option>
                    ))}
                </NativeSelect>
              </div>
              <StageMenu stage={p.stage as Stage} onSelect={(to) => setStage.mutate(to)} disabled={setStage.isPending} label="Change stage" />
            </>
          ) : null
        }
      />
      {stageError && (
        <p role="alert" className="-mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          Stage not changed: {stageError}
        </p>
      )}
      {p.review_status !== "approved" && (
        <div role="status" className="-mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm">
          <span>
            {p.review_status === "merged"
              ? "This record was merged into another one."
              : p.review_status === "rejected"
                ? "Your team rejected this prospect in Lead Review. It will not be contacted."
                : "This prospect is waiting for your team's review. It cannot be contacted until someone approves it."}
          </span>
          {p.review_status === "merged" && p.merged_into ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/prospects/${p.merged_into}`}>Open the kept record</Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href={`/leads?status=all&id=${p.id}`}>Open in Lead Review</Link>
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Tabs defaultValue="conversation">
            <TabsList aria-label="Prospect sections">
              <TabsTrigger value="conversation"><MessageSquare className="size-3.5" aria-hidden /> Conversation</TabsTrigger>
              <TabsTrigger value="deals"><FileText className="size-3.5" aria-hidden /> Deals</TabsTrigger>
              <TabsTrigger value="activity"><NotebookPen className="size-3.5" aria-hidden /> Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="conversation" className="grid gap-4">
              {conversations.isLoading ? (
                <LoadingSkeleton rows={4} />
              ) : conversations.error ? (
                <ErrorState error={conversations.error} onRetry={() => conversations.refetch()} />
              ) : conversations.data!.length === 0 ? (
                <EmptyState
                  icon={<MessageSquare aria-hidden />}
                  title="No conversation yet"
                  description="A thread starts when the buyer writes in (for example from a click to chat link) or an opted in contact receives an AI opener."
                />
              ) : (
                conversations.data!.map((c) => (
                  <ConversationThread key={c.id} conversationId={c.id} canCompose={canManage} />
                ))
              )}
            </TabsContent>

            <TabsContent value="deals" className="grid gap-6">
              <section aria-labelledby="neg-h" className="grid gap-3">
                <h2 id="neg-h" className="text-sm font-semibold">Negotiation timeline</h2>
                <NegotiationTimeline prospectId={id} />
              </section>
              <Separator />
              {docs.isLoading ? (
                <LoadingSkeleton rows={3} />
              ) : docs.error ? (
                <ErrorState error={docs.error} onRetry={() => docs.refetch()} />
              ) : (
                <>
                  <section aria-labelledby="q-h" className="grid gap-2">
                    <h2 id="q-h" className="text-sm font-semibold">Quotations</h2>
                    {docs.data!.quotations.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No quotations yet. One is generated when a price is agreed inside your rules or approved.</p>
                    ) : (
                      <ul className="grid gap-2">
                        {docs.data!.quotations.map((q) => (
                          <li key={q.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                            <Link href={`/quotations?number=${encodeURIComponent(q.number)}`} className="font-medium tabular hover:underline">
                              {q.number}
                            </Link>
                            <span className="text-xs text-muted-foreground">v{q.version}</span>
                            <StatusBadge status={q.status} />
                            <span className="tabular">{formatINR(q.total_paise)}</span>
                            <span className="text-xs text-muted-foreground">valid until {formatDate(q.valid_until)}</span>
                            <span className="ml-auto"><OpenPdfButton pdfPath={q.pdf_path} /></span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section aria-labelledby="po-h" className="grid gap-2">
                    <h2 id="po-h" className="text-sm font-semibold">Purchase orders</h2>
                    {docs.data!.pos.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No purchase orders received.</p>
                    ) : (
                      <ul className="grid gap-2">
                        {docs.data!.pos.map((po) => {
                          const parsed = (po.parsed ?? {}) as Record<string, unknown>;
                          return (
                            <li key={po.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                              <Link href={`/quotations?po=${po.id}`} className="font-medium hover:underline">
                                {String(parsed.po_number ?? "PO")}
                              </Link>
                              <MatchStatusBadge status={po.match_status} />
                              <StatusBadge status={po.status} />
                              <span className="text-xs text-muted-foreground">received {timeAgo(po.created_at)}</span>
                              <Button asChild size="sm" variant="link" className="ml-auto">
                                <Link href={`/quotations?po=${po.id}`}>Review against quotation</Link>
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                  <section aria-labelledby="o-h" className="grid gap-2">
                    <h2 id="o-h" className="text-sm font-semibold">Orders</h2>
                    {docs.data!.orders.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No orders yet.</p>
                    ) : (
                      <ul className="grid gap-2">
                        {docs.data!.orders.map((o) => {
                          const ship = (o.shipments as { status: string }[] | null)?.[0];
                          const pay = (o.payments as { status: string; due_date: string | null }[] | null)?.[0];
                          return (
                            <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                              <Link href={`/orders?id=${o.id}`} className="font-medium tabular hover:underline">{o.number}</Link>
                              <span className="tabular">{formatINR(o.total_paise)}</span>
                              <span className="text-xs text-muted-foreground">{formatDate(o.ordered_on)}</span>
                              {ship && (
                                <span className="inline-flex items-center gap-1 text-xs">
                                  <Truck className="size-3" aria-hidden /> <StatusBadge status={ship.status} />
                                </span>
                              )}
                              {pay && <StatusBadge status={pay.status} />}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                </>
              )}
            </TabsContent>

            <TabsContent value="activity" className="grid gap-4">
              <form
                className="grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (note.trim()) addNote.mutate(note.trim());
                }}
              >
                <Label htmlFor="note">Add a note</Label>
                <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Called; wants samples before the festive season" />
                <Button type="submit" size="sm" className="justify-self-end" loading={addNote.isPending} disabled={!note.trim()}>
                  Save note
                </Button>
              </form>
              {events.isLoading ? (
                <LoadingSkeleton rows={4} />
              ) : events.error ? (
                <ErrorState error={events.error} onRetry={() => events.refetch()} />
              ) : events.data!.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ol className="grid gap-3" aria-label="Activity timeline">
                  {events.data!.map((e) => {
                    const actor = e.actor_id ? team.byId.get(e.actor_id)?.full_name : null;
                    return (
                      <li key={e.id} className="grid gap-0.5 border-l-2 border-border pl-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titleCase(e.kind)}</span>
                          {e.kind === "stage_change" && e.to_stage && (
                            <span className="flex items-center gap-1">
                              {e.from_stage && <StagePill stage={e.from_stage} />} → <StagePill stage={e.to_stage} />
                            </span>
                          )}
                          <time className="ml-auto text-xs text-muted-foreground" dateTime={e.created_at}>{formatDateTime(e.created_at)}</time>
                        </div>
                        {e.body && <p>{e.body}</p>}
                        <p className="text-xs text-muted-foreground">{actor ? `by ${actor}` : e.actor_id ? "by a teammate" : "by the system"}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <aside className="grid content-start gap-6" aria-label="Prospect profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div>
                    <dt className="sr-only">Address</dt>
                    <dd>
                      {p.address ?? "No address"}
                      {(p.city || p.pincode) && <span className="block text-muted-foreground">{[p.city, p.state, p.pincode].filter(Boolean).join(", ")}</span>}
                    </dd>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">GSTIN</dt>
                    <dd className="font-mono text-xs">{p.gstin ?? "–"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Category</dt>
                    <dd>{p.category ?? "–"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Source</dt>
                    <dd>
                      {source?.name ?? "–"}
                      {p.source_url && (
                        <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center text-primary" aria-label="Open source listing in a new tab">
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Data</dt>
                    <dd><ConfidenceTag confidence={p.confidence} /></dd>
                  </div>
                </div>
                {p.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="size-4 text-muted-foreground" aria-hidden />
                    <dt className="sr-only">Website</dt>
                    <dd>
                      <a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {p.website}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <ContactsCard prospectId={id} onConsentChange={() => qc.invalidateQueries({ queryKey: qk.conversationsForProspect(id) })} />

          <Card>
            <CardHeader>
              <CardTitle>Qualification</CardTitle>
            </CardHeader>
            <CardContent>
              {qualEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing captured yet. The AI records suppliers, volume, decision maker and timeline as it talks.</p>
              ) : (
                <dl className="grid gap-2 text-sm">
                  {qualEntries.map(([k, v]) => {
                    const value = typeof v === "string" ? v : v?.value;
                    const at = typeof v === "string" ? null : v?.at;
                    return (
                      <div key={k}>
                        <dt className="text-xs text-muted-foreground">{QUAL_LABELS[k] ?? titleCase(k)}</dt>
                        <dd>
                          {value ?? "–"}
                          {at && <span className="ml-1 text-xs text-muted-foreground">· {timeAgo(at)}</span>}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-5 p-4">
              <FitBreakdownPanel breakdown={p.fit_breakdown} score={p.fit_score} version={p.fit_config_version} />
              <Separator />
              <ResearchPanel research={p.research} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
