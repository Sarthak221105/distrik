import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { buildMetaInboundPayload, parseMetaInbound, parseMetaStatus, verifyMetaSignature } from "../_shared/channel/meta_format.ts";
import { DisabledChannel, getAdapter, MetaCloudWhatsApp, SandboxWhatsApp } from "../_shared/channel/providers.ts";
import { ChannelError } from "../_shared/channel/types.ts";

const dir = new URL("./fixtures/", import.meta.url);
const read = (f: string) => Deno.readTextFileSync(new URL(f, dir)).replace(/\r\n/g, "\n");

Deno.test("parses a recorded Meta text message", () => {
  const msgs = parseMetaInbound(JSON.parse(read("meta_inbound_text.json")));
  assertEquals(msgs.length, 1);
  const m = msgs[0];
  assertEquals(m.phoneNumberId, "sandbox-shakti-001");
  assertEquals(m.from, "919827010001");
  assertEquals(m.body, "550 me de do 100 jar");
  assertEquals(m.profileName, "Ramesh Agrawal");
  assertEquals(m.type, "text");
  assertEquals(m.media, null);
  assertEquals(m.sentAt, new Date(1792310400 * 1000).toISOString());
});

Deno.test("parses a recorded Meta document message with caption", () => {
  const [m] = parseMetaInbound(JSON.parse(read("meta_inbound_document.json")));
  assertEquals(m.type, "document");
  assertEquals(m.body, "PO attached");
  assertEquals(m.media, { id: "1543219876543210", type: "document", mime: "application/pdf", filename: "PO-4471.pdf" });
});

Deno.test("parses recorded status callbacks, including errors", () => {
  const s = parseMetaStatus(JSON.parse(read("meta_status.json")));
  assertEquals(s.length, 2);
  assertEquals(s[0].status, "delivered");
  assertEquals(s[0].error, null);
  assertEquals(s[1].status, "failed");
  assert(s[1].error?.startsWith("131047: Re-engagement message"));
  // Status payloads contain no inbound messages and vice versa.
  assertEquals(parseMetaInbound(JSON.parse(read("meta_status.json"))).length, 0);
  assertEquals(parseMetaStatus(JSON.parse(read("meta_inbound_text.json"))).length, 0);
});

Deno.test("verifies X-Hub-Signature-256 against a precomputed HMAC", async () => {
  const raw = read("meta_inbound_text.json");
  const good = "sha256=ae3d072297c994c26826f782f6357cf0eb6e2eda6666f3f93e3f864bfd0266c5";
  assert(await verifyMetaSignature("test-app-secret", raw, new Headers({ "x-hub-signature-256": good })));
  assert(!(await verifyMetaSignature("wrong-secret", raw, new Headers({ "x-hub-signature-256": good }))));
  assert(!(await verifyMetaSignature("test-app-secret", raw + " ", new Headers({ "x-hub-signature-256": good }))));
  assert(!(await verifyMetaSignature("test-app-secret", raw, new Headers())));
  assert(!(await verifyMetaSignature("", raw, new Headers({ "x-hub-signature-256": good }))));
});

Deno.test("simulator payload round trips through the production parser", () => {
  const p = buildMetaInboundPayload({
    phoneNumberId: "sandbox-shakti-001",
    from: "919827010001",
    profileName: "Test",
    providerMessageId: "wamid.SIM-1",
    text: "Catalogue bhejiye",
  });
  const [m] = parseMetaInbound(p);
  assertEquals(m.providerMessageId, "wamid.SIM-1");
  assertEquals(m.body, "Catalogue bhejiye");
  const d = parseMetaInbound(buildMetaInboundPayload({
    phoneNumberId: "x", from: "919800000000", providerMessageId: "wamid.SIM-2",
    media: { type: "image", id: "sim-media-1", mime: "image/jpeg" }, text: "PO",
  }))[0];
  assertEquals(d.media?.type, "image");
  assertEquals(d.body, "PO");
});

