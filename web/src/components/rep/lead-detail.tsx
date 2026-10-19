"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, CloudOff, Copy, MapPin, MessageCircle, Moon, Phone, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { useViewer } from "@/components/providers";
import { FitScoreBadge, StagePill } from "@/components/domain/badges";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivityTimeline } from "@/components/rep/activity-timeline";
import { CallLogForm, NoteForm, StageSheet } from "@/components/rep/lead-forms";
import { LeadCorrections } from "@/components/rep/lead-corrections";
import { ContactsCard, TalkingPoints, consentOf } from "@/components/rep/lead-profile";
import { LeadThread } from "@/components/rep/lead-thread";
import { PoUpload } from "@/components/rep/po-upload";
import { SyncStatusList } from "@/components/rep/sync-status-list";
import { clickToChatInvite, telLink, waLink } from "@/components/rep/helpers";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { RpcError, toAppError } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { timeAgo, titleCase } from "@/lib/format";
import { t } from "@/lib/i18n";
import { getLeadSnapshot, saveLeadSnapshot } from "@/lib/offline/cache";
import { useOnline, useQueuedMutations } from "@/lib/offline/hooks";
import { isNetworkError, isOnline } from "@/lib/offline/network";
import type { LeadEvent, LeadRecord, ProspectStage } from "@/lib/offline/types";
import { warmPageCache } from "@/lib/offline/sw-register";

const LEAD_SELECT =
  "id, name, type, category, address, city, state, pincode, stage, stage_changed_at, fit_score, research, qualification, ref_code, is_stale, is_customer, assigned_rep_id, confidence, source_url, contacts(id, name, role, phone_e164, is_primary, erased_at, consents(status, channel)), conversations(id, contact_id, ai_paused, paused_reason, unread_count, last_inbound_at, channel)";

type LeadData = { lead: LeadRecord; events: LeadEvent[]; offline: boolean; savedAt: number | null };

