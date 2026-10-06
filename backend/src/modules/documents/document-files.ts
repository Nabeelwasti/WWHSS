import { Buffer } from "node:buffer";

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7E]/g, "?");
}

function flatten(value: unknown, prefix = ""): Array<[string, string]> {
  if (value === null || value === undefined) return [[prefix, ""]];
  if (Array.isArray(value)) return value.flatMap((item, index) => flatten(item, prefix ? `${prefix}.${index}` : String(index)));
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
  return [[prefix, String(value)]];
}

export function renderDocumentCsv(payload: unknown): Buffer {
  const rows = flatten(payload);
  const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return Buffer.from([['Field', 'Value'], ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(',')).join('\r\n') + '\r\n', 'utf8');
}

export function renderDocumentHtml(payload: unknown, title = "WWHS Digital Campus Document"): Buffer {
  const rows = flatten(payload).map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#111}h1{font-size:20px;text-align:center;margin-bottom:18px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #bbb;padding:6px;text-align:left;vertical-align:top}th{width:32%;background:#f3f4f6}</style></head><body><h1>${escapeHtml(title)}</h1><table>${rows}</table></body></html>`;
  return Buffer.from(html, 'utf8');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function renderDocumentPdf(payload: unknown, title = "WWHS Digital Campus Document"): Buffer {
  const lines: string[] = [title, "", ...flatten(payload).map(([key, value]) => `${key}: ${value}`)];
  const wrapped: string[] = [];
  for (const line of lines) {
    const safe = String(line);
    for (let i = 0; i < safe.length; i += 92) wrapped.push(safe.slice(i, i + 92));
  }
  const pageLines = wrapped.slice(0, 45);
  const content = ["BT", "/F1 11 Tf", "50 800 Td", ...pageLines.map((line, index) => `${index === 0 ? "" : "0 -16 Td "}( ${escapePdfText(line)} ) Tj`), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n%\xFF\xFF\xFF\xFF\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => { offsets[index + 1] = Buffer.byteLength(pdf, 'binary'); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'binary');
}