Deno.test("sandbox adapter sends without network and returns sbx ids", async () => {
  const a = new SandboxWhatsApp("s");
  const r = await a.send({ messageId: "m1", channel: "whatsapp", to: "+919827010001", from: "sandbox-shakti-001", body: "Hello" });
  assert(r.providerMessageId.startsWith("sbx-"));
  assertEquals(r.simulated, true);
  assertEquals(a.sent.length, 1);
  await assertRejects(() => a.send({ messageId: "m2", channel: "whatsapp", to: "9827010001", from: null, body: "x" }), ChannelError);
  await assertRejects(() => a.send({ messageId: "m3", channel: "whatsapp", to: "+919827010001", from: null, body: null }), ChannelError);
  assertEquals(await a.downloadMedia("123"), null);
});

Deno.test("meta_cloud adapter builds Graph v21.0 payloads and maps errors", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const okFetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    return Promise.resolve(new Response(JSON.stringify({ messages: [{ id: "wamid.OUT1" }] }), { status: 200 }));
  }) as unknown as typeof fetch;
  const a = new MetaCloudWhatsApp("token", "secret", okFetch);
  const r = await a.send({
    messageId: "m", channel: "whatsapp", to: "+919827010001", from: "PNID", body: null,
    template: { name: "quotation_ready", language: "en", params: ["Ramesh", "SF/2026/0003"] },
  });
  assertEquals(r.providerMessageId, "wamid.OUT1");
  assertEquals(calls[0].url, "https://graph.facebook.com/v21.0/PNID/messages");
  assertEquals(calls[0].body.to, "919827010001");
  assertEquals(calls[0].body.type, "template");
  const tpl = calls[0].body.template as { components: Array<{ parameters: Array<{ text: string }> }> };
  assertEquals(tpl.components[0].parameters.map((p) => p.text), ["Ramesh", "SF/2026/0003"]);

  const doc = a.buildPayload({ messageId: "m", channel: "whatsapp", to: "+919827010001", from: "PNID", body: "Quotation", media: { type: "document", url: "https://x/y.pdf", filename: "q.pdf" } });
  assertEquals(doc.type, "document");
  assertEquals((doc.document as Record<string, string>).link, "https://x/y.pdf");
  assertEquals((doc.document as Record<string, string>).caption, "Quotation");

  const errFetch = (() => Promise.resolve(new Response(JSON.stringify({ error: { code: 131047, message: "Re-engagement" } }), { status: 400 }))) as unknown as typeof fetch;
  const e = await assertRejects(() => new MetaCloudWhatsApp("t", "s", errFetch).send({ messageId: "m", channel: "whatsapp", to: "+919827010001", from: "P", body: "hi" }), ChannelError);
  assertEquals(e.retryable, false);
  const rateFetch = (() => Promise.resolve(new Response("{}", { status: 429 }))) as unknown as typeof fetch;
  const e2 = await assertRejects(() => new MetaCloudWhatsApp("t", "s", rateFetch).send({ messageId: "m", channel: "whatsapp", to: "+919827010001", from: "P", body: "hi" }), ChannelError);
  assertEquals(e2.retryable, true);
});

Deno.test("SMS, email and voice are disabled stubs; provider is chosen by env", async () => {
  for (const ch of ["sms", "email", "voice"]) {
    const a = getAdapter(ch);
    assert(a instanceof DisabledChannel);
    const e = await assertRejects(() => a.send({ messageId: "m", channel: "sms", to: "+919800000000", from: null, body: "x" }), ChannelError);
    assertEquals(e.code, "channel_disabled");
  }
  Deno.env.set("WHATSAPP_PROVIDER", "sandbox");
  assertEquals(getAdapter("whatsapp").provider, "sandbox");
  Deno.env.set("WHATSAPP_PROVIDER", "meta_cloud");
  assertEquals(getAdapter("whatsapp").provider, "meta_cloud");
  Deno.env.delete("WHATSAPP_PROVIDER");
});
