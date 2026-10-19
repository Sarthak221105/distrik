"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CalendarClock, Hand, MessageCircle, Moon, Scale, Sparkles } from "lucide-react";
import { useViewer } from "@/components/providers";
import { ApprovalCard, APPROVAL_SELECT, type ApprovalWithJoins } from "@/components/domain/approval-card";
import { EmptyState } from "@/components/domain/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LeadRow, RepSection, SectionEmpty } from "@/components/rep/rep-ui";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { formatDate, formatINR, timeAgo } from "@/lib/format";
import { useRealtime } from "@/hooks/use-realtime";

const TODAY = ["rep-today"] as const;

type ProspectLite = { id: string; name: string; city: string | null; stage: string } | null;

/**
 * Today: the rep's work ordered by urgency. RLS limits a rep to assigned
 * prospects, so the same queries serve owners and sales heads (tenant wide).
 */
export function TodayView() {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const isManager = viewer.role === "owner" || viewer.role === "sales_head";

  const escalated = useQuery({
    queryKey: [...TODAY, "escalated"],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("conversations")
          .select("id, prospect_id, paused_reason, paused_at, last_message_preview, unread_count, prospect:prospects(id, name, city, stage)")
          .eq("ai_paused", true)
          .order("paused_at", { ascending: false, nullsFirst: false })
          .limit(25),
      ),
  });

  const replies = useQuery({
    queryKey: [...TODAY, "replies"],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("conversations")
          .select("id, prospect_id, ai_paused, last_message_preview, last_inbound_at, unread_count, prospect:prospects(id, name, city, stage)")
          .gt("unread_count", 0)
          .order("last_inbound_at", { ascending: false, nullsFirst: false })
          .limit(25),
      ),
  });

  const qualified = useQuery({
    queryKey: [...TODAY, "qualified"],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("prospects")
          .select("id, name, city, stage, fit_score, stage_changed_at")
          .eq("stage", "qualified")
          .order("stage_changed_at", { ascending: true })
          .limit(25),
      ),
  });

  const stale = useQuery({
    queryKey: [...TODAY, "stale"],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("prospects")
          .select("id, name, city, stage, stage_changed_at")
          .eq("is_stale", true)
          .neq("stage", "lost")
          .order("stage_changed_at", { ascending: true })
          .limit(25),
      ),
  });

  const approvals = useQuery({
    enabled: isManager,
    queryKey: [...TODAY, "approvals"],
    queryFn: async () => {
      const rows = unwrap(
        await supabase.from("human_approvals").select(APPROVAL_SELECT).eq("status", "pending").order("expires_at").limit(25),
      ) as unknown as ApprovalWithJoins[];
      const limit = viewer.role === "sales_head" ? viewer.approvalLimitPaise : null;
      return limit === null ? rows : rows.filter((a) => (a.deal_value_paise ?? 0) <= limit);
    },
  });

  const reorders = useQuery({
    queryKey: [...TODAY, "reorders"],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("reorder_predictions")
          .select("id, status, predicted_date, last_order_date, confidence, prospect:prospects(id, name, city, stage), product:products(name)")
          .in("status", ["due", "overdue"])
          .order("predicted_date", { ascending: true })
          .limit(25),
      ),
  });

  useRealtime({ table: "conversations", invalidate: [TODAY] });
  useRealtime({ table: "human_approvals", invalidate: [TODAY], enabled: isManager });
  useRealtime({ table: "notifications", filter: `user_id=eq.${viewer.userId}`, event: "INSERT", invalidate: [TODAY] });

  const escalatedRows = (escalated.data ?? []).filter((c) => c.prospect);
  const replyRows = (replies.data ?? []).filter((c) => c.prospect && !c.ai_paused);
  const approvalRows = approvals.data ?? [];
  const reorderRows = (reorders.data ?? []).filter((r) => r.prospect);

  const loading =
    escalated.isLoading || replies.isLoading || qualified.isLoading || stale.isLoading || reorders.isLoading || (isManager && approvals.isLoading);
  const anyError = escalated.error || replies.error || qualified.error || stale.error || reorders.error || approvals.error;
  const total =
    escalatedRows.length + replyRows.length + (qualified.data?.length ?? 0) + (stale.data?.length ?? 0) + approvalRows.length + reorderRows.length;

  const chips = [
    { id: "escalated", label: "Escalated", n: escalatedRows.length },
    ...(isManager ? [{ id: "approvals", label: "Approvals", n: approvalRows.length }] : []),
    { id: "replies", label: "New replies", n: replyRows.length },
    { id: "qualified", label: "Qualified", n: qualified.data?.length ?? 0 },
    { id: "reorders", label: "Reorders", n: reorderRows.length },
    { id: "stale", label: "Stale", n: stale.data?.length ?? 0 },
  ];

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">
          Namaste{viewer.fullName ? `, ${viewer.fullName.split(" ")[0]}` : ""}. Most urgent first.
        </p>
        {!loading && (
          <nav aria-label="Jump to section" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {chips.map((c) => (
              <a
                key={c.id}
                href={`#${c.id}`}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium"
              >
                {c.label}
                <span className="tabular text-muted-foreground">{c.n}</span>
              </a>
            ))}
          </nav>
        )}
      </div>

      {!loading && !anyError && total === 0 && (
        <EmptyState
          icon={<BadgeCheck aria-hidden />}
          title="You are all caught up"
          description="No escalations, replies, approvals or reorders need you right now. New ones appear here instantly."
          action={
            <Button asChild variant="outline">
              <Link href="/rep/leads">Browse my leads</Link>
            </Button>
          }
        />
      )}

      <RepSection
        id="escalated"
        title="Escalated to you"
        icon={<Hand />}
        tone="urgent"
        count={escalatedRows.length}
        description="The AI paused and handed these conversations to a person."
        isLoading={escalated.isLoading}
        error={escalated.error}
        onRetry={() => escalated.refetch()}
      >
        {escalatedRows.length === 0 ? (
          <SectionEmpty>No escalated conversations.</SectionEmpty>
        ) : (
          <ul className="grid gap-2">
            {escalatedRows.map((c) => {
              const p = c.prospect as ProspectLite;
              return (
                <LeadRow
                  key={c.id}
                  href={`/rep/leads/${p!.id}`}
                  name={p!.name}
                  city={p!.city}
                  stage={p!.stage}
                  meta={c.paused_at ? `paused ${timeAgo(c.paused_at)}` : undefined}
                  badge={
                    <Badge tone="warning">
                      <Hand aria-hidden /> Needs you
                    </Badge>
                  }
                  detail={c.paused_reason ? `Reason: ${c.paused_reason}` : c.last_message_preview}
                />
              );
            })}
          </ul>
        )}
      </RepSection>

      {isManager && (
        <RepSection
          id="approvals"
          title="Approvals within your limit"
          icon={<Scale />}
          count={approvalRows.length}
          description={
            viewer.role === "sales_head" && viewer.approvalLimitPaise !== null
              ? `Deals up to ${formatINR(viewer.approvalLimitPaise, { whole: true })}.`
              : "Every pending approval for your company."
          }
          isLoading={approvals.isLoading}
          error={approvals.error}
          onRetry={() => approvals.refetch()}
        >
          {approvalRows.length === 0 ? (
            <SectionEmpty>No approvals waiting.</SectionEmpty>
          ) : (
            <div className="grid gap-3">
              {approvalRows.map((a) => (
                <ApprovalCard key={a.id} approval={a} compact />
              ))}
            </div>
          )}
        </RepSection>
      )}

      <RepSection
        id="replies"
        title="New replies"
        icon={<MessageCircle />}
        count={replyRows.length}
        isLoading={replies.isLoading}
        error={replies.error}
        onRetry={() => replies.refetch()}
      >
        {replyRows.length === 0 ? (
          <SectionEmpty>No unread replies on your leads.</SectionEmpty>
        ) : (
          <ul className="grid gap-2">
            {replyRows.map((c) => {
              const p = c.prospect as ProspectLite;
              return (
                <LeadRow
                  key={c.id}
                  href={`/rep/leads/${p!.id}`}
                  name={p!.name}
                  city={p!.city}
                  stage={p!.stage}
                  meta={c.last_inbound_at ? timeAgo(c.last_inbound_at) : undefined}
                  badge={<Badge tone="info">{c.unread_count} unread</Badge>}
                  detail={c.last_message_preview}
                />
              );
            })}
          </ul>
        )}
      </RepSection>

      <RepSection
        id="qualified"
        title="Qualified leads"
        icon={<Sparkles />}
        count={qualified.data?.length}
        description="Ready for a call or a quotation."
        isLoading={qualified.isLoading}
        error={qualified.error}
        onRetry={() => qualified.refetch()}
      >
        {(qualified.data ?? []).length === 0 ? (
          <SectionEmpty>No qualified leads waiting.</SectionEmpty>
        ) : (
          <ul className="grid gap-2">
            {qualified.data!.map((p) => (
              <LeadRow
                key={p.id}
                href={`/rep/leads/${p.id}`}
                name={p.name}
                city={p.city}
                stage={p.stage}
                meta={`qualified ${timeAgo(p.stage_changed_at)}`}
              />
            ))}
          </ul>
        )}
      </RepSection>

      <RepSection
        id="reorders"
        title="Reorders due"
        icon={<CalendarClock />}
        count={reorderRows.length}
        isLoading={reorders.isLoading}
        error={reorders.error}
        onRetry={() => reorders.refetch()}
      >
        {reorderRows.length === 0 ? (
          <SectionEmpty>No accounts due for a reorder.</SectionEmpty>
        ) : (
          <>
            <ul className="grid gap-2">
              {reorderRows.slice(0, 5).map((r) => {
                const p = r.prospect as ProspectLite;
                const product = r.product as { name: string } | null;
                return (
                  <LeadRow
                    key={r.id}
                    href={`/rep/leads/${p!.id}`}
                    name={p!.name}
                    city={p!.city}
                    badge={<Badge tone={r.status === "overdue" ? "danger" : "warning"}>{r.status === "overdue" ? "Overdue" : "Due"}</Badge>}
                    detail={`${product?.name ?? "Product"} · expected ${formatDate(r.predicted_date)}`}
                  />
                );
              })}
            </ul>
            {reorderRows.length > 5 && (
              <Link href="/rep/reorders" className="text-sm font-medium text-primary hover:underline">
                See all {reorderRows.length} reorders
              </Link>
            )}
          </>
        )}
      </RepSection>

      <RepSection
        id="stale"
        title="Stale leads"
        icon={<Moon />}
        count={stale.data?.length}
        description="Follow ups ran out with no reply. Try a call."
        isLoading={stale.isLoading}
        error={stale.error}
        onRetry={() => stale.refetch()}
      >
        {(stale.data ?? []).length === 0 ? (
          <SectionEmpty>No stale leads.</SectionEmpty>
        ) : (
          <ul className="grid gap-2">
            {stale.data!.map((p) => (
              <LeadRow
                key={p.id}
                href={`/rep/leads/${p.id}`}
                name={p.name}
                city={p.city}
                stage={p.stage}
                meta={`no movement ${timeAgo(p.stage_changed_at)}`}
              />
            ))}
          </ul>
        )}
      </RepSection>
    </div>
  );
}
