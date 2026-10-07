import { describe, expect, it } from "vitest";
import { renderDocumentCsv, renderDocumentHtml, renderDocumentPdf, renderDocumentXlsx } from "./document-files.js";

describe("document file renderers", () => {
  const payload = {
    studentName: "محمد علی",
    guardianName: "Syed Nabeel Wasti",
    remarks: "یہ طالب علم محنتی ہے — Excellent progress",
    subject: "Mathematics / ریاضی",
  };

  it("preserves Unicode in HTML and CSV", () => {
    expect(renderDocumentHtml(payload).toString("utf8")).toContain("محمد علی");
    expect(renderDocumentCsv(payload).toString("utf8")).toContain("یہ طالب علم");
  });

  it("generates an embedded-font Unicode PDF instead of replacing Urdu with question marks", () => {
    const pdf = renderDocumentPdf(payload, "Student Report / طالب علم رپورٹ");
    expect(pdf.subarray(0, 8).toString("ascii")).toContain("%PDF-");
    expect(pdf.length).toBeGreaterThan(100_000);
  });

  it("generates a real XLSX ZIP package", () => {
    const xlsx = renderDocumentXlsx(payload, "Student Report");
    expect(xlsx.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(xlsx.length).toBeGreaterThan(500);
  });
});
