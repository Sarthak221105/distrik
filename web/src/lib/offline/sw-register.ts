"use client";

/**
 * Service worker registration for the rep PWA. The worker (public/sw.js) is
 * registered automatically in production builds, or in development when
 * NEXT_PUBLIC_ENABLE_SW=1 (a worker caching dev bundles gets in the way of
 * hot reload). The notifications page can always register it on demand so
 * push can be enabled.
 */
export const SW_AUTO_REGISTER = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "1";

export function swSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!swSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    return reg;
  } catch {
    return null;
  }
}

/** Asks the worker to keep an offline copy of these app pages (HTML shell only, no buyer data). */
export function warmPageCache(urls: string[]): void {
  if (!swSupported()) return;
  navigator.serviceWorker.controller?.postMessage({ type: "CACHE_PAGES", urls });
}

/** Sign out: drop cached pages so the next person on this phone never sees them. */
export function clearPageCache(): void {
  if (!swSupported()) return;
  navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_PAGES" });
}
