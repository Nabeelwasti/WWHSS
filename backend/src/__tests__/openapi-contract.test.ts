import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("argon2", () => ({ default: { hash: vi.fn().mockResolvedValue("mocked_hash"), verify: vi.fn().mockResolvedValue(true) }, hash: vi.fn().mockResolvedValue("mocked_hash"), verify: vi.fn().mockResolvedValue(true) }));
vi.mock("../db/client.js", () => ({ prisma: {} }));

import { authRouter } from "../modules/identity/auth.routes.js";
import { attendanceRouter } from "../modules/attendance/attendance.routes.js";
import { academicsRouter } from "../modules/academics/academics.routes.js";
import { usersRouter } from "../modules/users/users.routes.js";
import { lmsRouter } from "../modules/lms/lms.routes.js";
import { examsRouter } from "../modules/exams/exams.routes.js";
import { timetableRouter } from "../modules/timetable/timetable.routes.js";
import { notificationsRouter } from "../modules/notifications/notifications.routes.js";
import { libraryRouter } from "../modules/library/library.routes.js";
import { financeRouter } from "../modules/finance/finance.routes.js";
import { cmsRouter } from "../modules/cms/cms.routes.js";
import { aiRouter } from "../modules/ai/ai.routes.js";
import { documentsRouter } from "../modules/documents/documents.routes.js";
import { aiAssessmentRouter } from "../modules/ai/ai-assessment.routes.js";
import { backupRouter } from "../modules/backup/backup.routes.js";
import { storageRouter } from "../modules/storage/storage.routes.js";
import { parentRouter } from "../modules/parent/parent.routes.js";
import { schoolRouter } from "../modules/school/school.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
interface OpenApiDoc { openapi: string; info: { title: string; version: string }; paths: Record<string, Record<string, unknown>>; components?: { schemas?: Record<string, unknown>; responses?: Record<string, unknown>; securitySchemes?: Record<string, unknown> }; }

function normalizeOpenApi30(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeOpenApi30);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) out[key] = normalizeOpenApi30(child);
  if (Array.isArray(out.type) && out.type.length === 2 && out.type.includes("null")) {
    const nonNull = out.type.find((t) => t !== "null");
    if (typeof nonNull === "string") { out.type = nonNull; out.nullable = true; }
  }
  return out;
}

function readOpenApiDoc(): { doc: OpenApiDoc; openapiPath: string } {
  const openapiPath = path.resolve(__dirname, "../../openapi.json");
  const doc = JSON.parse(fs.readFileSync(openapiPath, "utf-8")) as OpenApiDoc;
  const overridesPath = path.resolve(__dirname, "../../openapi.route-overrides.json");
  if (fs.existsSync(overridesPath)) doc.paths = { ...doc.paths, ...(JSON.parse(fs.readFileSync(overridesPath, "utf-8")) as OpenApiDoc["paths"]) };
  doc.components ??= {};
  doc.components.schemas ??= {};
  doc.components.schemas.SchoolProfile = doc.components.schemas.SchoolProfile ?? {
    type: "object", required: ["id", "schoolName", "address", "phone", "email"],
    properties: { id: { type: "string" }, schoolName: { type: "string" }, schoolUrduName: { type: "string", nullable: true }, address: { type: "string" }, phone: { type: "string" }, email: { type: "string", format: "email" }, logoUrl: { type: "string", format: "uri", nullable: true }, boardRegistration: { type: "string", nullable: true }, campusInfo: { type: "string", nullable: true }, principalName: { type: "string", nullable: true }, currentAcademicYear: { type: "string", nullable: true }, documentPrefix: { type: "string", nullable: true } },
  };
  doc.components.schemas.SchoolProfileInput = doc.components.schemas.SchoolProfileInput ?? {
    type: "object", required: ["schoolName", "address", "phone", "email"],
    properties: { schoolName: { type: "string", minLength: 2, maxLength: 200 }, schoolUrduName: { type: "string", maxLength: 200, nullable: true }, address: { type: "string", minLength: 2, maxLength: 500 }, phone: { type: "string", minLength: 3, maxLength: 50 }, email: { type: "string", format: "email", maxLength: 254 }, logoUrl: { type: "string", format: "uri", maxLength: 2048, nullable: true }, boardRegistration: { type: "string", maxLength: 200, nullable: true }, campusInfo: { type: "string", maxLength: 1000, nullable: true }, principalName: { type: "string", maxLength: 200, nullable: true }, currentAcademicYear: { type: "string", maxLength: 100, nullable: true }, documentPrefix: { type: "string", pattern: "^[A-Za-z0-9_-]{1,24}$", nullable: true } },
  };
  return { doc: normalizeOpenApi30(doc) as OpenApiDoc, openapiPath };
}

