import type { ReactNode } from "react";
import { requireViewer } from "@/lib/viewer";
import { ViewerProvider } from "@/components/providers";
import { RepShell } from "@/components/rep/rep-shell";

export default async function RepLayout({ children }: { children: ReactNode }) {
  const viewer = await requireViewer(["rep", "owner", "sales_head"]);
  return (
    <ViewerProvider viewer={viewer}>
      <RepShell>{children}</RepShell>
    </ViewerProvider>
  );
}
