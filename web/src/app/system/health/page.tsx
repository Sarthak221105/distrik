import type { Metadata } from "next";
import { HealthView } from "@/components/system/health-view";

export const metadata: Metadata = { title: "Platform health" };

export default function Page() {
  return <HealthView />;
}
