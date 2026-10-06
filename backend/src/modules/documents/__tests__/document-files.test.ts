import { describe, expect, it } from "vitest";
import { renderDocumentCsv, renderDocumentHtml, renderDocumentPdf } from "../document-files.js";

describe("document file renderers", () => {
  const payload = { student: { name: "Test Student", rollNo: "12" }, amount: 123.45 };
  it("produces a valid PDF header and EOF marker", () => {
    const pdf = renderDocumentPdf(payload, "Test Document");
    expect(pdf.subarray(0, 8).toString("binary")).toContain("%PDF-1.4");
    expect(pdf.toString("binary").endsWith("%%EOF\n")).toBe(true);
  });
  it("produces downloadable HTML with escaped content", () => {
    const html = renderDocumentHtml({ note: "<script>" }, "Test").toString("utf8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("produces RFC4180-compatible quoted CSV rows", () => {
    const csv = renderDocumentCsv({ name: "A, B", value: 42 }).toString("utf8");
    expect(csv).toContain('"Field","Value"');
    expect(csv).toContain('"name","A, B"');
  });
});
