import type { Metadata } from "next";
import { TodayView } from "@/components/rep/today-view";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return <TodayView />;
}
