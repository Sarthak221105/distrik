import type { Metadata } from "next";
import { OfflineView } from "@/components/rep/offline-view";

export const metadata: Metadata = { title: "Offline" };

// Precached by the service worker and served when a page cannot load
// without a connection. Public (no session needed); reads only IndexedDB.
export default function OfflinePage() {
  return <OfflineView />;
}
