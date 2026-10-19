"use client";

import { useTrackScreen } from "@/components/manufacturer/hooks";

/** Drop into a server page to record a screen_view product event. */
export function ScreenTracker({ screen, properties }: { screen: string; properties?: Record<string, unknown> }) {
  useTrackScreen(screen, properties);
  return null;
}
