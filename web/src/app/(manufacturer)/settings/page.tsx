import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  return <SettingsClient initialTab={typeof sp.tab === "string" ? sp.tab : "team"} />;
}
