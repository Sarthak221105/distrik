import type { Metadata } from "next";
import { ApplicationsView } from "@/components/system/applications-view";

export const metadata: Metadata = { title: "Applications" };

export default function Page() {
  return <ApplicationsView />;
}
