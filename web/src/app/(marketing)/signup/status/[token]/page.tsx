import type { Metadata } from "next";
import { ApplicationStatusView } from "@/components/signup/application-status";

export const metadata: Metadata = { title: "Your application" };

export default async function ApplicationStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ApplicationStatusView token={token} />;
}
