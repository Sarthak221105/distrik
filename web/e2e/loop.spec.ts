import { expect, test } from "@playwright/test";
import { signIn, USERS } from "./helpers";

// The headline loop (PRD 4): a buyer writes on WhatsApp, the AI answers with
// prices only evaluate_offer returned, a lowball opens an approval that the
// owner sees. Runs through the manufacturer's own WhatsApp test sandbox and
// the fallback agent (no Meta or Claude keys needed).
test("buyer message -> AI price within rules -> approval for the owner", async ({ page }) => {
  const phone = `+91 97${String(Date.now()).slice(-8)}`;
  const buyer = `E2E Traders ${Date.now().toString().slice(-5)}`;

  await signIn(page, USERS.owner);
  await page.goto("/settings?tab=whatsapp-test");
  await page.getByText("New phone", { exact: true }).click();
  await page.locator("#sim-phone").fill(phone);
  await page.locator("#sim-profile").fill(buyer);

  await page.locator("#sim-text").fill("Rate kya hai 5L mustard oil ka? 100 jar chahiye");
  await page.getByRole("button", { name: /Send as buyer/ }).click();
  // The AI replies (pg_cron -> ai-reply -> consent and review gates -> outbound-sender).
  await expect(page.locator("li").filter({ hasText: /^AI/ }).filter({ hasText: /₹/ }).first()).toBeVisible({ timeout: 60_000 });

  await page.locator("#sim-text").fill("540 me de do");
  await page.getByRole("button", { name: /Send as buyer/ }).click();
  await expect(page.getByText(/558/).last()).toBeVisible({ timeout: 60_000 });

  await page.goto("/approvals");
  await expect(page.getByText(buyer).first()).toBeVisible({ timeout: 30_000 });
});
