"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Copy, MessageCircle, X } from "lucide-react";
import { useViewer } from "@/components/providers";
import { ConsentTag } from "@/components/domain/badges";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/domain/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { reorderMessage, waLink } from "@/components/rep/helpers";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { unwrap } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { formatDate } from "@/lib/format";
import { useRpc } from "@/hooks/use-rpc";
import { useOnline } from "@/lib/offline/hooks";

type ContactLite = { name: string | null; phone_e164: string | null; is_primary: boolean; erased_at: string | null; consents: { status: string; channel: string }[] };

export function ReordersView() {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const online = useOnline();

  const list = useQuery({
    queryKey: qk.reorders(),
    queryFn: async () =>
      unwrap(
        await supabase
          .from("reorder_predictions")
          .select(
            "id, status, order_count, last_order_date, avg_gap_days, predicted_date, confidence, prospect:prospects(id, name, city, contacts(name, phone_e164, is_primary, erased_at, consents(status, channel))), product:products(name, unit)",
          )
          .in("status", ["due", "overdue"])
          .order("predicted_date", { ascending: true })
          .limit(200),
      ),
  });

  const dismiss = useRpc(async (id: string) => unwrap(await supabase.rpc("dismiss_reorder", { p_id: id })), {
    invalidate: [qk.reorders(), ["rep-today"]],
    success: "Dismissed. It will come back if a new order changes the prediction.",
  });

  if (list.isLoading) return <LoadingSkeleton rows={4} />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;

  const rows = (list.data ?? []).filter((r) => r.prospect);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock aria-hidden />}
        title="No reorders due"
        description="Accounts show up here a few days before their usual reorder date, based on their order history."
        action={
          <Button asChild variant="outline">
            <Link href="/rep/leads">Go to my leads</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {rows.length} account{rows.length === 1 ? "" : "s"} due or overdue. Send a friendly reminder before they reorder from someone else.
      </p>
      <ul className="grid gap-3">
        {rows.map((r) => {
          const p = r.prospect as unknown as { id: string; name: string; city: string | null; contacts: ContactLite[] };
          const product = r.product as { name: string; unit: string } | null;
          const contacts = (p.contacts ?? []).filter((c) => !c.erased_at);
          const contact = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null;
          const consent = contact?.consents?.find((c) => c.channel === "whatsapp")?.status ?? "none";
          const message = reorderMessage({
            contactName: contact?.name ?? p.name,
            productName: product?.name ?? "product",
            lastOrderDate: r.last_order_date,
            predictedDate: r.predicted_date,
            repName: viewer.fullName,
            manufacturerName: viewer.manufacturer?.name ?? null,
          });
          const wa = consent === "opted_out" ? null : waLink(contact?.phone_e164, message);
          const overdue = r.status === "overdue";
          return (
            <li key={r.id}>
              <Card className="grid gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="grid gap-0.5">
                    <Link href={`/rep/leads/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">{[p.city, product?.name].filter(Boolean).join(" · ")}</span>
                  </div>
                  <Badge tone={overdue ? "danger" : "warning"}>
                    <CalendarClock aria-hidden />
                    {overdue ? "Overdue" : "Due"}
                  </Badge>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Last order</dt>
                    <dd className="font-medium tabular">{formatDate(r.last_order_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Expected</dt>
                    <dd className="font-medium tabular">{formatDate(r.predicted_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Confidence</dt>
                    <dd className="font-medium tabular">
                      {Math.round(Number(r.confidence) * 100)}%{" "}
                      <span className="font-normal text-muted-foreground">({r.order_count} orders)</span>
                    </dd>
                  </div>
                </dl>
                <div className="grid gap-1">
                  <p className="text-xs font-medium text-muted-foreground">Suggested message</p>
                  <p className="rounded-lg bg-surface-muted p-3 text-sm">{message}</p>
                  {contact && <ConsentTag status={consent} className="w-fit" />}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {wa ? (
                    <Button asChild size="lg" variant="success">
                      <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`Send reorder reminder to ${p.name} on WhatsApp`}>
                        <MessageCircle aria-hidden /> WhatsApp
                      </a>
                    </Button>
                  ) : (
                    <Button size="lg" variant="success" disabled title={consent === "opted_out" ? "Opted out of WhatsApp" : "No phone on file"}>
                      <MessageCircle aria-hidden /> WhatsApp
                    </Button>
                  )}
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(message);
                        toast.success("Message copied");
                      } catch {
                        toast.error("Could not copy");
                      }
                    }}
                  >
                    <Copy aria-hidden /> Copy
                  </Button>
                  <Button
                    size="lg"
                    variant="ghost"
                    onClick={() => dismiss.mutate(r.id)}
                    loading={dismiss.isPending && dismiss.variables === r.id}
                    disabled={!online}
                    aria-label={`Dismiss reorder for ${p.name}`}
                  >
                    {!(dismiss.isPending && dismiss.variables === r.id) && <X aria-hidden />} Dismiss
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
