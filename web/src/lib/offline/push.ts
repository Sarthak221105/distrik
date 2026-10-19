"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { RpcError, toAppError } from "@/lib/errors";
import { registerServiceWorker, swSupported } from "@/lib/offline/sw-register";

export type PushState = "unsupported" | "unconfigured" | "denied" | "prompt" | "subscribed" | "not_subscribed";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function pushSupported(): boolean {
  return swSupported() && typeof window !== "undefined" && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function toBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) return "subscribed";
  return Notification.permission === "granted" ? "not_subscribed" : "prompt";
}

/**
 * Registers the worker, asks for permission, subscribes with the VAPID key and
 * stores the subscription for the notify worker (RLS: own rows only).
 */
export async function enablePush(userId: string): Promise<void> {
  if (!pushSupported()) throw new RpcError({ code: "unsupported", message: "This browser does not support push notifications" });
  if (!VAPID_PUBLIC_KEY) {
    throw new RpcError({ code: "unconfigured", message: "Push is not configured for this deployment (no VAPID public key)" });
  }
  const reg = (await registerServiceWorker()) ?? null;
  if (!reg) throw new RpcError({ code: "sw_failed", message: "Could not start the service worker" });
  await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new RpcError({
      code: "denied",
      message: "Notifications are blocked. Allow them in your browser's site settings, then try again.",
    });
  }

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));

  const supabase = getSupabaseBrowser();
  // push_subscriptions allows insert and delete of own rows (no update), so
  // replace any earlier row for this endpoint.
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint).eq("user_id", userId);
  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: toBase64Url(sub.getKey("p256dh")),
    auth: toBase64Url(sub.getKey("auth")),
    user_agent: navigator.userAgent.slice(0, 300),
  });
  if (error) throw new RpcError(toAppError(error));
}

export async function disablePush(userId: string): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await getSupabaseBrowser().from("push_subscriptions").delete().eq("endpoint", sub.endpoint).eq("user_id", userId);
  await sub.unsubscribe();
}
