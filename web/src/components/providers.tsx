"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { getSupabaseBrowser } from "@/lib/supabase/client";
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

  useEffect(() => {
    // If the browser lands on "/" or "/login" with an access_token in the URL hash (from Supabase auth redirect),
    // listen for the session and route straight to /dashboard!
    if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
      const supabase = getSupabaseBrowser();
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session && (window.location.pathname === "/" || window.location.pathname === "/login")) {
          window.location.href = "/dashboard";
        }
      });
      return () => subscription.unsubscribe();
    }
  }, []);

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster richColors position="top-right" closeButton />
    </QueryClientProvider>
  );
}
