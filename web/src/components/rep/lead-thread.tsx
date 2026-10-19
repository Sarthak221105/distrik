"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, CloudOff, FileText, User } from "lucide-react";
import { useViewer } from "@/components/providers";
import { ConversationThread } from "@/components/domain/conversation-thread";
import { EmptyState } from "@/components/domain/states";
import { Textarea } from "@/components/ui/input";
import { qk } from "@/lib/query-keys";
import { formatDateTime, timeAgo } from "@/lib/format";
import { getThreadSnapshot, saveThreadSnapshot } from "@/lib/offline/cache";
import { useDexieQuery, useOnline } from "@/lib/offline/hooks";
import type { CachedMessage, ThreadSnapshot } from "@/lib/offline/types";
import { cn } from "@/lib/utils";

/**
 * Online: the shared ConversationThread (pause/resume AI, consent and window
 * aware composer) and the last messages are mirrored to IndexedDB.
 * Offline: the last cached messages, read only; sending needs a connection.
 */
export function LeadThread({ conversationId, prospectId }: { conversationId: string; prospectId: string }) {
  const online = useOnline();
  return online ? (
    <>
      <ThreadSnapshotSaver conversationId={conversationId} prospectId={prospectId} />
      <ConversationThread conversationId={conversationId} canCompose height="h-[min(60vh,520px)]" />
    </>
  ) : (
    <OfflineThread conversationId={conversationId} />
  );
}

function ThreadSnapshotSaver({ conversationId, prospectId }: { conversationId: string; prospectId: string }) {
  const qc = useQueryClient();
  const viewer = useViewer();
  useEffect(() => {
    const key = JSON.stringify(qk.messages(conversationId));
    const save = (data: unknown) => {
      if (Array.isArray(data)) void saveThreadSnapshot(viewer.userId, prospectId, conversationId, data as CachedMessage[]);
    };
    save(qc.getQueryData(qk.messages(conversationId)));
    const unsub = qc.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && JSON.stringify(event.query.queryKey) === key && event.query.state.status === "success") {
        save(event.query.state.data);
      }
    });
    return unsub;
  }, [qc, conversationId, prospectId, viewer.userId]);
  return null;
}

function OfflineThread({ conversationId }: { conversationId: string }) {
  const viewer = useViewer();
  const snap = useDexieQuery<ThreadSnapshot | null | undefined>(
    () => getThreadSnapshot(viewer.userId, conversationId),
    [viewer.userId, conversationId],
    undefined,
  );

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border bg-warning-soft px-4 py-2 text-xs text-warning" role="status">
        <CloudOff className="size-3.5" aria-hidden />
        {snap ? `Offline copy from ${timeAgo(new Date(snap.savedAt))}. New messages appear when you reconnect.` : "You are offline."}
      </div>
      <div className="h-[min(55vh,480px)] overflow-y-auto px-4 py-4">
        {snap === undefined ? null : !snap || snap.messages.length === 0 ? (
          <EmptyState
            title="No saved messages"
            description="Only the last conversation you opened online is kept on this phone."
          />
        ) : (
          <ol className="grid gap-3">
            {snap.messages.map((m) => (
              <CachedBubble key={m.id} m={m} />
            ))}
          </ol>
        )}
      </div>
      <div className="grid gap-2 border-t border-border p-3">
        <Textarea aria-label="Message" disabled placeholder="Sending needs a connection" rows={2} className="min-h-11 resize-none" />
        <p className="text-xs text-muted-foreground">Sending needs a connection. Call logs, notes and stage changes still work offline.</p>
      </div>
    </div>
  );
}

function CachedBubble({ m }: { m: CachedMessage }) {
  const inbound = m.direction === "inbound";
  const isAi = m.actor === "ai";
  const Icon = inbound ? User : isAi ? Bot : m.actor === "system" ? FileText : User;
  const label = inbound ? "Buyer" : isAi ? "AI" : m.actor === "system" ? "System" : m.actor === "owner" ? "Owner" : "Rep";
  return (
    <li className={cn("flex", inbound ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
          inbound ? "rounded-bl-sm bg-surface-muted" : isAi ? "rounded-br-sm border border-ai/20 bg-ai-soft" : "rounded-br-sm bg-primary-soft",
        )}
      >
        <div className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Icon className="size-3" aria-hidden />
          {label}
        </div>
        {m.media_filename && <p className="text-xs text-muted-foreground">Attachment: {m.media_filename}</p>}
        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
        <p className="mt-1 text-right text-[11px] text-muted-foreground">
          <time dateTime={m.created_at}>{formatDateTime(m.created_at)}</time>
        </p>
      </div>
    </li>
  );
}
