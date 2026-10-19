import { expect, test } from "@playwright/test";
import { signIn, USERS } from "./helpers";

test("rep sees today's work and only assigned leads", async ({ page }) => {
  await signIn(page, USERS.rep);
  await expect(page).toHaveURL(/\/rep\/today/);
  await expect(page.getByText(/Namaste, Ravi/)).toBeVisible();
  await page.goto("/rep/leads");
  await expect(page.getByText("Shree Balaji Distributors")).toBeVisible();
  // Agrawal Trading Company is assigned to the other rep.
  await expect(page.getByText("Agrawal Trading Company")).toHaveCount(0);
});

test("rep logs a call offline and it syncs on reconnect", async ({ page, context }) => {
  await signIn(page, USERS.rep);
  await page.goto("/rep/leads");
  await page.getByText("Shree Balaji Distributors").click();
  await page.getByRole("tab", { name: "Log" }).click();

  await context.setOffline(true);
  await page.getByText("Interested", { exact: true }).click();
  await page.locator("#call-notes").fill("Offline call: wants 100 jars, call back Monday");
  await page.getByRole("button", { name: /Save offline|Save call log/ }).click();
  await expect(page.getByText(/Saved offline, will sync/)).toBeVisible();

  // Back online: the queued write replays through the idempotent RPC.
  await context.setOffline(false);
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByText(/Offline call: wants 100 jars/).first()).toBeVisible({ timeout: 90_000 });
});
