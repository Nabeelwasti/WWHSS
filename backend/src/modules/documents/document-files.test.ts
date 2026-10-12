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

  it("neutralizes spreadsheet formulas in untrusted CSV string values", () => {
    const csv = renderDocumentCsv({
      equals: "=1+1",
      plus: "+SUM(1,1)",
      minus: "-2+3",
      at: "@SUM(1,1)",
      leadingControl: "\t=HYPERLINK(\"https://attacker.invalid\",\"click\")",
      numeric: -25,
    }).toString("utf8");
    expect(csv).toContain("\"'=1+1\"");
    expect(csv).toContain("\"'+SUM(1,1)\"");
    expect(csv).toContain("\"'-2+3\"");
    expect(csv).toContain("\"'@SUM(1,1)\"");
    expect(csv).toContain("\"'\t=HYPERLINK");
    expect(csv).toContain("\"'-25\"");
  });

  it("generates a real XLSX ZIP package", () => {
    const xlsx = renderDocumentXlsx(payload, "Student Report");
    expect(xlsx.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(xlsx.length).toBeGreaterThan(500);
  });
});
