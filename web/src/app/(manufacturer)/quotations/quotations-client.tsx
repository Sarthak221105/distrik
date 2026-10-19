"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileText, Search, Upload } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import { formatDate, formatINR, timeAgo } from "@/lib/format";
import { useRealtime } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchStatusBadge, StatusBadge } from "@/components/domain/badges";
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from "@/components/domain/states";
import { OpenPdfButton } from "@/components/manufacturer/quotation-preview";
import { UploadPoDialog } from "@/components/manufacturer/upload-po-dialog";
import { unwrapList, useTrackScreen } from "@/components/manufacturer/hooks";

const PAGE = 50;

type QRow = {
  id: string;
  number: string;
  version: number;
  status: string;
  total_paise: number;
  valid_until: string;
  sent_at: string | null;
  created_at: string;
  pdf_path: string | null;
  prospect: { id: string; name: string; city: string | null } | null;
};

type PoRow = {
  id: string;
  created_at: string;
  match_status: string;
  status: string;
  parsed: Record<string, unknown> | null;
  diffs: unknown[];
  prospect: { id: string; name: string } | null;
  quotation: { number: string; version: number; total_paise: number } | null;
};

export function QuotationsClient({ initialNumber, initialTab }: { initialNumber?: string; initialTab: "quotations" | "pos" }) {
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  useTrackScreen("quotations");
  const [tab, setTab] = useState(initialTab);
  const [search, setSearch] = useState(initialNumber ?? "");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialNumber ? [initialNumber] : []));
  const [uploadOpen, setUploadOpen] = useState(false);

  const quotes = useInfiniteQuery({
    queryKey: qk.quotations({ view: "list" }),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrapList(
        await supabase
          .from("quotations")
          .select("id, number, version, status, total_paise, valid_until, sent_at, created_at, pdf_path, prospect:prospects(id, name, city)")
          .order("created_at", { ascending: false })
          .range(pageParam, pageParam + PAGE - 1),
      ) as unknown as QRow[],
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });

  const pos = useInfiniteQuery({
    queryKey: qk.purchaseOrders({ view: "list" }),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrapList(
        await supabase
          .from("purchase_orders")
          .select("id, created_at, match_status, status, parsed, diffs, prospect:prospects(id, name), quotation:quotations(number, version, total_paise)")
          .order("created_at", { ascending: false })
          .range(pageParam, pageParam + PAGE - 1),
      ) as unknown as PoRow[],
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });

  useRealtime({ table: "quotations", invalidate: [qk.quotations()] });
  useRealtime({ table: "purchase_orders", invalidate: [qk.purchaseOrders()] });

  // Group versions under their quotation number; the newest version leads.
  const groups = useMemo(() => {
    const rows = quotes.data?.pages.flat() ?? [];
    const m = new Map<string, QRow[]>();
    for (const r of rows) {
      if (!m.has(r.number)) m.set(r.number, []);
      m.get(r.number)!.push(r);
    }
    const term = search.trim().toLowerCase();
    return Array.from(m.entries())
      .map(([number, versions]) => ({ number, versions: versions.sort((a, b) => b.version - a.version) }))
      .filter((g) => !term || g.number.toLowerCase().includes(term) || (g.versions[0]!.prospect?.name ?? "").toLowerCase().includes(term));
  }, [quotes.data, search]);

  const poRows = pos.data?.pages.flat() ?? [];
  const attention = poRows.filter((p) => p.status !== "confirmed" && p.match_status !== "pending").length;

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Quotations & purchase orders"
        description="Every quotation version, and each PO checked against its quotation before it becomes an order."
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload aria-hidden /> Upload PO
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList aria-label="Documents">
          <TabsTrigger value="quotations">Quotations</TabsTrigger>
          <TabsTrigger value="pos">
            Purchase orders
            {attention > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{attention}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quotations" className="grid gap-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input
              aria-label="Search quotations by number or buyer"
              placeholder="Search number or buyer"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {quotes.isLoading ? (
            <LoadingSkeleton variant="table" rows={6} />
          ) : quotes.error ? (
            <ErrorState error={quotes.error} onRetry={() => quotes.refetch()} />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={<FileText aria-hidden />}
              title={search ? "No quotation matches" : "No quotations yet"}
              description={search ? "Try another number or buyer name." : "Quotations are generated when a negotiation settles inside your rules or an approval is granted."}
            />
          ) : (
            <Card>
              <Table>
                <caption className="sr-only">Quotations</caption>
                <THead>
                  <TR>
                    <TH scope="col" className="w-8"><span className="sr-only">Versions</span></TH>
                    <TH scope="col">Number</TH>
                    <TH scope="col">Version</TH>
                    <TH scope="col">Buyer</TH>
                    <TH scope="col" className="text-right">Total</TH>
                    <TH scope="col">Status</TH>
                    <TH scope="col">Valid until</TH>
                    <TH scope="col">Sent</TH>
                    <TH scope="col"><span className="sr-only">PDF</span></TH>
                  </TR>
                </THead>
                <TBody>
                  {groups.map((g) => {
                    const latest = g.versions[0]!;
                    const open = expanded.has(g.number);
                    const older = g.versions.slice(1);
                    return (
                      <Fragment key={g.number}>
                        <TR>
                          <TD>
                            {older.length > 0 && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                aria-expanded={open}
                                aria-label={`${open ? "Hide" : "Show"} ${older.length} older version${older.length === 1 ? "" : "s"} of ${g.number}`}
                                onClick={() =>
                                  setExpanded((s) => {
                                    const n = new Set(s);
                                    if (n.has(g.number)) n.delete(g.number);
                                    else n.add(g.number);
                                    return n;
                                  })
                                }
                              >
                                {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                              </Button>
                            )}
                          </TD>
                          <TD className="font-medium tabular">{g.number}</TD>
                          <TD className="tabular">
                            v{latest.version}
                            {older.length > 0 && <span className="text-xs text-muted-foreground"> of {g.versions.length}</span>}
                          </TD>
                          <TD>
                            {latest.prospect ? (
                              <Link href={`/prospects/${latest.prospect.id}`} className="hover:underline">{latest.prospect.name}</Link>
                            ) : "–"}
                          </TD>
                          <TD className="text-right tabular">{formatINR(latest.total_paise)}</TD>
                          <TD><StatusBadge status={latest.status} /></TD>
                          <TD className="whitespace-nowrap">{formatDate(latest.valid_until)}</TD>
                          <TD className="whitespace-nowrap text-muted-foreground">{latest.sent_at ? formatDate(latest.sent_at) : "–"}</TD>
                          <TD><OpenPdfButton pdfPath={latest.pdf_path} /></TD>
                        </TR>
                        {open &&
                          older.map((v) => (
                            <TR key={v.id} className="bg-surface-muted/40 text-muted-foreground">
                              <TD />
                              <TD className="pl-6 text-xs">↳ older</TD>
                              <TD className="tabular">v{v.version}</TD>
                              <TD />
                              <TD className="text-right tabular">{formatINR(v.total_paise)}</TD>
                              <TD><StatusBadge status={v.status} /></TD>
                              <TD className="whitespace-nowrap">{formatDate(v.valid_until)}</TD>
                              <TD className="whitespace-nowrap">{v.sent_at ? formatDate(v.sent_at) : "–"}</TD>
                              <TD><OpenPdfButton pdfPath={v.pdf_path} label={`v${v.version}`} /></TD>
                            </TR>
                          ))}
                      </Fragment>
                    );
                  })}
                </TBody>
              </Table>
              {quotes.hasNextPage && (
                <div className="flex justify-center border-t border-border p-3">
                  <Button variant="outline" loading={quotes.isFetchingNextPage} onClick={() => quotes.fetchNextPage()}>Load more</Button>
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pos">
          {pos.isLoading ? (
            <LoadingSkeleton variant="table" rows={5} />
          ) : pos.error ? (
            <ErrorState error={pos.error} onRetry={() => pos.refetch()} />
          ) : poRows.length === 0 ? (
            <EmptyState
              icon={<FileText aria-hidden />}
              title="No purchase orders yet"
              description="POs arrive on WhatsApp or you can upload one. Each is read by the AI and matched to the quotation."
              action={<Button onClick={() => setUploadOpen(true)}><Upload aria-hidden /> Upload PO</Button>}
            />
          ) : (
            <Card>
              <Table>
                <caption className="sr-only">Purchase orders</caption>
                <THead>
                  <TR>
                    <TH scope="col">PO</TH>
                    <TH scope="col">Buyer</TH>
                    <TH scope="col">Quotation</TH>
                    <TH scope="col" className="text-right">PO total</TH>
                    <TH scope="col">Match</TH>
                    <TH scope="col">Status</TH>
                    <TH scope="col">Received</TH>
                    <TH scope="col"><span className="sr-only">Open</span></TH>
                  </TR>
                </THead>
                <TBody>
                  {poRows.map((po) => (
                    <TR key={po.id} className="cursor-pointer" onClick={() => router.push(`/quotations?po=${po.id}`)}>
                      <TD className="font-medium">{String(po.parsed?.po_number ?? "Reading…")}</TD>
                      <TD>{po.prospect?.name ?? "–"}</TD>
                      <TD className="tabular">{po.quotation ? `${po.quotation.number} v${po.quotation.version}` : "–"}</TD>
                      <TD className="text-right tabular">{po.parsed?.total_paise != null ? formatINR(Number(po.parsed.total_paise)) : "–"}</TD>
                      <TD>
                        <MatchStatusBadge status={po.match_status} />
                        {Array.isArray(po.diffs) && po.diffs.length > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">{po.diffs.length} diff</span>
                        )}
                      </TD>
                      <TD><StatusBadge status={po.status} /></TD>
                      <TD className="whitespace-nowrap text-muted-foreground">{timeAgo(po.created_at)}</TD>
                      <TD>
                        <Button asChild size="sm" variant="link" onClick={(e) => e.stopPropagation()}>
                          <Link href={`/quotations?po=${po.id}`}>Review</Link>
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {pos.hasNextPage && (
                <div className="flex justify-center border-t border-border p-3">
                  <Button variant="outline" loading={pos.isFetchingNextPage} onClick={() => pos.fetchNextPage()}>Load more</Button>
                </div>
              )}
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <UploadPoDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={(id) => router.push(`/quotations?po=${id}`)} />
    </div>
  );
}
