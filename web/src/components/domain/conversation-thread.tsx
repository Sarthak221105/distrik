"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Bot,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Hand,
  Image as ImageIcon,
  PauseCircle,
  PlayCircle,
  Send,
  User,
  Wrench,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import { unwrap } from "@/lib/errors";
import { formatDateTime, formatPhone, timeAgo } from "@/lib/format";
import { signedUrlForFullPath } from "@/lib/storage";
import { useRealtime } from "@/hooks/use-realtime";
import { useRpc } from "@/hooks/use-rpc";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConsentTag } from "@/components/domain/badges";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";

type Message = Tables<"messages">;
type AiAction = Pick<
  Tables<"ai_actions">,
  "id" | "action_type" | "input" | "output" | "rule_checked" | "outcome" | "created_at" | "turn_id" | "agent" | "flagged"
>;

type TimelineItem = { kind: "message"; at: string; message: Message } | { kind: "action"; at: string; action: AiAction };

const HIDDEN_ACTIONS = new Set(["reply", "model_call"]);

/**
 * ConversationThread: AI and human messages are visually distinct, and the
 * AI's tool actions (price checks, approvals, escalations) appear inline.
 */
export function ConversationThread({
  conversationId,
  canCompose = false,
  showActions = true,
  className,
  height = "h-[560px]",
}: {
  conversationId: string;
  canCompose?: boolean;
  showActions?: boolean;
  className?: string;
  height?: string;
}) {
  const supabase = getSupabaseBrowser();

  const conversation = useQuery({
    queryKey: qk.conversation(conversationId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("conversations")
          .select(
            "id, prospect_id, contact_id, window_expires_at, ai_paused, paused_reason, paused_at, last_inbound_at, contact:contacts(name, phone_e164)",
          )
          .eq("id", conversationId)
          .single(),
      ),
  });

  const consent = useQuery({
    enabled: !!conversation.data?.contact_id,
    queryKey: ["consent", conversation.data?.contact_id],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("consents")
          .select("status, source, changed_at")
          .eq("contact_id", conversation.data!.contact_id)
          .eq("channel", "whatsapp")
          .maybeSingle(),
      ),
  });

  const messages = useQuery({
    queryKey: qk.messages(conversationId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
          .limit(300),
      ),
  });

  const actions = useQuery({
    enabled: showActions,
    queryKey: qk.aiActions(conversationId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("ai_actions")
          .select("id, action_type, input, output, rule_checked, outcome, created_at, turn_id, agent, flagged")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
          .limit(300),
      ),
  });

  useRealtime({
    table: "messages",
    filter: `conversation_id=eq.${conversationId}`,
    invalidate: [qk.messages(conversationId), qk.aiActions(conversationId)],
  });
  useRealtime({
    table: "conversations",
    filter: `id=eq.${conversationId}`,
    invalidate: [qk.conversation(conversationId)],
  });

  const markRead = useRpc(async () => unwrap(await supabase.rpc("mark_conversation_read", { p_conversation: conversationId })), {
    silentError: true,
  });
  useEffect(() => {
    if (canCompose) markRead.mutate(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, canCompose, messages.data?.length]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = (messages.data ?? []).map((m) => ({ kind: "message", at: m.created_at, message: m }));
    if (showActions) {
      for (const a of actions.data ?? []) {
        if (!HIDDEN_ACTIONS.has(a.action_type)) items.push({ kind: "action", at: a.created_at, action: a });
      }
    }
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }, [messages.data, actions.data, showActions]);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [timeline.length]);

  if (conversation.isLoading || messages.isLoading) return <LoadingSkeleton rows={5} />;
  if (conversation.error || messages.error)
    return (
      <ErrorState
        error={conversation.error ?? messages.error}
        onRetry={() => {
          conversation.refetch();
          messages.refetch();
        }}
      />
    );

  const conv = conversation.data!;
  const contact = conv.contact as { name: string | null; phone_e164: string | null } | null;
  const windowOpen = !!conv.window_expires_at && new Date(conv.window_expires_at) > new Date();

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-lg border border-border bg-surface", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{contact?.name ?? "Buyer"}</p>
          <p className="text-xs text-muted-foreground tabular">{formatPhone(contact?.phone_e164)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ConsentTag status={consent.data?.status} />
          <Badge tone={windowOpen ? "success" : "neutral"}>
            <Clock aria-hidden />
            {windowOpen ? `Window open · closes ${timeAgo(conv.window_expires_at)}` : "Window closed"}
          </Badge>
          {conv.ai_paused ? (
            <Badge tone="warning">
              <Hand aria-hidden /> Human handling
            </Badge>
          ) : (
            <Badge tone="ai">
              <Bot aria-hidden /> AI active
            </Badge>
          )}
        </div>
      </div>

      {conv.ai_paused && conv.paused_reason && (
        <div className="flex items-start gap-2 border-b border-border bg-warning-soft px-4 py-2 text-xs text-warning">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            AI paused: {conv.paused_reason}. It stays silent until someone resumes it.
          </span>
        </div>
      )}

      <div className={cn("flex-1 overflow-y-auto px-4 py-4", height)} aria-live="polite">
        {timeline.length === 0 ? (
          <EmptyState title="No messages yet" description="The conversation starts when the buyer writes or a template is sent." />
        ) : (
          <ol className="grid gap-3">
            {timeline.map((item) =>
              item.kind === "message" ? (
                <MessageBubble key={item.message.id} message={item.message} />
              ) : (
                <ActionChip key={item.action.id} action={item.action} />
              ),
            )}
          </ol>
        )}
        <div ref={bottomRef} />
      </div>

      {canCompose && (
        <Composer
          conversationId={conversationId}
          windowOpen={windowOpen}
          aiPaused={conv.ai_paused}
          consentStatus={consent.data?.status ?? "none"}
        />
      )}
    </div>
  );
}

