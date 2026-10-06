import { test, expect } from "playwright/test";

test("public school home and login entry render in a real browser", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await expect(page.getByText("Workers Welfare Higher Secondary School")).toBeVisible();
  await expect(page.getByRole("button", { name: /login|log in/i })).toBeVisible();
});
