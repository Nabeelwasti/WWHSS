import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface OpenApiDoc {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, unknown>>;
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
  });

  it("verifies all expected core API modules and endpoints are documented in the contract", () => {
    const openapiPath = path.resolve(__dirname, "../../openapi.json");
    const doc = JSON.parse(fs.readFileSync(openapiPath, "utf-8")) as OpenApiDoc;

    const expectedPaths = [
      "/health",
      "/api/auth/login",
      "/api/auth/refresh",
      "/api/auth/logout",
      "/api/auth/change-password",
      "/api/auth/me",
      "/api/auth/ai-consent",
      "/api/attendance/mark",
      "/api/attendance/student/{studentProfileId}",
      "/api/attendance/student/{studentProfileId}/summary",
      "/api/attendance/class",
      "/api/academics/classes",
      "/api/academics/subjects",
      "/api/academics/sections/{sectionId}/students",
      "/api/academics/my-classes",
      "/api/academics/academic-years",
      "/api/academics/classes",
      "/api/academics/sections",
      "/api/academics/subjects",
      "/api/academics/enroll",
      "/api/academics/link-guardian",
      "/api/users",
      "/api/users/roles",
      "/api/users/{userId}/roles",
      "/api/users/roles/{userRoleId}",
      "/api/users/{userId}/deactivate",
      "/api/users/{userId}/reset-password",
      "/api/lms/courses",
      "/api/lms/lessons",
      "/api/lms/courses/{courseId}/lessons",
      "/api/lms/resources",
      "/api/lms/assignments",
      "/api/lms/courses/{courseId}/assignments",
      "/api/lms/my-assignments/{studentProfileId}",
      "/api/lms/my-quizzes/{studentProfileId}",
      "/api/lms/submissions",
      "/api/lms/assignments/{assignmentId}/submissions",
      "/api/lms/submissions/{submissionId}/grade",
      "/api/lms/quizzes",
      "/api/lms/quizzes/questions",
      "/api/lms/quizzes/{quizId}",
      "/api/lms/quizzes/{quizId}/attempts",
      "/api/lms/my-quiz-attempts/{studentProfileId}",
      "/api/exams",
      "/api/exams/results",
      "/api/exams/results/student/{studentProfileId}",
      "/api/timetable/slots",
      "/api/timetable/class",
      "/api/timetable/my-schedule",
      "/api/timetable/rooms",
      "/api/notifications",
      "/api/notifications/{id}/read",
      "/api/library/books",
      "/api/library/copies",
      "/api/library/search",
      "/api/library/issue",
      "/api/library/loans/{loanId}/return",
      "/api/library/my-loans",
      "/api/finance/fee-structures",
      "/api/finance/generate-invoices",
      "/api/finance/payments",
      "/api/finance/student/{studentProfileId}",
      "/api/cms/pages/{slug}",
      "/api/cms/notices",
      "/api/cms/events",
      "/api/cms/gallery",
      "/api/cms/pages",
      "/api/cms/pages/{slug}/publish",
      "/api/cms/pages/{slug}/unpublish",
      "/api/cms/admin/pages",
      "/api/ai/ask",
    ];

    for (const p of expectedPaths) {
      expect(doc.paths[p], `Path ${p} should be documented in openapi.json`).toBeDefined();
    }
  });
});
