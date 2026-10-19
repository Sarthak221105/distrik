"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import type { Viewer } from "@/lib/viewer";

const ViewerContext = createContext<Viewer | null>(null);

export function useViewer(): Viewer {
  const v = useContext(ViewerContext);
  if (!v) throw new Error("useViewer must be used inside a signed in layout");
  return v;
}

export function useOptionalViewer(): Viewer | null {
  return useContext(ViewerContext);
}

export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  return <ViewerContext value={viewer}>{children}</ViewerContext>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster richColors position="top-right" closeButton />
    </QueryClientProvider>
  );
}