export function LeadDetail({ id }: { id: string }) {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const online = useOnline();
  const local = useQueuedMutations(viewer.userId, id);
  const [stageOpen, setStageOpen] = useState(false);
  const [tab, setTab] = useState("profile");

  const query = useQuery<LeadData>({
    queryKey: qk.prospect(id),
    queryFn: async () => {
      const fromCache = async (cause: unknown): Promise<LeadData> => {
        const snap = await getLeadSnapshot(viewer.userId, id);
        if (snap) return { lead: snap.lead, events: snap.events, offline: true, savedAt: snap.savedAt };
        throw cause instanceof Error ? cause : new RpcError({ code: "offline", message: "You are offline and this lead is not saved on this phone yet." });
      };
      if (!isOnline()) return fromCache(null);
      const [p, ev] = await Promise.all([
        supabase.from("prospects").select(LEAD_SELECT).eq("id", id).maybeSingle(),
        supabase
          .from("prospect_events")
          .select("id, kind, from_stage, to_stage, body, data, created_at, client_ts, actor_id")
          .eq("prospect_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      const err = p.error ?? ev.error;
      if (err) {
        if (isNetworkError(err) || p.status === 0) return fromCache(new RpcError({ code: "offline", message: "No connection, and this lead is not saved on this phone yet." }));
        throw new RpcError(toAppError(err));
      }
      if (!p.data) throw new RpcError({ code: "not_found", message: "This lead does not exist or is not assigned to you." });
      const lead = p.data as unknown as LeadRecord;
      const events = (ev.data ?? []) as LeadEvent[];
      void saveLeadSnapshot(viewer.userId, lead, events);
      return { lead, events, offline: false, savedAt: null };
    },
  });

  const { refetch } = query;
  const showingOfflineCopy = query.data?.offline ?? false;
  useEffect(() => {
    if (online && showingOfflineCopy) void refetch();
  }, [online, showingOfflineCopy, refetch]);

  // Keep this page's shell for offline starts (HTML only; data comes from IndexedDB).
  useEffect(() => {
    if (online) warmPageCache([`/rep/leads/${id}`]);
  }, [online, id]);

  const lead = query.data?.lead;
  const primary = useMemo(() => {
    const contacts = (lead?.contacts ?? []).filter((c) => !c.erased_at);
    return contacts.find((c) => c.is_primary) ?? contacts[0] ?? null;
  }, [lead]);
  const conversation = useMemo(() => {
    const convs = lead?.conversations ?? [];
    return (
      convs.find((c) => c.contact_id === primary?.id && c.channel === "whatsapp") ??
      [...convs].sort((a, b) => (b.last_inbound_at ?? "").localeCompare(a.last_inbound_at ?? ""))[0] ??
      null
    );
  }, [lead, primary]);

  if (query.isLoading) return <LoadingSkeleton variant="detail" />;
  if (query.error || !lead) {
    return (
      <div className="grid gap-4">
        <BackLink />
        <ErrorState
          title={(query.error as RpcError | null)?.code === "not_found" ? "Lead not found" : "Could not load this lead"}
          error={query.error}
          onRetry={() => query.refetch()}
        />
      </div>
    );
  }

  const pendingStage = local.find((m) => m.kind === "stage" && m.status === "pending");
  const effectiveStage = (pendingStage?.kind === "stage" ? pendingStage.payload.to : lead.stage) as ProspectStage;
  const consent = consentOf(primary);
  const tel = telLink(primary?.phone_e164);
  const invite = clickToChatInvite({
    buyerName: primary?.name ?? lead.name,
    repName: viewer.fullName,
    manufacturerName: viewer.manufacturer?.name ?? null,
    businessNumber: viewer.manufacturer?.whatsapp_display_number ?? null,
    refCode: lead.ref_code,
  });
  const wa = consent === "opted_out" ? null : waLink(primary?.phone_e164, invite);

  return (
    <div className="grid gap-4">
      <BackLink />

      {query.data?.offline && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning" role="status">
          <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Offline copy saved {query.data.savedAt ? timeAgo(new Date(query.data.savedAt)) : "earlier"}. You can still log calls, notes and stage changes.
          </span>
        </div>
      )}

      <Card className="grid gap-3 p-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold leading-tight">{lead.name}</h2>
          <p className="text-sm text-muted-foreground">
            {[titleCase(lead.type), lead.category, lead.city].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StagePill stage={lead.stage} />
          {pendingStage?.kind === "stage" && (
            <Badge tone="warning">
              <Clock aria-hidden /> {t(`stage.${pendingStage.payload.to}`)} waiting to sync
            </Badge>
          )}
          <FitScoreBadge score={lead.fit_score} />
          {lead.is_stale && (
            <Badge tone="neutral">
              <Moon aria-hidden /> Stale
            </Badge>
          )}
          {conversation?.ai_paused && <Badge tone="warning">AI paused</Badge>}
        </div>
        {(lead.address || lead.pincode) && (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{[lead.address, lead.city, lead.state, lead.pincode].filter(Boolean).join(", ")}</span>
          </p>
        )}
        {conversation?.ai_paused && conversation.paused_reason && (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">Escalated: {conversation.paused_reason}</p>
        )}

        <div className="grid grid-cols-3 gap-2">
          {tel ? (
            <Button asChild size="lg">
              <a href={tel} aria-label={`Call ${primary?.name ?? lead.name}`}>
                <Phone aria-hidden /> Call
              </a>
            </Button>
          ) : (
            <Button size="lg" disabled title="No phone number on file">
              <Phone aria-hidden /> Call
            </Button>
          )}
          {wa ? (
            <Button asChild size="lg" variant="success">
              <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="Send WhatsApp click to chat invite">
                <MessageCircle aria-hidden /> WhatsApp
              </a>
            </Button>
          ) : (
            <Button size="lg" variant="success" disabled title={consent === "opted_out" ? "This contact opted out of WhatsApp" : "No phone number on file"}>
              <MessageCircle aria-hidden /> WhatsApp
            </Button>
          )}
          <Button size="lg" variant="outline" onClick={() => setStageOpen(true)}>
            <Shuffle aria-hidden /> Stage
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {consent === "opted_out"
              ? "Opted out of WhatsApp. Call only."
              : consent === "none"
                ? "No WhatsApp consent: the button sends a click to chat invite to your business number."
                : "WhatsApp opens a chat from your phone; replies to the business number appear in Chat."}
            {lead.ref_code ? ` Ref ${lead.ref_code}.` : ""}
          </span>
          {consent !== "opted_out" && (
            <button
              type="button"
              className="inline-flex min-h-8 items-center gap-1 text-primary hover:underline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(invite);
                  toast.success("Invite copied");
                } catch {
                  toast.error("Could not copy");
                }
              }}
            >
              <Copy className="size-3" aria-hidden /> Copy invite
            </button>
          )}
        </div>
      </Card>

      <SyncStatusList userId={viewer.userId} prospectId={id} hideWhenEmpty />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-11 w-full grid-cols-4">
          <TabsTrigger value="profile" className="h-9">
            Profile
          </TabsTrigger>
          <TabsTrigger value="chat" className="h-9">
            Chat
            {(conversation?.unread_count ?? 0) > 0 && (
              <span className="rounded-full bg-info px-1.5 text-[10px] text-white">
                {conversation!.unread_count}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="log" className="h-9">
            Log
          </TabsTrigger>
          <TabsTrigger value="activity" className="h-9">
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="grid gap-4">
          <TalkingPoints lead={lead} />
          <ContactsCard contacts={lead.contacts} />
        </TabsContent>

        <TabsContent value="chat">
          {conversation ? (
            <LeadThread conversationId={conversation.id} prospectId={id} />
          ) : (
            <EmptyState
              icon={<MessageCircle aria-hidden />}
              title="No WhatsApp conversation yet"
              description="This buyer has not messaged your business number. Call them, or send the click to chat invite so they can start the chat."
              action={
                wa ? (
                  <Button asChild variant="success">
                    <a href={wa} target="_blank" rel="noopener noreferrer">
                      <MessageCircle aria-hidden /> Send invite
                    </a>
                  </Button>
                ) : undefined
              }
            />
          )}
        </TabsContent>

        <TabsContent value="log" className="grid gap-4">
          <CallLogForm prospectId={id} prospectName={lead.name} />
          <NoteForm prospectId={id} prospectName={lead.name} />
          <PoUpload prospectId={id} />
          <LeadCorrections lead={lead} primary={primary} />
        </TabsContent>

        <TabsContent value="activity" className="grid gap-4">
          <ActivityTimeline events={query.data!.events} local={local} />
        </TabsContent>
      </Tabs>

      <StageSheet
        open={stageOpen}
        onOpenChange={setStageOpen}
        current={effectiveStage}
        prospectId={id}
        prospectName={lead.name}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/rep/leads" className="inline-flex min-h-9 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden /> All leads
    </Link>
  );
}
