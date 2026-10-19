"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FlaskConical, Info, Paperclip, Scale, Send, Smartphone, X } from "lucide-react";
import { ConversationThread } from "@/components/domain/conversation-thread";
import { EmptyState } from "@/components/domain/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { invokeFn, toE164 } from "@/lib/edge";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { RpcError, unwrap } from "@/lib/errors";
import { formatINR, formatPhone, timeAgo, titleCase } from "@/lib/format";
import { useRealtime } from "@/hooks/use-realtime";
import { useViewer } from "@/components/providers";
import { cn } from "@/lib/utils";

const CHIPS = [
  "Rate kya hai 5L mustard oil ka? 100 jar chahiye",
  "540 me de do",
  "ok send quotation",
  "60 din ka credit chahiye",
  "STOP",
];
const MAX_MEDIA = 5 * 1024 * 1024;

type Media = { type: "image" | "document"; filename: string; mime: string; base64: string };
type SimResult = {
  ok?: boolean;
  results?: { ok?: boolean; result?: { conversation_id?: string }; error?: { message?: string } }[];
};

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/**
 * WhatsApp test (sandbox only): the owner or sales head plays a buyer. The
 * message goes through simulate-inbound, which runs the same ingest path as
 * the real webhook (consent rules, AI loop, approvals), then the thread shows
 * live. It never sends a real WhatsApp message.
 */
