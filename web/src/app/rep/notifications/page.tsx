import type { Metadata } from "next";
import { NotificationsView } from "@/components/rep/notifications-view";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return <NotificationsView />;
}
