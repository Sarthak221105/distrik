"use client";

import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";

type Options = {
  table: string;
  filter?: string;
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  invalidate?: QueryKey[];
  onChange?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  enabled?: boolean;
};

// Realtime pushes row changes (RLS applies); each event updates the query
// cache instead of refetching whole pages.
export function useRealtime({ table, filter, event = "*", invalidate = [], onChange, enabled = true }: Options) {
  const qc = useQueryClient();
  const onChangeRef = useRef(onChange);
  const invalidateRef = useRef(invalidate);
  useEffect(() => {
    onChangeRef.current = onChange;
    invalidateRef.current = invalidate;
  });

  useEffect(() => {
    if (!enabled) return;
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`rt:${table}:${filter ?? "all"}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes" as never,
        { event, schema: "public", table, ...(filter ? { filter } : {}) },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          for (const key of invalidateRef.current) qc.invalidateQueries({ queryKey: key });
          onChangeRef.current?.(payload);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, event, enabled, qc]);
}
