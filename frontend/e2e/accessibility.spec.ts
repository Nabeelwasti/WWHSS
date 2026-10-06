import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public landing page has no WCAG violations", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("public landing page exposes a usable document structure", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.locator("html")).toHaveAttribute("lang", /.+/);
  await expect(page.locator("main")).toHaveCount(1);

  const headings = page.locator("h1");
  await expect(headings.first()).toBeVisible();

  const interactive = page.locator("a,button,input,select,textarea").filter({ visible: true });
  const count = await interactive.count();
  for (let index = 0; index < count; index += 1) {
    const element = interactive.nth(index);
    const tag = await element.evaluate((node) => node.tagName);
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON") {
      const accessibleName = await element.getAttribute("aria-label");
      const text = (await element.textContent())?.trim();
      const name = accessibleName || text;
      expect(name, `${tag} at index ${index} must have an accessible name`).toBeTruthy();
    }
  }
});
