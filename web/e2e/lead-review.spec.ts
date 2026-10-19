import { expect, test } from "@playwright/test";
import { signIn, USERS } from "./helpers";

// Manufacturer-owned lead review: discovered prospects wait for the
// manufacturer's own team; nobody at Distrik is involved.
test("the sales head reviews and approves a pending prospect", async ({ page }) => {
  await signIn(page, USERS.head);
  await page.goto("/leads?status=pending");
  await expect(page.getByRole("heading", { name: "Lead Review" })).toBeVisible();

  // Pick whichever prospect is first in the queue (earlier runs may have approved others).
  const firstCheckbox = page.getByRole("checkbox", { name: /^Select (?!all)/ }).first();
  await expect(firstCheckbox).toBeVisible();
  const name = ((await firstCheckbox.getAttribute("aria-label")) ?? "").replace(/^Select /, "");
  await firstCheckbox.click();
  await page.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: /Approve/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Approve 1/ }).click();

  await page.goto("/leads?status=approved");
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
});

test("a flagged duplicate shows both records for a decision", async ({ page }) => {
  await signIn(page, USERS.owner);
  await page.goto("/leads?status=needs_review");
  await page.getByRole("row").filter({ hasText: "Orange City Spice Co" }).getByText("Orange City Spice Co").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Orange City Spices").first()).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: /Keep separate/ }).first()).toBeVisible();
});

test("a rep never sees prospects that are still under review", async ({ page }) => {
  await signIn(page, USERS.rep);
  await page.goto("/rep/leads");
  await expect(page.getByText("Vidarbha Masala Distributors")).toHaveCount(0);
  await page.goto("/leads");
  await expect(page).toHaveURL(/\/rep\//);
});
