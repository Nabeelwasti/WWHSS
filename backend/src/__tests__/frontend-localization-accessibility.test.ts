import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendSrcDir = path.resolve(__dirname, "../../../frontend/src");

describe("Frontend Localization & Accessibility Hardening Verification Suite", () => {
  it("verifies 100% parity and non-empty values between English and Urdu dictionaries in i18n.tsx", () => {
    const i18nPath = path.resolve(frontendSrcDir, "i18n.tsx");
    expect(fs.existsSync(i18nPath)).toBe(true);
    const content = fs.readFileSync(i18nPath, "utf-8");

    // Extract dictionary object content
    const enBlock = content.match(/en:\s*\{([\s\S]*?)\},\s*ur:/)?.[1] || "";
    const urBlock = content.match(/ur:\s*\{([\s\S]*?)\}\s*,\s*\}\s*as const;/)?.[1] || "";

    const enKeys = new Set([...enBlock.matchAll(/"([^"]+)":/g)].map((m) => m[1]));
    const urKeys = new Set([...urBlock.matchAll(/"([^"]+)":/g)].map((m) => m[1]));

    const missingInUrdu = [...enKeys].filter((k) => !urKeys.has(k));
    const missingInEnglish = [...urKeys].filter((k) => !enKeys.has(k));

    expect(missingInUrdu, `The following English keys are missing from the Urdu dictionary: ${missingInUrdu.join(", ")}`).toEqual([]);
    expect(missingInEnglish, `The following Urdu keys are missing from the English dictionary: ${missingInEnglish.join(", ")}`).toEqual([]);
    expect(enKeys.size).toBeGreaterThan(40);
  });

  it("routes the campus shell's user-visible navigation through translated English/Urdu keys", () => {
    const i18nPath = path.resolve(frontendSrcDir, "i18n.tsx");
    const appPath = path.resolve(frontendSrcDir, "App.tsx");
    const languageToggleSource = fs.readFileSync(i18nPath, "utf-8");
    const appSource = fs.readFileSync(appPath, "utf-8");

    for (const pair of [
      ['"app.digitalCampus": "Digital Campus"', '"app.digitalCampus": "ڈیجیٹل کیمپس"'],
      ['"app.nav.teacher": "Teacher workspace"', '"app.nav.teacher": "اساتذہ کا ورک اسپیس"'],
      ['"app.group.workspace": "Workspace"', '"app.group.workspace": "ورک اسپیس"'],
      ['"app.searchPlaceholder": "Find a tool or workspace…"', '"app.searchPlaceholder": "ٹول یا ورک اسپیس تلاش کریں…"'],
    ]) {
      expect(languageToggleSource).toContain(pair[0]);
      expect(languageToggleSource).toContain(pair[1]);
    }

    expect(appSource).toContain('label: t("app.nav.teacher")');
    expect(appSource).toContain('description: t("app.desc.operations")');
    expect(appSource).toContain('<h2>{groupLabels[group]}</h2>');
    expect(appSource).toContain('aria-label={t("app.navLabel")}');
    expect(languageToggleSource).toContain('aria-label={t("app.changeLanguage")}');
  });

  it("verifies accessible ARIA roles, live regions, and semantic table headers across major component files", () => {
    const filesToInspect = [
      "components/UpdateToast.tsx",
      "components/NotificationsBell.tsx",
      "components/AiChatWidget.tsx",
      "pages/LoginPage.tsx",
      "pages/AdminPage.tsx",
      "pages/AttendancePage.tsx",
      "pages/QuizzesPage.tsx",
    ];

    for (const relFile of filesToInspect) {
      const filePath = path.resolve(frontendSrcDir, relFile);
      expect(fs.existsSync(filePath), `Component file ${relFile} must exist`).toBe(true);
      const fileContent = fs.readFileSync(filePath, "utf-8");

      if (relFile === "components/UpdateToast.tsx") {
        expect(fileContent).toContain('role="status"');
        expect(fileContent).toContain('aria-live="polite"');
      }
      if (relFile === "components/NotificationsBell.tsx") {
        expect(fileContent).toContain('aria-label=');
        expect(fileContent).toContain('aria-expanded=');
      }
      if (relFile === "pages/AdminPage.tsx" || relFile === "pages/AttendancePage.tsx") {
        expect(fileContent).toContain('<th scope="col">');
      }
      if (relFile === "pages/LoginPage.tsx") {
        expect(fileContent).toContain('role="alert"');
      }
    }
  });

  it("verifies Service Worker update toast integration and PWA cache handling in sw.js and UpdateToast.tsx", () => {
    const swPath = path.resolve(frontendSrcDir, "../public/sw.js");
    const toastPath = path.resolve(frontendSrcDir, "components/UpdateToast.tsx");

    expect(fs.existsSync(swPath)).toBe(true);
    expect(fs.existsSync(toastPath)).toBe(true);

    const swContent = fs.readFileSync(swPath, "utf-8");
    const toastContent = fs.readFileSync(toastPath, "utf-8");

    // Network-first navigation check
    expect(swContent).toContain('request.mode === "navigate"');
    // Non-caching /api check
    expect(swContent).toContain('url.pathname.startsWith("/api")');
    // SKIP_WAITING handling
    expect(swContent).toContain('type === "SKIP_WAITING"');
    // ESM extension check
    expect(toastContent).toContain('import { useLanguage } from "../i18n.js";');
  });
});
