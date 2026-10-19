import { RulesClient } from "./rules-client";

export const metadata = { title: "Commercial rules" };

export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  return <RulesClient initialProductId={typeof sp.product === "string" ? sp.product : undefined} />;
}
