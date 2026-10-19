"use client";

// Loaded only on the campaign route through next/dynamic, so maplibre and its
// stylesheet never reach other bundles.
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { MapPinOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type MapPoint = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  fit_score: number | null;
  stage?: string;
};

type Tier = "strong" | "medium" | "weak" | "unscored";

export function fitTier(score: number | null | undefined): Tier {
  if (score === null || score === undefined) return "unscored";
  const s = Number(score);
  return s >= 75 ? "strong" : s >= 55 ? "medium" : "weak";
}

const TIER: Record<Tier, { label: string; color: string; shape: "circle" | "square" | "triangle" | "diamond"; glyph: string }> = {
  strong: { label: "Strong fit (75+)", color: "var(--success)", shape: "circle", glyph: "S" },
  medium: { label: "Medium fit (55 to 74)", color: "var(--warning)", shape: "square", glyph: "M" },
  weak: { label: "Weak fit (below 55)", color: "var(--muted-foreground)", shape: "triangle", glyph: "W" },
  unscored: { label: "Not scored", color: "var(--info)", shape: "diamond", glyph: "?" },
};

function markerSvg(tier: Tier) {
  const { color, shape, glyph } = TIER[tier];
  const body =
    shape === "circle"
      ? `<circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>`
      : shape === "square"
        ? `<rect x="3" y="3" width="18" height="18" rx="3" fill="${color}" stroke="white" stroke-width="2"/>`
        : shape === "triangle"
          ? `<path d="M12 2 L22 21 L2 21 Z" fill="${color}" stroke="white" stroke-width="2" stroke-linejoin="round"/>`
          : `<path d="M12 1 L23 12 L12 23 L1 12 Z" fill="${color}" stroke="white" stroke-width="2" stroke-linejoin="round"/>`;
  return `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">${body}<text x="12" y="${shape === "triangle" ? 18 : 16}" text-anchor="middle" font-size="10" font-weight="700" fill="white" font-family="system-ui">${glyph}</text></svg>`;
}

export function LegendShape({ tier }: { tier: Tier }) {
  return <span className="inline-flex" dangerouslySetInnerHTML={{ __html: markerSvg(tier) }} />;
}

/**
 * Market map: one marker per prospect with coordinates, coloured AND shaped by
 * fit tier (with a letter), so colour is never the only signal. Markers are
 * focusable buttons that open the prospect's fit panel.
 */
export function MarketMap({
  points,
  onSelect,
  className,
}: {
  points: MapPoint[];
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  const [failed, setFailed] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const located = points.filter((p) => p.lat !== null && p.lng !== null);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (cancelled || !container.current) return;
        // Turbopack cannot resolve maplibre's worker URL; serve the copy that
        // `npm install` places in public/maplibre (see the postinstall script).
        ml.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        const map = new ml.Map({
          container: container.current,
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: [78.9629, 22.5937],
          zoom: 4,
          attributionControl: { compact: true },
        });
        map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        map.on("error", (e) => {
          if (!map.loaded() && (e as unknown as { error?: Error }).error) setFailed("Map tiles could not be loaded.");
        });
        mapRef.current = map;
        setReady(true);
      } catch {
        if (!cancelled) setFailed("The map could not start in this browser.");
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync markers with the points.
  const pointsKey = located.map((p) => `${p.id}:${p.fit_score}:${p.lat}:${p.lng}`).join("|");
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    let cancelled = false;
    (async () => {
      const ml = await import("maplibre-gl");
      const map = mapRef.current;
      if (cancelled || !map) return;
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
      const bounds = new ml.LngLatBounds();
      for (const p of located) {
        const tier = fitTier(p.fit_score);
        const el = document.createElement("button");
        el.type = "button";
        el.className = "block rounded-full focus-visible:outline-2 focus-visible:outline-offset-2";
        el.style.cursor = "pointer";
        el.innerHTML = markerSvg(tier);
        const label = `${p.name}, ${p.fit_score === null ? "not scored" : `fit ${Math.round(Number(p.fit_score))}`}, ${TIER[tier].label}`;
        el.setAttribute("aria-label", label);
        el.title = label;
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelectRef.current?.(p.id);
        });
        const marker = new ml.Marker({ element: el }).setLngLat([p.lng!, p.lat!]).addTo(map);
        markersRef.current.push(marker);
        bounds.extend([p.lng!, p.lat!]);
      }
      if (located.length === 1) map.jumpTo({ center: [located[0]!.lng!, located[0]!.lat!], zoom: 12 });
      else if (located.length > 1) map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
    })();
    return () => {
      cancelled = true;
    };
    // pointsKey captures the marker inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pointsKey]);

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="relative overflow-hidden rounded-lg border border-border">
        <div
          ref={container}
          className="h-[420px] w-full bg-surface-muted"
          role="region"
          aria-label={`Market map with ${located.length} prospects. Use Tab to move between markers.`}
        />
        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/90 p-6 text-center text-sm">
            <MapPinOff className="size-6 text-muted-foreground" aria-hidden />
            <p>{failed}</p>
            <p className="text-xs text-muted-foreground">The prospect list below has the same information.</p>
          </div>
        )}
        {!failed && located.length === 0 && (
          <div className="absolute inset-x-0 bottom-0 bg-surface/90 p-3 text-center text-xs text-muted-foreground">
            No prospects have map coordinates yet. They appear as addresses are geocoded.
          </div>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Map legend">
        {(Object.keys(TIER) as Tier[]).map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <LegendShape tier={t} />
            {TIER[t].label}
          </li>
        ))}
        {points.length > located.length && <li>{points.length - located.length} without coordinates</li>}
      </ul>
    </div>
  );
}

export default MarketMap;
