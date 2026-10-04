import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface OpenApiDoc {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
    responses?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
}

describe("OpenAPI Contract Validation Test Suite", () => {
  it("verifies backend openapi.json exists and is valid OpenAPI 3.0.3", () => {
    const openapiPath = path.resolve(__dirname, "../../openapi.json");
    expect(fs.existsSync(openapiPath)).toBe(true);

    const raw = fs.readFileSync(openapiPath, "utf-8");
    const doc = JSON.parse(raw) as OpenApiDoc;

    expect(doc.openapi).toBe("3.0.3");
    expect(doc.info).toBeDefined();
    expect(doc.info.title).toBe("WWHS Digital Campus API");
    expect(doc.paths).toBeDefined();
    expect(Object.keys(doc.paths).length).toBeGreaterThan(30);
  });

  it("verifies all $ref links in openapi.json resolve to existing schemas/responses", () => {
    const openapiPath = path.resolve(__dirname, "../../openapi.json");
    const raw = fs.readFileSync(openapiPath, "utf-8");
    const doc = JSON.parse(raw) as OpenApiDoc;

    const refRegex = /"\$ref":\s*"#\/components\/(schemas|responses)\/([A-Za-z0-9_]+)"/g;
    let match;
    while ((match = refRegex.exec(raw)) !== null) {
      const type = match[1] as "schemas" | "responses";
      const key = match[2];
      expect(doc.components?.[type]?.[key], `$ref '#/components/${type}/${key}' must exist`).toBeDefined();
    }
  });

  it("verifies all core implemented API endpoints and HTTP methods match the contract exactly", () => {
    const openapiPath = path.resolve(__dirname, "../../openapi.json");
    const doc = JSON.parse(fs.readFileSync(openapiPath, "utf-8")) as OpenApiDoc;

    const expectedEndpoints: { path: string; methods: string[] }[] = [
      { path: "/health", methods: ["get"] },
      { path: "/api/auth/login", methods: ["post"] },
      { path: "/api/auth/refresh", methods: ["post"] },
      { path: "/api/auth/logout", methods: ["post"] },
      { path: "/api/auth/change-password", methods: ["post"] },
      { path: "/api/auth/me", methods: ["get"] },
      { path: "/api/auth/ai-consent", methods: ["post"] },
      { path: "/api/attendance/mark", methods: ["post"] },
      { path: "/api/attendance/student/{studentProfileId}", methods: ["get"] },
      { path: "/api/attendance/student/{studentProfileId}/summary", methods: ["get"] },
      { path: "/api/attendance/class", methods: ["get"] },
      { path: "/api/academics/classes", methods: ["get", "post"] },
      { path: "/api/academics/subjects", methods: ["get", "post"] },
      { path: "/api/academics/sections/{sectionId}/students", methods: ["get"] },
      { path: "/api/academics/my-classes", methods: ["get"] },
      { path: "/api/academics/academic-years", methods: ["post"] },
      { path: "/api/academics/sections", methods: ["post"] },
      { path: "/api/academics/enroll", methods: ["post"] },
      { path: "/api/academics/link-guardian", methods: ["post"] },
      { path: "/api/users", methods: ["get", "post"] },
      { path: "/api/users/roles", methods: ["get"] },
      { path: "/api/users/{userId}/roles", methods: ["post"] },
      { path: "/api/users/roles/{userRoleId}", methods: ["delete"] },
      { path: "/api/users/{userId}/deactivate", methods: ["post"] },
      { path: "/api/users/{userId}/reset-password", methods: ["post"] },
      { path: "/api/lms/courses", methods: ["get", "post"] },
      { path: "/api/lms/lessons", methods: ["post"] },
      { path: "/api/lms/courses/{courseId}/lessons", methods: ["get"] },
      { path: "/api/lms/resources", methods: ["post"] },
      { path: "/api/lms/assignments", methods: ["post"] },
      { path: "/api/lms/courses/{courseId}/assignments", methods: ["get"] },
      { path: "/api/lms/my-assignments/{studentProfileId}", methods: ["get"] },
      { path: "/api/lms/my-quizzes/{studentProfileId}", methods: ["get"] },
      { path: "/api/lms/submissions", methods: ["post"] },
      { path: "/api/lms/assignments/{assignmentId}/submissions", methods: ["get"] },
      { path: "/api/lms/submissions/{submissionId}/grade", methods: ["post"] },
      { path: "/api/lms/quizzes", methods: ["post"] },
      { path: "/api/lms/quizzes/questions", methods: ["post"] },
      { path: "/api/lms/quizzes/{quizId}", methods: ["get"] },
      { path: "/api/lms/quizzes/{quizId}/attempts", methods: ["post"] },
      { path: "/api/lms/my-quiz-attempts/{studentProfileId}", methods: ["get"] },
      { path: "/api/exams", methods: ["get", "post"] },
      { path: "/api/exams/results", methods: ["post"] },
      { path: "/api/exams/results/student/{studentProfileId}", methods: ["get"] },
      { path: "/api/timetable/slots", methods: ["post"] },
      { path: "/api/timetable/class", methods: ["get"] },
      { path: "/api/timetable/my-schedule", methods: ["get"] },
      { path: "/api/timetable/rooms", methods: ["get", "post"] },
      { path: "/api/notifications", methods: ["get"] },
      { path: "/api/notifications/{id}/read", methods: ["post"] },
      { path: "/api/library/books", methods: ["post"] },
      { path: "/api/library/copies", methods: ["post"] },
      { path: "/api/library/search", methods: ["get"] },
      { path: "/api/library/issue", methods: ["post"] },
      { path: "/api/library/loans/{loanId}/return", methods: ["post"] },
      { path: "/api/library/my-loans", methods: ["get"] },
      { path: "/api/finance/fee-structures", methods: ["post"] },
      { path: "/api/finance/generate-invoices", methods: ["post"] },
      { path: "/api/finance/payments", methods: ["post"] },
      { path: "/api/finance/student/{studentProfileId}", methods: ["get"] },
      { path: "/api/cms/pages/{slug}", methods: ["get"] },
      { path: "/api/cms/notices", methods: ["get", "post"] },
      { path: "/api/cms/events", methods: ["get", "post"] },
      { path: "/api/cms/gallery", methods: ["get", "post"] },
      { path: "/api/cms/pages", methods: ["post"] },
      { path: "/api/cms/pages/{slug}/publish", methods: ["post"] },
      { path: "/api/cms/pages/{slug}/unpublish", methods: ["post"] },
      { path: "/api/cms/admin/pages", methods: ["get"] },
      { path: "/api/ai/ask", methods: ["post"] },
    ];

    for (const ep of expectedEndpoints) {
      const pathObj = doc.paths[ep.path];
      expect(pathObj, `Path '${ep.path}' must exist in openapi.json`).toBeDefined();
      for (const method of ep.methods) {
        expect(pathObj[method], `Method '${method.toUpperCase()}' for path '${ep.path}' must exist in openapi.json`).toBeDefined();
      }
    }
  });
});