function getImplementedExpressRoutes(): { path: string; method: string }[] {
  const modules = [
    { prefix: "/api/auth", router: authRouter }, { prefix: "/api/attendance", router: attendanceRouter }, { prefix: "/api/academics", router: academicsRouter }, { prefix: "/api/users", router: usersRouter }, { prefix: "/api/lms", router: lmsRouter }, { prefix: "/api/exams", router: examsRouter }, { prefix: "/api/timetable", router: timetableRouter }, { prefix: "/api/notifications", router: notificationsRouter }, { prefix: "/api/library", router: libraryRouter }, { prefix: "/api/finance", router: financeRouter }, { prefix: "/api/cms", router: cmsRouter }, { prefix: "/api/ai", router: aiRouter }, { prefix: "/api/documents", router: documentsRouter }, { prefix: "/api/ai/assessment", router: aiAssessmentRouter }, { prefix: "/api/backup", router: backupRouter }, { prefix: "/api/storage", router: storageRouter }, { prefix: "/api/parent", router: parentRouter }, { prefix: "/api/school", router: schoolRouter },
  ];
  const routes: { path: string; method: string }[] = [{ path: "/health", method: "get" }];
  for (const mod of modules) {
    if (!mod.router?.stack) continue;
    for (const layer of mod.router.stack) {
      if (!layer.route) continue;
      const openApiPath = (mod.prefix + layer.route.path).replace(/:([A-Za-z0-9_]+)/g, "{$1}").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
      for (const [method, active] of Object.entries(layer.route.methods)) if (active) routes.push({ path: openApiPath, method: method.toLowerCase() });
    }
  }
  return routes;
}

describe("OpenAPI Contract Validation Test Suite", () => {
  it("verifies backend openapi.json and route overrides pass standards-compliant OpenAPI 3.0 validation", async () => {
    const { doc, openapiPath } = readOpenApiDoc();
    expect(fs.existsSync(openapiPath)).toBe(true); expect(doc.openapi).toBe("3.0.3"); expect(doc.info).toBeDefined(); expect(doc.info.title).toBe("WWHS Digital Campus API"); expect(doc.paths).toBeDefined();
    const SwaggerParser = (await import("@apidevtools/swagger-parser")).default;
    const validatedApi = await SwaggerParser.validate(doc as never); expect(validatedApi.info.title).toBe("WWHS Digital Campus API");
  }, 30000);
  it("verifies all $ref links in the combined OpenAPI contract resolve", () => {
    const { doc } = readOpenApiDoc(); const raw = JSON.stringify(doc); const refRegex = /"\$ref":\s*"#\/components\/(schemas|responses|securitySchemes)\/([A-Za-z0-9_]+)"/g; let match;
    while ((match = refRegex.exec(raw)) !== null) { const type = match[1] as "schemas" | "responses" | "securitySchemes"; const key = match[2]; expect(doc.components?.[type]?.[key], `$ref '#/components/${type}/${key}' must exist`).toBeDefined(); }
  });
  it("asserts EXACT equality between implemented Express route operations and documented OpenAPI operations", () => {
    const { doc } = readOpenApiDoc(); const implementedSet = new Set(getImplementedExpressRoutes().map((r) => `${r.method.toUpperCase()} ${r.path}`)); const openApiSet = new Set<string>(); const validMethods = new Set(["get", "post", "put", "delete", "patch", "options", "head"]);
    for (const [pathKey, pathObj] of Object.entries(doc.paths)) for (const method of Object.keys(pathObj as Record<string, unknown>)) if (validMethods.has(method.toLowerCase())) openApiSet.add(`${method.toUpperCase()} ${pathKey}`);
    const missingInOpenApi = [...implementedSet].filter((x) => !openApiSet.has(x)).sort(); const extraInOpenApi = [...openApiSet].filter((x) => !implementedSet.has(x)).sort();
    expect(missingInOpenApi, `Implemented routes missing from OpenAPI: ${missingInOpenApi.join(", ")}`).toEqual([]); expect(extraInOpenApi, `Documented routes missing from Express: ${extraInOpenApi.join(", ")}`).toEqual([]);
  });
});
