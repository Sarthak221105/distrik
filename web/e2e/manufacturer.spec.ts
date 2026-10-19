import { expect, test } from "@playwright/test";
import { signIn, USERS } from "./helpers";

test("owner lands on the dashboard and sees the pending approval", async ({ page }) => {
  await signIn(page, USERS.owner);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Namaste/ })).toBeVisible();
  await expect(page.getByText("Shree Balaji Distributors").first()).toBeVisible();
});

test("approval card shows the ask against the floor and hard minimum", async ({ page }) => {
  await signIn(page, USERS.owner);
  await page.goto("/approvals");
  await expect(page.getByRole("heading", { name: "Approval queue" })).toBeVisible();
  await expect(page.getByText(/Floor ₹558/).first()).toBeVisible();
  await expect(page.getByText(/Hard min ₹540/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve ₹/ }).first()).toBeVisible();
});

test("a mismatched PO cannot be confirmed without an override reason", async ({ page }) => {
  await signIn(page, USERS.owner);
  await page.goto("/quotations");
  await page.getByRole("tab", { name: /Purchase orders/ }).click();
  await page.getByText("Rathore Agencies").first().click();
  await expect(page.getByText(/differs from the quotation/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Confirm with override/ })).toBeVisible();
});

test("start sales shows a parsed plan before anything runs", async ({ page }) => {
  await signIn(page, USERS.owner);
  await page.goto("/campaigns/new");
  await page.getByRole("textbox").first().fill("Find 60 spice distributors in Jaipur");
  await page.getByRole("button", { name: /Preview/ }).click();
  await expect(page.getByText(/Jaipur/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Confirm|Start/ }).first()).toBeVisible();
});

test("the second tenant never sees Shakti data", async ({ page }) => {
  await signIn(page, USERS.otherOwner);
  await page.goto("/pipeline");
  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
  await expect(page.getByText("Shree Balaji Distributors")).toHaveCount(0);
});
