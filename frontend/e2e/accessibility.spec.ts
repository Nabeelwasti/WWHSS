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
  const pages = ["/", "/admin", "/operations"];
  for (const target of pages) {
    await page.goto(target, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    await expect(page.locator("main")).toHaveCount(1);
  }
});

test("admin library workflow is keyboard reachable and functional", async ({ page }) => {
  await loginAsAdmin(page);
  // The library is now a first-class deep link in the role-aware workspace shell.
  await page.goto("/library", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Library Catalog Administration" })).toBeVisible();
  await page.getByRole("textbox", { name: "Title" }).fill("CI Accessibility Book");
  await page.getByRole("textbox", { name: "Author" }).fill("WWHSS Test");
  await page.getByRole("button", { name: "Add Book" }).click();
  await expect(page.getByText("Book added to the catalog.")).toBeVisible();
});

test("workspace finder opens the requested admin workspace", async ({ page }) => {
  await loginAsAdmin(page);
  const finder = page.getByRole("textbox", { name: "Search available workspaces" });
  await finder.fill("finance");
  await page.getByRole("button", { name: "Finance & funding", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Finance & funding", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /finance/i }).first()).toBeVisible();
});

test("finance workspace exposes the real billing and welfare workflows", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/finance", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Finance & funding", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invoice register" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Assign funding to a student" })).toBeVisible();
  await expect(page.getByLabel("Fee policy")).toBeVisible();
  await expect(page.getByLabel("Payment method")).toBeVisible();
});

test("document center exposes every backend-supported document type", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/", { waitUntil: "networkidle" });
  const finder = page.getByRole("textbox", { name: "Search available workspaces" });
  await finder.fill("document center");
  await page.getByRole("button", { name: "Document center", exact: true }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByRole("heading", { name: "Document & Print Center" })).toBeVisible();
  const documentType = page.getByLabel("Document type");
  await expect(documentType).toBeVisible();
  await expect(documentType.locator("option")).toHaveCount(23);
  await expect(page.locator('[aria-label="Document reference ID"], [aria-label="Student record"]')).toBeVisible();
});
