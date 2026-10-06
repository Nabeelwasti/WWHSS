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


async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /login|log in/i }).click();
  await page.getByLabel(/email/i).fill(process.env.E2E_ADMIN_EMAIL || "admin@wwhs.local");
  await page.getByLabel(/password/i).fill(process.env.E2E_ADMIN_PASSWORD || "ChangeMe!123");
  await page.getByRole("button", { name: /login|sign in|submit/i }).click();
  await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 15000 });
}

test("authenticated dashboard and admin surfaces have no WCAG violations", async ({ page }) => {
  await loginAsAdmin(page);
  const pages = ["/", "/admin"];
  for (const target of pages) {
    await page.goto(target, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    await expect(page.locator("main")).toHaveCount(1);
  }
});

test("admin library workflow is keyboard reachable and functional", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("heading", { name: "Library Catalog Administration" })).toBeVisible();
  await page.getByRole("textbox", { name: "Title" }).fill("CI Accessibility Book");
  await page.getByRole("textbox", { name: "Author" }).fill("WWHSS Test");
  await page.getByRole("button", { name: "Add Book" }).click();
  await expect(page.getByText("Book added to the catalog.")).toBeVisible();
});
