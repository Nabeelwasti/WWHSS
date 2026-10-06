import { test, expect } from "@playwright/test";

test("public school home and login entry render in a real browser", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("Workers Welfare Higher Secondary School")).toBeVisible();
  await expect(page.getByRole("button", { name: /login|log in/i })).toBeVisible();
});

test("real seeded administrator can authenticate and reach the protected dashboard", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /login|log in/i }).click();
  await page.getByLabel(/email/i).fill(process.env.E2E_ADMIN_EMAIL || "admin@wwhs.local");
  await page.getByLabel(/password/i).fill(process.env.E2E_ADMIN_PASSWORD || "ChangeMe!123");
  await page.getByRole("button", { name: /login|sign in|submit/i }).click();
  await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
});
