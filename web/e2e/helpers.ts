import type { Page } from "@playwright/test";

// Seeded local test users (supabase/seed.sql); never used outside local dev.
export const USERS = {
  owner: "owner@shakti.test",
  head: "head@shakti.test",
  rep: "rep@shakti.test",
  sysadmin: "admin@platform.test",
  otherOwner: "owner@kaveri.test",
} as const;
const PASSWORD = "Password123!";

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Password" }).click();
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // The first sign-in of a run waits for the dev server to compile the landing page.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 75_000 });
}