export function WhatsAppTestPanel() {
  const supabase = getSupabaseBrowser();
  const viewer = useViewer();
  const manufacturer = viewer.manufacturerId ?? "";
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [contactId, setContactId] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [profileName, setProfileName] = useState("");
  const [text, setText] = useState("");
  const [media, setMedia] = useState<Media | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [sandboxOff, setSandboxOff] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [log, setLog] = useState<{ at: string; text: string; phone: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const contacts = useQuery({
    enabled: !!manufacturer,
    queryKey: ["whatsapp-test", "contacts"],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("contacts")
          .select("id, name, phone_e164, prospect:prospects(name)")
          .not("phone_e164", "is", null)
          .is("erased_at", null)
          .order("created_at", { ascending: false })
          .limit(300),
      ) ?? [],
  });
  const contact = (contacts.data ?? []).find((c) => c.id === contactId);

  async function findConversation(phone: string): Promise<string | null> {
    const c = await supabase.from("contacts").select("id").eq("phone_e164", phone).limit(1).maybeSingle();
    if (!c.data) return null;
    const conv = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", c.data.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return conv.data?.id ?? null;
  }

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return setMedia(null);
    if (file.size > MAX_MEDIA) return setError({ message: "Attach a file under 5 MB.", field: "media" });
    if (!/^(image\/|application\/pdf)/.test(file.type)) return setError({ message: "Attach a PDF or an image.", field: "media" });
    try {
      const base64 = await readBase64(file);
      setMedia({ type: file.type.startsWith("image/") ? "image" : "document", filename: file.name, mime: file.type, base64 });
    } catch {
      setError({ message: "Could not read the file.", field: "media" });
    }
  }

  async function send(body: string) {
    setError(null);
    const phone = mode === "existing" ? (contact?.phone_e164 ?? null) : toE164(newPhone);
    if (!phone) {
      return setError({ message: mode === "existing" ? "Choose a contact." : "Enter a valid buyer phone number.", field: "phone" });
    }
    if (!body.trim() && !media) return setError({ message: "Type a message or attach a file.", field: "text" });
    setSending(true);
    try {
      const res = await invokeFn<SimResult>("simulate-inbound", {
        manufacturer_id: manufacturer,
        from_phone: phone,
        profile_name: mode === "existing" ? (contact?.name ?? undefined) : profileName.trim() || undefined,
        text: body.trim(),
        ...(media ? { media } : {}),
      });
      const failed = res?.results?.find((r) => r.error?.message);
      if (failed?.error?.message) throw new RpcError({ code: "simulate_failed", message: failed.error.message });
      const convId = res?.results?.[0]?.result?.conversation_id || (await findConversation(phone));
      if (convId) setConversationId(convId);
      else toast.message("Sent. The conversation will appear once the message is processed.");
      setLog((l) => [{ at: new Date().toISOString(), text: body.trim() || `[${media?.filename}]`, phone }, ...l].slice(0, 20));
      setText("");
      setMedia(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      if (e instanceof RpcError && (e.code === "sandbox_only" || /sandbox/i.test(e.message))) {
        setSandboxOff(true);
        return;
      }
      const err = e instanceof RpcError ? { message: e.message, field: e.field } : { message: "Sending failed" };
      setError(err);
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!manufacturer) {
    return <EmptyState title="No company linked" description="Your account is not linked to a manufacturer, so there is nothing to test." />;
  }

  if (sandboxOff) {
    return (
      <EmptyState
        icon={<FlaskConical aria-hidden />}
        title="The WhatsApp test sandbox is not available in production"
        description="This platform is connected to the live WhatsApp Business API, so simulated buyer messages are switched off. Use a real test phone to message your WhatsApp number instead."
        action={
          <Button variant="outline" size="sm" onClick={() => setSandboxOff(false)}>
            Back
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-4">
      <p className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
        <span>
          Play a buyer to see how the AI replies under your rules. This works only in the WhatsApp test sandbox and{" "}
          <strong>never sends a real WhatsApp message</strong>. Messages still go through your consent rules, price guardrails and approvals.
        </span>
      </p>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="size-4 text-muted-foreground" aria-hidden /> Buyer phone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void send(text);
              }}
            >
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Buyer</legend>
                <div className="flex gap-2" role="radiogroup" aria-label="Buyer source">
                  {(["existing", "new"] as const).map((m) => (
                    <label
                      key={m}
                      className={cn(
                        "inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                        mode === m ? "border-primary bg-primary-soft text-primary" : "border-border",
                      )}
                    >
                      <input type="radio" name="sim-mode" className="sr-only" checked={mode === m} onChange={() => setMode(m)} />
                      {m === "existing" ? "Existing contact" : "New phone"}
                    </label>
                  ))}
                </div>
                {mode === "existing" ? (
                  <Field label="Contact" htmlFor="sim-contact" error={error?.field === "phone" ? error.message : contacts.error ? "Could not load contacts" : undefined}>
                    <NativeSelect
                      id="sim-contact"
                      value={contactId}
                      onChange={(e) => {
                        setContactId(e.target.value);
                        setConversationId(null);
                      }}
                      disabled={contacts.isLoading}
                    >
                      <option value="">
                        {contacts.isLoading ? "Loading…" : (contacts.data ?? []).length === 0 ? "No contacts with a phone yet" : "Choose a contact…"}
                      </option>
                      {(contacts.data ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {(c.prospect as { name: string } | null)?.name ?? "Prospect"} · {c.name ?? "Unnamed"} · {formatPhone(c.phone_e164)}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Phone" htmlFor="sim-phone" error={error?.field === "phone" ? error.message : undefined}>
                      <Input id="sim-phone" type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+91 98765 43210" />
                    </Field>
                    <Field label="WhatsApp profile name" htmlFor="sim-profile">
                      <Input id="sim-profile" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Ramesh Traders" />
                    </Field>
                  </div>
                )}
              </fieldset>

              <div className="grid gap-2">
                <p className="text-sm font-medium" id="sim-chips">
                  Quick messages
                </p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="sim-chips">
                  {CHIPS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setText(c)}
                      className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs hover:border-primary/40"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <Field label="Message from the buyer" htmlFor="sim-text" error={error?.field === "text" ? error.message : undefined}>
                <Textarea
                  id="sim-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
              </Field>

              <div className="grid gap-1">
                <input
                  ref={fileRef}
                  id="sim-file"
                  type="file"
                  accept="application/pdf,image/*"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Attachment"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                {media ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{media.filename}</span>
                      <Badge tone="outline">{media.type}</Badge>
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Remove attachment"
                      onClick={() => {
                        setMedia(null);
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                    <Paperclip aria-hidden /> Attach PDF or image (optional, e.g. a PO)
                  </Button>
                )}
                {error?.field === "media" && (
                  <p className="text-xs text-danger" role="alert">
                    {error.message}
                  </p>
                )}
              </div>

              {error && !["phone", "text", "media"].includes(error.field ?? "") && (
                <p className="text-sm text-danger" role="alert">
                  {error.message}
                </p>
              )}

              <Button type="submit" size="lg" loading={sending}>
                {!sending && <Send aria-hidden />} Send as buyer
              </Button>
            </form>

            {log.length > 0 && (
              <div className="mt-4 grid gap-1 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">Sent this session</p>
                <ul className="grid gap-1 text-xs">
                  {log.map((l) => (
                    <li key={l.at} className="flex justify-between gap-2">
                      <span className="truncate">{l.text}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatPhone(l.phone)} · {timeAgo(l.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          {conversationId ? (
            <>
              <ConversationThread conversationId={conversationId} showActions canCompose={false} height="h-[560px]" />
              <PendingApprovals conversationId={conversationId} />
            </>
          ) : (
            <EmptyState
              icon={<Smartphone aria-hidden />}
              title="No conversation yet"
              description="Send a message as the buyer. The thread opens here and updates live as the AI replies and approvals open."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PendingApprovals({ conversationId }: { conversationId: string }) {
  const supabase = getSupabaseBrowser();
  const key = ["whatsapp-test", "approvals", conversationId];
  const list = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(
        await supabase
          .from("human_approvals")
          .select("id, kind, status, summary, requested_paise, permitted_paise, qty, created_at, expires_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(10),
      ) ?? [],
  });
  useRealtime({ table: "human_approvals", filter: `conversation_id=eq.${conversationId}`, invalidate: [key] });

  if (list.error) return <p className="text-sm text-danger" role="alert">Could not load approvals for this conversation.</p>;
  if ((list.data ?? []).length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="size-4 text-muted-foreground" aria-hidden /> Approvals raised by this conversation
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {list.data!.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
            <div className="grid gap-0.5">
              <span className="font-medium">{titleCase(a.kind)}</span>
              {a.summary && <span className="text-xs text-muted-foreground">{a.summary}</span>}
              {a.requested_paise !== null && (
                <span className="text-xs">
                  Asked {formatINR(a.requested_paise)}
                  {a.permitted_paise !== null ? ` · floor ${formatINR(a.permitted_paise)}` : ""}
                  {a.qty ? ` · qty ${a.qty}` : ""}
                </span>
              )}
            </div>
            <Badge tone={a.status === "pending" ? "warning" : a.status === "approved" ? "success" : "neutral"}>{titleCase(a.status)}</Badge>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Decide pending approvals in Approvals, as you would for a real buyer.</p>
      </CardContent>
    </Card>
  );
}
