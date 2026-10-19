import type { Metadata } from "next";
import { ReordersView } from "@/components/rep/reorders-view";

export const metadata: Metadata = { title: "Reorders" };

export default function ReordersPage() {
  return <ReordersView />;
}
