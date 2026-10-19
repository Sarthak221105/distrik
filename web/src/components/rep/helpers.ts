import { formatDate } from "@/lib/format";
import type { ProspectStage } from "@/lib/offline/types";

/** Digits only, as wa.me expects (country code included, no plus). */
export function waDigits(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  return d;
}

export function waLink(phone: string | null | undefined, text: string): string | null {
  const digits = waDigits(phone);
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * Click to chat invite for a lead with no WhatsApp consent: the rep sends it
 * from their own WhatsApp, and it links the buyer to the business number with
 * "Ref <code>" prefilled, so the buyer's first message maps to this prospect
 * (and the buyer starting the chat is what creates consent). No cold broadcast.
 */
export function clickToChatInvite(opts: {
  buyerName: string | null;
  repName: string | null;
  manufacturerName: string | null;
  businessNumber: string | null;
  refCode: string | null;
}): string {
  const ref = opts.refCode ? `Ref ${opts.refCode}` : "";
  const mfr = opts.manufacturerName ?? "our company";
  const greeting = `Namaste ${opts.buyerName ? `${opts.buyerName} ji` : "ji"},`;
  const intro = opts.repName ? ` main ${opts.repName}, ${mfr} se.` : ` ${mfr} se sampark.`;
  const bizDigits = waDigits(opts.businessNumber);
  if (bizDigits.length >= 10) {
    const chat = `https://wa.me/${bizDigits}?text=${encodeURIComponent(`Hi ${mfr}, ${ref}`.trim())}`;
    return `${greeting}${intro} Rate, catalogue aur order ke liye hamare business WhatsApp ${opts.businessNumber} par message karein: ${chat} (${ref})`;
  }
  return `${greeting}${intro} Rate, catalogue aur order ke liye is number par reply karein. (${ref})`;
}

export function reorderMessage(opts: {
  contactName: string | null;
  productName: string;
  lastOrderDate: string;
  predictedDate: string;
  repName: string | null;
  manufacturerName: string | null;
}): string {
  const who = opts.contactName ? `${opts.contactName} ji` : "ji";
  const sign = [opts.repName, opts.manufacturerName].filter(Boolean).join(", ");
  return (
    `Namaste ${who}, aapka pichhla ${opts.productName} order ${formatDate(opts.lastOrderDate)} ko aaya tha. ` +
    `Hamare hisaab se ${formatDate(opts.predictedDate)} tak stock khatam hone wala hoga. ` +
    `Kya naya order abhi book kar dein? Reply karein, hum turant dispatch karwa denge.` +
    (sign ? ` – ${sign}` : "")
  );
}

/**
 * Mirror of the stage_transitions table so the stage sheet works offline.
 * set_stage re-validates on the server (and again on sync); first_order and
 * repeat_order are reached only by confirming an order, so they are not offered.
 */
export const STAGE_TRANSITIONS: Record<ProspectStage, ProspectStage[]> = {
  new: ["contacted", "engaged", "lost"],
  contacted: ["engaged", "lost"],
  engaged: ["qualified", "contacted", "lost"],
  qualified: ["negotiating", "quoted", "engaged", "lost"],
  negotiating: ["quoted", "qualified", "lost"],
  quoted: ["negotiating", "lost"],
  first_order: ["lost"],
  repeat_order: ["lost"],
  lost: ["contacted", "engaged"],
};

export const ALL_STAGES: ProspectStage[] = [
  "new",
  "contacted",
  "engaged",
  "qualified",
  "negotiating",
  "quoted",
  "first_order",
  "repeat_order",
  "lost",
];

export function telLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function safeFileName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
}
