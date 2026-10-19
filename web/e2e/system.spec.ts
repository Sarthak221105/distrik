import { expect, test } from "@playwright/test";
import { signIn, USERS } from "./helpers";

test("the system admin lands on platform health and sees no buyer data", async ({ page }) => {
  await signIn(page, USERS.sysadmin);
  await expect(page).toHaveURL(/\/system\/health/);
  await expect(page.getByRole("heading", { name: "Platform health" })).toBeVisible();
  await expect(page.getByText(/no buyer or conversation data/i)).toBeVisible();
  for (const [path, heading] of [
    ["/system/tenants", "Tenants"],
    ["/system/sources", "Sources"],
    ["/system/templates", "Templates"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
});

test("the old ops console is gone", async ({ page }) => {
  await signIn(page, USERS.sysadmin);
  await page.goto("/ops/qa");
  await expect(page).not.toHaveURL(/\/ops\//);
  await page.goto("/leads");
  await expect(page).toHaveURL(/\/system\//);
});

test("a manufacturer cannot open the system console", async ({ page }) => {
  await signIn(page, USERS.owner);
  await page.goto("/system/health");
  await expect(page).toHaveURL(/\/dashboard/);
});
