// One channel interface (PRD 8). Business logic never branches on channel or
// provider: it calls send / parseInbound / parseStatus / verifySignature.

export type ChannelName = "whatsapp" | "sms" | "email" | "voice";

export interface OutboundMessage {
  messageId: string;
  channel: ChannelName;
  /** E.164, e.g. +919827010001 */
  to: string;
  /** Provider sender id (WhatsApp phone_number_id). */
  from: string | null;
  body: string | null;
  template?: { name: string; language: string; params: string[] } | null;
  media?: { type: "document" | "image" | "audio" | "video"; url: string; filename?: string | null } | null;
}

export interface SendResult {
  providerMessageId: string;
  /** True for providers that never touch a network (sandbox). */
  simulated?: boolean;
}

export interface InboundMedia {
  id: string;
  type: "document" | "image" | "audio" | "video";
  mime: string | null;
  filename: string | null;
}

export interface InboundMessage {
  phoneNumberId: string;
  from: string;
  providerMessageId: string;
  body: string | null;
  sentAt: string;
  profileName: string | null;
  media: InboundMedia | null;
  type: string;
}

export interface StatusUpdate {
  providerMessageId: string;
  status: string;
  at: string;
  error: string | null;
}

export interface DownloadedMedia {
  bytes: Uint8Array;
  mime: string | null;
}

export interface ChannelAdapter {
  readonly channel: ChannelName;
  readonly provider: string;
  send(message: OutboundMessage): Promise<SendResult>;
  parseInbound(payload: unknown): InboundMessage[];
  parseStatus(payload: unknown): StatusUpdate[];
  verifySignature(rawBody: string, headers: Headers): Promise<boolean>;
  downloadMedia(mediaId: string): Promise<DownloadedMedia | null>;
}

/** Thrown by adapters. retryable=false means retrying cannot help (bad number, disabled channel). */
export class ChannelError extends Error {
  constructor(public code: string, message: string, public retryable = true, public status: number | null = null) {
    super(message);
    this.name = "ChannelError";
  }
}
