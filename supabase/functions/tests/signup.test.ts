import { assert, assertEquals, assertMatch, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { AppError } from "../_shared/http.ts";
import { CURRENT_TERMS_VERSION, RateLimiter, clientIp, honeypotTripped, newStatusToken, sha256Hex, validateApplication } from "../_shared/signup.ts";
import { getPaymentProvider, placeholderProvider } from "../_shared/payments/mod.ts";

const valid = {
  plan_code: "growth",
  billing_cycle: "yearly",
  company_name: "  Narmada Agro Foods ",
  gstin: "23aajcn1111k1z1",
  state: "Madhya Pradesh",
  owner_name: "Kiran Rao",
  owner_email: "Kiran@NarmadaAgro.test",
  owner_phone: "+91 98260 55501",
  accept_terms: true,
};

function fieldOf(fn: () => unknown): string | null {
  const err = assertThrows(fn, AppError) as AppError;
  return err.field;
}

Deno.test("a complete application is cleaned up for the database", () => {
  const a = validateApplication(valid);
  assertEquals(a.company_name, "Narmada Agro Foods");
  assertEquals(a.gstin, "23AAJCN1111K1Z1");
  assertEquals(a.owner_email, "kiran@narmadaagro.test");
  assertEquals(a.owner_phone, "+919826055501");
  assertEquals(a.billing_cycle, "yearly");
  assertEquals(a.terms_version, CURRENT_TERMS_VERSION);
  assertEquals(a.legal_name, null);
});

Deno.test("billing defaults to monthly and rejects anything else", () => {
  assertEquals(validateApplication({ ...valid, billing_cycle: undefined }).billing_cycle, "monthly");
  assertEquals(fieldOf(() => validateApplication({ ...valid, billing_cycle: "weekly" })), "billing_cycle");
});

Deno.test("each missing or malformed field is reported against that field", () => {
  assertEquals(fieldOf(() => validateApplication({ ...valid, plan_code: "" })), "plan_code");
  assertEquals(fieldOf(() => validateApplication({ ...valid, company_name: "A" })), "company_name");
  assertEquals(fieldOf(() => validateApplication({ ...valid, state: " " })), "state");
  assertEquals(fieldOf(() => validateApplication({ ...valid, gstin: "23ABC" })), "gstin");
  assertEquals(fieldOf(() => validateApplication({ ...valid, owner_email: "kiran@" })), "owner_email");
  assertEquals(fieldOf(() => validateApplication({ ...valid, owner_phone: "12345" })), "owner_phone");
  assertEquals(fieldOf(() => validateApplication({ ...valid, company_email: "nope" })), "company_email");
  assertEquals(fieldOf(() => validateApplication({ ...valid, company_phone: "1" })), "company_phone");
});

Deno.test("the Terms must be explicitly accepted", () => {
  assertEquals(fieldOf(() => validateApplication({ ...valid, accept_terms: "true" })), "accept_terms");
  assertEquals(fieldOf(() => validateApplication({ ...valid, accept_terms: undefined })), "accept_terms");
});

Deno.test("Indian mobile numbers are accepted with 0 or 91 prefixes", () => {
  for (const phone of ["9826055501", "09826055501", "919826055501", "+91-98260-55501"]) {
    assertEquals(validateApplication({ ...valid, owner_phone: phone }).owner_phone, "+919826055501");
  }
});

Deno.test("the hidden honeypot field catches bots", () => {
  assert(honeypotTripped({ website: "http://spam.example" }));
  assert(!honeypotTripped({ website: "" }));
  assert(!honeypotTripped({}));
});

Deno.test("the rate limiter allows a burst per IP then blocks until the window passes", () => {
  const rl = new RateLimiter(3, 60_000);
  const t0 = 1_000_000;
  assert(rl.allow("ip-a", t0));
  assert(rl.allow("ip-a", t0 + 1));
  assert(rl.allow("ip-a", t0 + 2));
  assert(!rl.allow("ip-a", t0 + 3));
  assert(rl.allow("ip-b", t0 + 3), "other IPs are unaffected");
  assert(rl.allow("ip-a", t0 + 60_001), "the window slides");
});

Deno.test("the client IP comes from the first forwarded address", () => {
  assertEquals(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } })), "203.0.113.9");
  assertEquals(clientIp(new Request("http://x")), "unknown");
});

Deno.test("status tokens are random and only their hash is stored", async () => {
  const a = newStatusToken();
  const b = newStatusToken();
  assert(a !== b);
  assertMatch(a, /^[A-Za-z0-9_-]{32,}$/);
  assertEquals(await sha256Hex("demo-application-token"), await sha256Hex("demo-application-token"));
  assertMatch(await sha256Hex(a), /^[0-9a-f]{64}$/);
});

Deno.test("the placeholder payment provider says payments are coming soon", async () => {
  const res = await placeholderProvider.createCheckout({
    applicationId: "x",
    amountPaise: 900000,
    currency: "INR",
    description: "Growth monthly",
    customer: { name: "K", email: "k@x.test", phone: "+919800000001" },
  });
  assertEquals(res.status, "unavailable");
  await assertRejects(() => placeholderProvider.verifyWebhook(new Request("http://x"), "{}"), AppError);
  assertEquals(getPaymentProvider("placeholder").name, "placeholder");
  assertThrows(() => getPaymentProvider("razorpay"), AppError);
});
