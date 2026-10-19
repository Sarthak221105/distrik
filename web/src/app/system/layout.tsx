import type { ReactNode } from "react";
import { requireViewer } from "@/lib/viewer";
import { ViewerProvider } from "@/components/providers";
import { SystemShell } from "./system-shell";

// Restricted technical administration (platform maintenance only). It never
// shows manufacturer prospects, contacts or conversations.
export default async function SystemLayout({ children }: { children: ReactNode }) {
  const viewer = await requireViewer(["system_admin"]);
  return (
    <ViewerProvider viewer={viewer}>
      <SystemShell>{children}</SystemShell>
    </ViewerProvider>
  );
}
