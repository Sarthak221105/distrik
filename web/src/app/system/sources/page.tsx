import type { Metadata } from "next";
import { SourcesView } from "@/components/system/sources-view";

export const metadata: Metadata = { title: "Data sources" };

export default function Page() {
  return <SourcesView />;
}
