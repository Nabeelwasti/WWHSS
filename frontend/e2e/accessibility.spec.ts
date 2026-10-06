import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public landing page has no critical WCAG violations", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((violation) => violation.impact === "critical");
  expect(critical).toEqual([]);
});
