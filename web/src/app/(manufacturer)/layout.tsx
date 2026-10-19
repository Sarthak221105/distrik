import type { ReactNode } from "react";
import { requireViewer } from "@/lib/viewer";
import { ViewerProvider } from "@/components/providers";
import { ManufacturerShell } from "./manufacturer-shell";

export default async function ManufacturerLayout({ children }: { children: ReactNode }) {
  const viewer = await requireViewer(["owner", "sales_head"]);
  return (
    <ViewerProvider viewer={viewer}>
      <ManufacturerShell>{children}</ManufacturerShell>
    </ViewerProvider>
  );
}