function MessageBubble({ message: m }: { message: Message }) {
  const inbound = m.direction === "inbound";
  const isAi = m.actor === "ai";
  const isSystem = m.actor === "system";
  const ActorIcon = inbound ? User : isAi ? Bot : isSystem ? FileText : User;
  const actorLabel = inbound ? "Buyer" : isAi ? "AI" : isSystem ? "System" : m.actor === "owner" ? "Owner" : "Rep";

  return (
    <li className={cn("flex", inbound ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
          inbound && "rounded-bl-sm bg-surface-muted",
          !inbound && isAi && "rounded-br-sm border border-ai/20 bg-ai-soft",
          !inbound && !isAi && !isSystem && "rounded-br-sm bg-primary-soft",
          isSystem && "rounded-br-sm border border-border bg-surface",
        )}
      >
        <div className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <ActorIcon className="size-3" aria-hidden />
          {actorLabel}
          {m.template_id && <span className="rounded bg-surface px-1">template</span>}
        </div>
        {m.media_path && <MediaLink path={m.media_path} type={m.media_type} filename={m.media_filename} />}
        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
          <time dateTime={m.created_at}>{formatDateTime(m.created_at)}</time>
          {!inbound && <DeliveryStatus status={m.status} error={m.error} />}
        </div>
      </div>
    </li>
  );
}

function DeliveryStatus({ status, error }: { status: string; error: string | null }) {
  switch (status) {
    case "queued":
      return <Clock className="size-3" aria-label="Queued" />;
    case "sent":
      return <Check className="size-3" aria-label="Sent" />;
    case "delivered":
      return <CheckCheck className="size-3" aria-label="Delivered" />;
    case "read":
      return <CheckCheck className="size-3 text-info" aria-label="Read" />;
    case "failed":
    case "blocked":
    case "cancelled":
      return (
        <span className="inline-flex items-center gap-0.5 text-danger" title={error ?? status}>
          <AlertCircle className="size-3" aria-hidden />
          {status}
        </span>
      );
    default:
      return null;
  }
}

function MediaLink({ path, type, filename }: { path: string; type: string | null; filename: string | null }) {
  const [busy, setBusy] = useState(false);
  const Icon = type === "image" ? ImageIcon : FileText;
  return (
    <button
      type="button"
      className="mb-1 flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-left text-xs hover:bg-surface-muted"
      onClick={async () => {
        setBusy(true);
        const url = await signedUrlForFullPath(path);
        setBusy(false);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }}
      disabled={busy}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{filename ?? path.split("/").pop()}</span>
    </button>
  );
}

