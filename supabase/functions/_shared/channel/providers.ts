// Channel providers: sandbox (no network), meta_cloud (WhatsApp Cloud API,
// Graph v21.0, usually through a BSP), and stubs for SMS (needs DLT
// registration), email and voice (phase 2).

import { config } from "../env.ts";
import { parseMetaInbound, parseMetaStatus, verifyMetaSignature } from "./meta_format.ts";
import {
  type ChannelAdapter,
  ChannelError,
  type ChannelName,
  type DownloadedMedia,
  type InboundMessage,
  type OutboundMessage,
  type SendResult,
  type StatusUpdate,
} from "./types.ts";

const GRAPH = "https://graph.facebook.com/v21.0";

/** Local and staging: never touches a network. Delivery callbacks are simulated by the sender. */
export class SandboxWhatsApp implements ChannelAdapter {
  readonly channel: ChannelName = "whatsapp";
  readonly provider = "sandbox";
  readonly sent: OutboundMessage[] = [];

  constructor(private secret: string = config.whatsappAppSecret()) {}

  send(message: OutboundMessage): Promise<SendResult> {
    if (!message.to || !/^\+[1-9]\d{7,14}$/.test(message.to)) {
      return Promise.reject(new ChannelError("invalid_recipient", "Recipient is not an E.164 number", false));
    }
    if (!message.body && !message.template && !message.media) {
      return Promise.reject(new ChannelError("empty_message", "Nothing to send", false));
    }
    this.sent.push(message);
    return Promise.resolve({ providerMessageId: `sbx-${crypto.randomUUID()}`, simulated: true });
  }
  parseInbound(payload: unknown): InboundMessage[] {
    return parseMetaInbound(payload);
  }
  parseStatus(payload: unknown): StatusUpdate[] {
    return parseMetaStatus(payload);
  }
  verifySignature(rawBody: string, headers: Headers): Promise<boolean> {
    return verifyMetaSignature(this.secret, rawBody, headers);
  }
  downloadMedia(_mediaId: string): Promise<DownloadedMedia | null> {
    // Sandbox media is uploaded to storage by the simulator before ingestion.
    return Promise.resolve(null);
  }
}

/** WhatsApp Business Platform Cloud API. */
export class MetaCloudWhatsApp implements ChannelAdapter {
  readonly channel: ChannelName = "whatsapp";
  readonly provider = "meta_cloud";

  constructor(
    private token: string = config.whatsappAccessToken(),
    private secret: string = config.whatsappAppSecret(),
    private fetchFn: typeof fetch = fetch,
  ) {}

  buildPayload(message: OutboundMessage): Record<string, unknown> {
    const base = { messaging_product: "whatsapp", recipient_type: "individual", to: message.to.replace(/^\+/, "") };
    if (message.template) {
      const params = message.template.params ?? [];
      return {
        ...base,
        type: "template",
        template: {
          name: message.template.name,
          language: { code: message.template.language || "en" },
          components: params.length
            ? [{ type: "body", parameters: params.map((p) => ({ type: "text", text: String(p).slice(0, 1024) })) }]
            : [],
        },
      };
    }
    if (message.media) {
      const t = message.media.type;
      const obj: Record<string, unknown> = { link: message.media.url };
      if (t === "document") obj.filename = message.media.filename ?? "document.pdf";
      if (message.body && (t === "document" || t === "image" || t === "video")) obj.caption = message.body.slice(0, 1024);
      return { ...base, type: t, [t]: obj };
    }
    return { ...base, type: "text", text: { body: (message.body ?? "").slice(0, 4096), preview_url: false } };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (!this.token) throw new ChannelError("not_configured", "WHATSAPP_ACCESS_TOKEN is not set", false);
    if (!message.from) throw new ChannelError("no_sender", "Manufacturer has no WhatsApp phone_number_id", false);
    const res = await this.fetchFn(`${GRAPH}/${encodeURIComponent(message.from)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(this.buildPayload(message)),
    });
    const text = await res.text();
    // deno-lint-ignore no-explicit-any
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch { /* non JSON error page */ }
    if (!res.ok) {
      const err = body?.error ?? {};
      const retryable = res.status === 429 || res.status >= 500 || [4, 80007, 130429, 131000, 131016].includes(err.code);
      throw new ChannelError(
        `meta_${err.code ?? res.status}`,
        `WhatsApp API ${res.status}: ${err.message ?? text.slice(0, 200)}`,
        retryable,
        res.status,
      );
    }
    const id = body?.messages?.[0]?.id;
    if (!id) throw new ChannelError("meta_no_id", "WhatsApp API returned no message id", true, res.status);
    return { providerMessageId: String(id) };
  }

  parseInbound(payload: unknown): InboundMessage[] {
    return parseMetaInbound(payload);
  }
  parseStatus(payload: unknown): StatusUpdate[] {
    return parseMetaStatus(payload);
  }
  verifySignature(rawBody: string, headers: Headers): Promise<boolean> {
    return verifyMetaSignature(this.secret, rawBody, headers);
  }

  async downloadMedia(mediaId: string): Promise<DownloadedMedia | null> {
    if (!this.token) throw new ChannelError("not_configured", "WHATSAPP_ACCESS_TOKEN is not set", false);
    const meta = await this.fetchFn(`${GRAPH}/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!meta.ok) throw new ChannelError("media_lookup_failed", `Media lookup ${meta.status}`, meta.status >= 500);
    const info = await meta.json();
    if (!info?.url) return null;
    const file = await this.fetchFn(info.url, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!file.ok) throw new ChannelError("media_download_failed", `Media download ${file.status}`, file.status >= 500);
    return { bytes: new Uint8Array(await file.arrayBuffer()), mime: info.mime_type ?? file.headers.get("content-type") };
  }
}

/** Channels that are not live: every call fails with channel_disabled. */
export class DisabledChannel implements ChannelAdapter {
  readonly provider = "disabled";
  constructor(readonly channel: ChannelName, private reason: string) {}
  send(_m: OutboundMessage): Promise<SendResult> {
    return Promise.reject(new ChannelError("channel_disabled", this.reason, false));
  }
  parseInbound(_p: unknown): InboundMessage[] {
    throw new ChannelError("channel_disabled", this.reason, false);
  }
  parseStatus(_p: unknown): StatusUpdate[] {
    throw new ChannelError("channel_disabled", this.reason, false);
  }
  verifySignature(_r: string, _h: Headers): Promise<boolean> {
    return Promise.resolve(false);
  }
  downloadMedia(_id: string): Promise<DownloadedMedia | null> {
    return Promise.reject(new ChannelError("channel_disabled", this.reason, false));
  }
}

export function getAdapter(channel: ChannelName | string = "whatsapp"): ChannelAdapter {
  switch (channel) {
    case "whatsapp": {
      const provider = config.whatsappProvider();
      if (provider === "meta_cloud") return new MetaCloudWhatsApp();
      if (provider === "sandbox") return new SandboxWhatsApp();
      throw new ChannelError("unknown_provider", `Unknown WHATSAPP_PROVIDER ${provider}`, false);
    }
    case "sms":
      return new DisabledChannel("sms", "SMS is disabled until DLT sender and template registration is complete");
    case "email":
      return new DisabledChannel("email", "Email is not a live conversation channel in the MVP");
    case "voice":
      return new DisabledChannel("voice", "Voice is reserved for phase 2");
    default:
      return new DisabledChannel("sms", `Unknown channel ${channel}`);
  }
}
