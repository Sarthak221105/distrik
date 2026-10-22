import { expect, test, type Page } from "@playwright/test";
import { USERS, signIn } from "./helpers";

// Landing page -> plan -> self-serve application -> system admin activates ->
// invite email (local Mailpit) -> /welcome -> the new tenant's dashboard.
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const stamp = Date.now();
const owner = {
  email: `owner-${stamp}@signup.test`,
  name: "Kiran Rao",
  phone: `98${String(stamp).slice(-8)}`,
};
const company = `Narmada Agro ${String(stamp).slice(-5)}`;

async function waitlistCount(page: Page): Promise<number> {
  const text = await page.getByText(/manufacturers? on the waitlist/).first().innerText();
  return Number(text.replace(/[^\d]/g, ""));
}

async function inviteLink(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages?.length) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { HTML: string; Text: string };
      const match = (msg.HTML + msg.Text).match(/https?:\/\/[^\s"'<>]+\/auth\/confirm\?[^\s"'<>]+/);
      if (match) return match[0].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No invite email for ${email}`);
}

test.describe.configure({ mode: "serial" });
let statusUrl = "";

test("a visitor picks a plan, applies and joins the waitlist", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /AI sales employee/i })).toBeVisible();
  await expect(page.getByText(/manufacturers? on the waitlist/).first()).toBeVisible();
  const before = await waitlistCount(page);

  await page.goto("/#pricing");
  await page.locator("#pricing").getByText("Yearly", { exact: true }).click();
  await page.locator('a[href="/signup?plan=growth&cycle=yearly"]').first().click();
  await expect(page).toHaveURL(/\/signup\?plan=growth&cycle=yearly/);
  await expect(page.getByRole("radio", { name: /Growth/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.locator("#company_name").fill(company);
  await page.locator("#state").selectOption("Madhya Pradesh");
  await page.locator("#city").fill("Bhopal");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.locator("#owner_name").fill(owner.name);
  await page.locator("#owner_email").fill(owner.email);
  await page.locator("#owner_phone").fill(owner.phone);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText(/Growth · yearly/)).toBeVisible();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText(/Accept the Terms/)).toBeVisible();
  await page.locator("#accept_terms").click();
  await page.getByRole("button", { name: "Submit application" }).click();

  await page.waitForURL(/\/signup\/status\//);
  statusUrl = page.url();
  await expect(page.getByText(/on the waitlist of/)).toBeVisible();
  await expect(page.getByText(/Online payment .* is coming soon/)).toBeVisible();

  await page.goto("/");
  await expect.poll(() => waitlistCount(page)).toBe(before + 1);
});

test("the system admin activates the application and the owner gets an invite", async ({ page, browser }) => {
  await signIn(page, USERS.sysadmin);
  await page.goto("/system/applications");
  const row = page.getByTestId(`application-${owner.email}`);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Activate" }).click();
  await page.locator("#activate-ref").fill("UTR E2E-1");
  await page.getByRole("button", { name: /Mark paid and activate/ }).click();
  await expect(page.getByText(/Workspace created/)).toBeVisible();

  const link = await inviteLink(owner.email);
  expect(link).toContain("type=invite");

  const ctx = await browser.newContext();
  const visitor = await ctx.newPage();
  await visitor.goto(statusUrl);
  await expect(visitor.getByText("Check your email")).toBeVisible();

  await visitor.goto(link);
  await visitor.waitForURL(/\/welcome/, { timeout: 60_000 });
  await expect(visitor.getByText(`Your ${company} workspace is ready.`)).toBeVisible();
  await visitor.locator("#welcome-password").fill("Welcome123!");
  await visitor.locator("#welcome-confirm").fill("Welcome123!");
  await visitor.getByRole("button", { name: "Save password and continue" }).click();
  await visitor.waitForURL(/\/dashboard/, { timeout: 60_000 });

  await visitor.goto("/settings?tab=billing");
  await expect(visitor.getByText("Growth plan")).toBeVisible();
  await expect(visitor.getByText("UTR E2E-1")).toBeVisible();
  await ctx.close();
});