function ActionChip({ action: a }: { action: AiAction }) {
  const out = (a.output ?? {}) as Record<string, unknown>;
  const tone =
    a.action_type === "validator_block" || a.outcome === "reject"
      ? "text-danger"
      : a.action_type === "escalate_to_human" || a.outcome === "needs_approval"
        ? "text-warning"
        : "text-muted-foreground";
  const detail =
    a.action_type === "propose_price" || a.action_type === "settle_and_quote"
      ? [out.decision, out.floor_paise ? `floor ₹${Number(out.floor_paise) / 100}` : null].filter(Boolean).join(" · ")
      : a.outcome;
  return (
    <li className="flex justify-center">
      <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-0.5 text-[11px]", tone)}>
        <Wrench className="size-3 shrink-0" aria-hidden />
        <span className="font-mono">{a.agent === "human" ? "human" : "ai"}.{a.action_type}</span>
        {detail ? <span className="truncate">→ {String(detail)}</span> : null}
        {a.rule_checked ? <span className="hidden truncate sm:inline">· rule: {a.rule_checked}</span> : null}
      </span>
    </li>
  );
}

function Composer({
  conversationId,
  windowOpen,
  aiPaused,
  consentStatus,
}: {
  conversationId: string;
  windowOpen: boolean;
  aiPaused: boolean;
  consentStatus: string;
}) {
  const supabase = getSupabaseBrowser();
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState("");
  const canMessage = consentStatus === "engaged" || consentStatus === "opted_in";

  const templates = useQuery({
    enabled: !windowOpen && canMessage,
    queryKey: qk.templates(),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("message_templates")
          .select("id, name, body, language, meta_status")
          .eq("meta_status", "approved")
          .order("name"),
      ),
  });

  const send = useRpc(
    async (vars: { body: string | null; template: string | null; key: string }) =>
      unwrap(
        await supabase.rpc("send_human_message", {
          p_conversation: conversationId,
          p_body: vars.body as string,
          p_idempotency_key: vars.key,
          p_template: vars.template as string,
        }),
      ),
    {
      invalidate: [qk.messages(conversationId), qk.conversation(conversationId)],
      onSuccess: () => {
        setBody("");
        setTemplateId("");
      },
    },
  );

  const togglePause = useRpc(
    async (pause: boolean) =>
      pause
        ? unwrap(await supabase.rpc("pause_ai", { p_conversation: conversationId, p_reason: "Taken over by a person" }))
        : unwrap(await supabase.rpc("resume_ai", { p_conversation: conversationId })),
    {
      invalidate: [qk.conversation(conversationId)],
      success: (_d, pause) => (pause ? "You have taken over. The AI is paused." : "Handed back to the AI"),
    },
  );

  return (
    <div className="grid gap-2 border-t border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {!canMessage
            ? consentStatus === "opted_out"
              ? "This contact opted out. No WhatsApp messages can be sent."
              : "No consent yet. Call the buyer or share a click to chat link."
            : windowOpen
              ? "Replies go out on WhatsApp through the consent gate."
              : "Outside the 24 hour window only approved templates can be sent."}
        </p>
        <Button
          size="sm"
          variant={aiPaused ? "default" : "outline"}
          loading={togglePause.isPending}
          onClick={() => togglePause.mutate(!aiPaused)}
        >
          {aiPaused ? <PlayCircle aria-hidden /> : <PauseCircle aria-hidden />}
          {aiPaused ? "Hand back to AI" : "Take over"}
        </Button>
      </div>
      {canMessage && windowOpen && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            send.mutate({ body: body.trim(), template: null, key: crypto.randomUUID() });
          }}
        >
          <Textarea
            aria-label="Message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a reply…"
            className="min-h-11 flex-1 resize-none"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <Button type="submit" size="icon" aria-label="Send message" loading={send.isPending} disabled={!body.trim()}>
            {!send.isPending && <Send aria-hidden />}
          </Button>
        </form>
      )}
      {canMessage && !windowOpen && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!templateId) return;
            send.mutate({ body: null, template: templateId, key: crypto.randomUUID() });
          }}
        >
          <NativeSelect
            aria-label="Approved template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="flex-1"
          >
            <option value="">Choose an approved template…</option>
            {(templates.data ?? []).map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name} ({tpl.language}) — {tpl.body.slice(0, 60)}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" loading={send.isPending} disabled={!templateId}>
            Send template
          </Button>
        </form>
      )}
    </div>
  );
}
