import type { Metadata } from "next";
import { TemplatesView } from "@/components/system/templates-view";

export const metadata: Metadata = { title: "Templates" };

export default function Page() {
  return <TemplatesView />;
}
