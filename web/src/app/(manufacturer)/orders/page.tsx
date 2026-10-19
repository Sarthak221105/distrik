import { OrdersClient } from "./orders-client";

export const metadata = { title: "Orders" };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  return <OrdersClient initialOrderId={typeof sp.id === "string" ? sp.id : undefined} />;
}
