"use client";

import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { BadgeCheck, Info } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatINR } from "@/lib/format";
import { useRealtime } from "@/hooks/use-realtime";
import { useViewer } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApprovalCard, APPROVAL_SELECT, type ApprovalWithJoins } from "@/components/domain/approval-card";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { trackEvent, useTrackScreen } from "@/components/manufacturer/hooks";
import { cn } from "@/lib/utils";

const PAGE = 20;
const DECIDED: ("approved" | "rejected" | "countered" | "expired")[] = ["approved", "rejected", "countered", "expired"];

export function ApprovalsClient({ focusId }: { focusId?: string }) {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  useTrackScreen("approvals");
  const [tab, setTab] = useState("pending");
  const [highlight, setHighlight] = useState<Set<string>>(() => new Set(focusId ? [focusId] : []));
  const tracked = useRef(new Set<string>());

  const pending = useQuery({
    queryKey: qk.approvals("pending"),
    queryFn: async () =>
      (unwrap(
        await supabase
          .from("human_approvals")
          .select(APPROVAL_SELECT)
          .eq("status", "pending")
          .order("expires_at", { ascending: true })
          .limit(200),
      ) ?? []) as unknown as ApprovalWithJoins[],
  });

  const decided = useInfiniteQuery({
    queryKey: qk.approvals("decided"),
    enabled: tab === "decided",
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      (unwrap(
        await supabase
          .from("human_approvals")
          .select(APPROVAL_SELECT)
          .in("status", DECIDED)
          .order("created_at", { ascending: false })
          .range(pageParam, pageParam + PAGE - 1),
      ) ?? []) as unknown as ApprovalWithJoins[],
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });

  // A deep linked approval that is no longer pending still opens.
  const focused = useQuery({
    queryKey: qk.approval(focusId ?? "none"),
    enabled: !!focusId && !!pending.data && !pending.data.some((a) => a.id === focusId),
    queryFn: async () =>
      unwrap(await supabase.from("human_approvals").select(APPROVAL_SELECT).eq("id", focusId!).maybeSingle()) as unknown as
        | ApprovalWithJoins
        | null,
  });

  useRealtime({
    table: "human_approvals",
    invalidate: [qk.approvals("pending"), qk.approvals("decided")],
    onChange: (payload) => {
      const row = payload.new as Partial<ApprovalWithJoins> | undefined;
      if (!row?.id) return;
      const id = row.id;
      if (payload.eventType === "INSERT") {
        setHighlight((s) => new Set(s).add(id));
        setTimeout(
          () =>
            setHighlight((s) => {
              const n = new Set(s);
              n.delete(id);
              return n;
            }),
          4000,
        );
      }
      if (row.decided_by === viewer.userId && row.status && row.status !== "pending" && !tracked.current.has(id)) {
        tracked.current.add(id);
        void trackEvent(viewer, "approval_decided", { approval_id: id, status: row.status, kind: row.kind });
      }
    },
  });

  // Scroll the deep linked approval into view once it renders, then fade the highlight.
  const scrolled = useRef(false);
  useEffect(() => {
    if (!focusId || scrolled.current) return;
    if (!pending.data && !focused.data) return;
    const el = document.getElementById(`approval-${focusId}`);
    if (el) {
      scrolled.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
      const timer = setTimeout(
        () =>
          setHighlight((s) => {
            const n = new Set(s);
            n.delete(focusId);
            return n;
          }),
        5000,
      );
      return () => clearTimeout(timer);
    }
  }, [focusId, pending.data, focused.data]);

  const isHead = viewer.role === "sales_head";
  const decidedRows = decided.data?.pages.flat() ?? [];

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Approval queue"
        description="Decisions the AI could not make inside your rules. The buyer conversation resumes automatically after you decide."
      />

      {isHead && (
        <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <p>
            Your approval limit is{" "}
            <strong className="tabular">
              {viewer.approvalLimitPaise === null ? "unlimited" : formatINR(viewer.approvalLimitPaise, { whole: true })}
            </strong>{" "}
            of deal value. Larger deals need the owner.
          </p>
        </div>
      )}

      {focused.data && (
        <section aria-label="Linked approval" className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">Opened from a link</p>
          <div
            id={`approval-${focused.data.id}`}
            tabIndex={-1}
            className={cn("rounded-lg transition-shadow", highlight.has(focused.data.id) && "ring-2 ring-accent ring-offset-2")}
          >
            <ApprovalCard approval={focused.data} />
          </div>
        </section>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Approval status">
          <TabsTrigger value="pending">
            Pending
            {pending.data && pending.data.length > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{pending.data.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="decided">Decided</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {pending.isLoading ? (
            <LoadingSkeleton rows={3} />
          ) : pending.error ? (
            <ErrorState error={pending.error} onRetry={() => pending.refetch()} />
          ) : pending.data!.length === 0 ? (
            <EmptyState
              icon={<BadgeCheck aria-hidden />}
              title="You're all caught up"
              description="New requests appear here within seconds of the AI asking. You will also get a notification."
            />
          ) : (
            <ul className="grid gap-4" aria-live="polite">
              {pending.data!.map((a) => (
                <li
                  key={a.id}
                  id={`approval-${a.id}`}
                  tabIndex={-1}
                  className={cn(
                    "rounded-lg transition-shadow duration-700",
                    highlight.has(a.id) && "ring-2 ring-accent ring-offset-2 ring-offset-background",
                  )}
                >
                  {highlight.has(a.id) && <span className="sr-only">New or linked approval</span>}
                  <ApprovalCard approval={a} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="decided">
          {decided.isLoading ? (
            <LoadingSkeleton rows={3} />
          ) : decided.error ? (
            <ErrorState error={decided.error} onRetry={() => decided.refetch()} />
          ) : decidedRows.length === 0 ? (
            <EmptyState title="No decided approvals yet" description="Approved, rejected, countered and expired requests are kept here." />
          ) : (
            <div className="grid gap-4">
              <ul className="grid gap-4">
                {decidedRows.map((a) => (
                  <li key={a.id}>
                    <ApprovalCard approval={a} compact />
                  </li>
                ))}
              </ul>
              {decided.hasNextPage && (
                <Button
                  variant="outline"
                  className="justify-self-center"
                  loading={decided.isFetchingNextPage}
                  onClick={() => decided.fetchNextPage()}
                >
                  Load more
                </Button>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
