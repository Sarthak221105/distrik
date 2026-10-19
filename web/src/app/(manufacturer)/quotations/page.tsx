import { QuotationsClient } from "./quotations-client";
import { PoDetail } from "./po-detail";

export const metadata = { title: "Quotations & POs" };

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const po = typeof sp.po === "string" ? sp.po : undefined;
  const number = typeof sp.number === "string" ? sp.number : undefined;
  const tab = typeof sp.tab === "string" ? sp.tab : undefined;
  if (po) return <PoDetail poId={po} />;
  return <QuotationsClient initialNumber={number} initialTab={tab === "pos" ? "pos" : "quotations"} />;
}
