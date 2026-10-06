import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public landing page has no automatically detectable WCAG violations", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
