import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";

function flatten(value: unknown, prefix = ""): Array<[string, string]> {
  if (value === null || value === undefined) return [[prefix, ""]];
  if (Array.isArray(value)) return value.flatMap((item, index) => flatten(item, prefix ? `${prefix}.${index}` : String(index)));
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
  return [[prefix, String(value)]];
}

export function renderDocumentCsv(payload: unknown): Buffer {
  const rows = flatten(payload);
  const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return Buffer.from([["Field", "Value"], ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(",")).join("\r\n") + "\r\n", "utf8");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function renderDocumentHtml(payload: unknown, title = "WWHS Digital Campus Document"): Buffer {
  const rows = flatten(payload).map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td dir="auto">${escapeHtml(value)}</td></tr>`).join("");
  const html = `<!doctype html><html lang="en" dir="auto"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#111}h1{font-size:20px;text-align:center;margin-bottom:18px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #bbb;padding:6px;text-align:start;vertical-align:top;unicode-bidi:plaintext}th{width:32%;background:#f3f4f6}</style></head><body><h1>${escapeHtml(title)}</h1><table>${rows}</table></body></html>`;
  return Buffer.from(html, "utf8");
}

type Table = { offset: number; length: number };
type FontInfo = {
  data: Buffer;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  bbox: [number, number, number, number];
  cmap: (codePoint: number) => number;
  width: (glyphId: number) => number;
};

function readTables(data: Buffer): Map<string, Table> {
  const numTables = data.readUInt16BE(4);
  const tables = new Map<string, Table>();
  for (let i = 0; i < numTables; i++) {
    const p = 12 + i * 16;
    tables.set(data.toString("ascii", p, p + 4), { offset: data.readUInt32BE(p + 8), length: data.readUInt32BE(p + 12) });
  }
  return tables;
}

function loadFont(): FontInfo {
  const candidates = [
    path.resolve(process.cwd(), "assets/fonts/NotoNaskhArabic-Regular.ttf.b64"),
    path.resolve(process.cwd(), "backend/assets/fonts/NotoNaskhArabic-Regular.ttf.b64"),
  ];
  const encodedPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!encodedPath) throw new Error("Unicode PDF font asset is missing");
  const data = Buffer.from(fs.readFileSync(encodedPath, "utf8").replace(/\s+/g, ""), "base64");
  const tables = readTables(data);
  const head = tables.get("head");
  const hhea = tables.get("hhea");
  const hmtx = tables.get("hmtx");
  const cmapTable = tables.get("cmap");
  if (!head || !hhea || !hmtx || !cmapTable) throw new Error("Unicode PDF font is missing required TrueType tables");

  const unitsPerEm = data.readUInt16BE(head.offset + 18);
  const bbox: [number, number, number, number] = [
    data.readInt16BE(head.offset + 36),
    data.readInt16BE(head.offset + 38),
    data.readInt16BE(head.offset + 40),
    data.readInt16BE(head.offset + 42),
  ];
  const ascent = data.readInt16BE(hhea.offset + 4);
  const descent = data.readInt16BE(hhea.offset + 6);
  const numHMetrics = data.readUInt16BE(hhea.offset + 34);

  const cmapOffset = cmapTable.offset;
  const numSubtables = data.readUInt16BE(cmapOffset + 2);
  let cmapStart = 0;
  let cmapFormat = 0;
  for (let i = 0; i < numSubtables; i++) {
    const p = cmapOffset + 4 + i * 8;
    const platform = data.readUInt16BE(p);
    const encoding = data.readUInt16BE(p + 2);
    const offset = data.readUInt32BE(p + 4);
    const format = data.readUInt16BE(cmapOffset + offset);
    if (format === 12 && (platform === 3 || platform === 0)) { cmapStart = cmapOffset + offset; cmapFormat = 12; break; }
    if (format === 4 && (platform === 3 || platform === 0)) { cmapStart = cmapOffset + offset; cmapFormat = 4; }
    void encoding;
  }
  if (!cmapStart) throw new Error("Unicode PDF font has no supported Unicode cmap");

  const cmap = (codePoint: number): number => {
    if (cmapFormat === 12) {
      const groups = data.readUInt32BE(cmapStart + 12);
      let lo = 0, hi = groups - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const p = cmapStart + 16 + mid * 12;
        const start = data.readUInt32BE(p), end = data.readUInt32BE(p + 4);
        if (codePoint < start) hi = mid - 1;
        else if (codePoint > end) lo = mid + 1;
        else return data.readUInt32BE(p + 8) + codePoint - start;
      }
      return 0;
    }
    const segCount = data.readUInt16BE(cmapStart + 6) / 2;
    const endCode = cmapStart + 14;
    const startCode = endCode + segCount * 2 + 2;
    const idDelta = startCode + segCount * 2;
    const idRangeOffset = idDelta + segCount * 2;
    for (let i = 0; i < segCount; i++) {
      const end = data.readUInt16BE(endCode + i * 2);
      const start = data.readUInt16BE(startCode + i * 2);
      if (codePoint < start || codePoint > end) continue;
      const delta = data.readInt16BE(idDelta + i * 2);
      const range = data.readUInt16BE(idRangeOffset + i * 2);
      if (range === 0) return (codePoint + delta) & 0xffff;
      const glyphAddress = idRangeOffset + i * 2 + range + (codePoint - start) * 2;
      const glyph = data.readUInt16BE(glyphAddress);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };

  const width = (glyphId: number): number => {
    const metricIndex = Math.min(glyphId, numHMetrics - 1);
    return data.readUInt16BE(hmtx.offset + metricIndex * 4);
  };

  return { data, unitsPerEm, ascent, descent, bbox, cmap, width };
}

type Forms = [number, number, number, number];
const FORMS: Record<number, Forms> = {
  0x0628: [0xfe8f,0xfe90,0xfe91,0xfe92], 0x062a: [0xfe95,0xfe96,0xfe97,0xfe98],
  0x062b: [0xfe99,0xfe9a,0xfe9b,0xfe9c], 0x062c: [0xfe9d,0xfe9e,0xfe9f,0xfea0],
  0x062d: [0xfea1,0xfea2,0xfea3,0xfea4], 0x062e: [0xfea5,0xfea6,0xfea7,0xfea8],
  0x062f: [0xfea9,0xfeaa,0,0], 0x0630: [0xfeab,0xfeac,0,0], 0x0631: [0xfead,0xfeae,0,0],
  0x0632: [0xfeaf,0xfeb0,0,0], 0x0633: [0xfeb1,0xfeb2,0xfeb3,0xfeb4],
  0x0634: [0xfeb5,0xfeb6,0xfeb7,0xfeb8], 0x0635: [0xfeb9,0xfeba,0xfebb,0xfebc],
  0x0636: [0xfebd,0xfebe,0xfebf,0xfec0], 0x0637: [0xfec1,0xfec2,0xfec3,0xfec4],
  0x0638: [0xfec5,0xfec6,0xfec7,0xfec8], 0x0639: [0xfec9,0xfeca,0xfecb,0xfecc],
  0x063a: [0xfecd,0xfece,0xfecf,0xfed0], 0x0641: [0xfed1,0xfed2,0xfed3,0xfed4],
  0x0642: [0xfed5,0xfed6,0xfed7,0xfed8], 0x0643: [0xfed9,0xfeda,0xfedb,0xfedc],
  0x0644: [0xfedd,0xfede,0xfedf,0xfee0], 0x0645: [0xfee1,0xfee2,0xfee3,0xfee4],
  0x0646: [0xfee5,0xfee6,0xfee7,0xfee8], 0x0647: [0xfee9,0xfeea,0xfeeb,0xfeec],
  0x064a: [0xfeef,0xfef0,0xfef1,0xfef2], 0x0627: [0xfe8d,0xfe8e,0,0],
  0x0621: [0xfe80,0,0,0], 0x0626: [0xfe89,0xfe8a,0xfe8b,0xfe8c], 0x0624: [0xfe85,0xfe86,0,0],
  0x0648: [0xfeed,0xfeee,0,0], 0x0622: [0xfe81,0xfe82,0,0],
  0x067e: [0xfb56,0xfb57,0xfb58,0xfb59], 0x0686: [0xfb7a,0xfb7b,0xfb7c,0xfb7d],
  0x0698: [0xfb8a,0xfb8b,0,0], 0x06af: [0xfb92,0xfb93,0xfb94,0xfb95],
  0x0679: [0xfb66,0xfb67,0xfb68,0xfb69], 0x0688: [0xfb88,0xfb89,0,0],
  0x0691: [0xfb8c,0xfb8d,0,0], 0x06ba: [0xfb9e,0xfb9f,0,0],
  0x06d2: [0xfbae,0xfbaf,0,0], 0x06a9: [0xfb8e,0xfb8f,0xfb90,0xfb91],
  0x06c1: [0xfba6,0xfba7,0xfba8,0xfba9], 0x06cc: [0xfbfc,0xfbfd,0xfbfe,0xfbff],
  0x06d3: [0xfbb0,0xfbb1,0,0],
};

function isArabic(cp: number): boolean { return (cp >= 0x0600 && cp <= 0x06ff) || (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfeff); }
function canJoinRight(cp: number): boolean { return Boolean(FORMS[cp]); }
function canJoinLeft(cp: number): boolean { return Boolean(FORMS[cp] && FORMS[cp][2]); }

function shapeArabicRun(text: string): Array<{ cp: number; source: number }> {
  const cps = [...text].map((ch) => ch.codePointAt(0)!);
  const out: Array<{ cp: number; source: number }> = [];
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    const forms = FORMS[cp];
    if (!forms) { out.push({ cp, source: cp }); continue; }
    const prev = cps[i - 1];
    const next = cps[i + 1];
    const joinPrev = prev !== undefined && canJoinLeft(prev) && canJoinRight(cp);
    const joinNext = next !== undefined && canJoinLeft(cp) && canJoinRight(next);
    const form = joinPrev && joinNext ? forms[3] : joinPrev ? forms[1] : joinNext ? forms[2] : forms[0];
    out.push({ cp: form || cp, source: cp });
  }
  return out.reverse();
}

function bidiAndShape(text: string): Array<{ cp: number; source: number }> {
  const out: Array<{ cp: number; source: number }> = [];
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    if (!isArabic(cp)) { out.push({ cp, source: cp }); i += ch.length; continue; }
    let j = i + ch.length;
    while (j < text.length) {
      const n = text.codePointAt(j)!;
      if (!isArabic(n) && !/\p{M}/u.test(String.fromCodePoint(n))) break;
      j += String.fromCodePoint(n).length;
    }
    out.push(...shapeArabicRun(text.slice(i, j)));
    i = j;
  }
  return out;
}

function pdfString(value: string): Buffer { return Buffer.from(value, "ascii"); }
function pdfHex(value: number): string { return value.toString(16).padStart(4, "0"); }

function buildUnicodePdf(font: FontInfo, title: string, lines: string[]): Buffer {
  const shapedLines = lines.map((line) => bidiAndShape(line));
  const used = new Map<number, number>();
  for (const line of shapedLines) for (const item of line) {
    const gid = font.cmap(item.cp);
    if (gid) used.set(gid, item.source);
  }

  const widthEntries = [...used.keys()].sort((a,b)=>a-b).map((gid) => `${gid} [${Math.max(1, Math.round(font.width(gid) / font.unitsPerEm * 1000))}]`).join(" ");
  const w = widthEntries ? `/W [${widthEntries}] ` : "";
  const toUnicodePairs = [...used.entries()];
  const cmapBlocks: string[] = [];
  for (let i = 0; i < toUnicodePairs.length; i += 100) {
    const block = toUnicodePairs.slice(i, i + 100);
    cmapBlocks.push(`${block.length} beginbfchar\n${block.map(([gid, cp]) => `<${pdfHex(gid)}> <${cp.toString(16).padStart(cp > 0xffff ? 6 : 4, "0")}>`).join("\n")}\nendbfchar`);
  }
  const toUnicode = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${cmapBlocks.join("\n")}
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;

  const contentLines: string[] = ["BT", "/F1 11 Tf", "50 800 Td"];
  let lineIndex = 0;
  for (const line of shapedLines) {
    if (lineIndex > 0) contentLines.push("0 -16 Td");
    const codes = line.map((item) => font.cmap(item.cp)).map(pdfHex).join("");
    contentLines.push(`<${codes}> Tj`);
    lineIndex++;
  }
  contentLines.push("ET");
  const content = pdfString(contentLines.join("\n"));

  const objects: Buffer[] = [];
  const add = (value: string | Buffer) => { objects.push(Buffer.isBuffer(value) ? value : Buffer.from(value, "binary")); return objects.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>");
  add(Buffer.concat([pdfString(`<< /Length ${content.length} >>\nstream\n`), content, pdfString("\nendstream")]));
  add(`<< /Type /Font /Subtype /Type0 /BaseFont /NotoNaskhArabic /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 9 0 R >>`);
  add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /NotoNaskhArabic /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 7 0 R /DW 600 ${w}/CIDToGIDMap /Identity >>`);
  add(`<< /Type /FontDescriptor /FontName /NotoNaskhArabic /Flags 4 /FontBBox [${font.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${font.ascent} /Descent ${font.descent} /CapHeight 700 /StemV 80 /FontFile2 8 0 R >>`);
  add(Buffer.concat([pdfString(`<< /Length ${font.data.length} /Length1 ${font.data.length} >>\nstream\n`), font.data, pdfString("\nendstream")]));
  add(`<< /Length ${Buffer.byteLength(toUnicode, "ascii")} >>\nstream\n${toUnicode}\nendstream`);

  let pdf = Buffer.from("%PDF-1.7\n%\\xFF\\xFF\\xFF\\xFF\n", "binary");
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = pdf.length;
    pdf = Buffer.concat([pdf, Buffer.from(`${index + 1} 0 obj\n`, "ascii"), object, Buffer.from("\nendobj\n", "ascii")]);
  });
  const xrefOffset = pdf.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.concat([pdf, Buffer.from(xref, "ascii")]);
}

export function renderDocumentPdf(payload: unknown, title = "WWHS Digital Campus Document"): Buffer {
  const lines: string[] = [title, "", ...flatten(payload).map(([key, value]) => `${key}: ${value}`)];
  const wrapped: string[] = [];
  for (const line of lines) {
    const safe = String(line);
    for (let i = 0; i < safe.length; i += 92) wrapped.push(safe.slice(i, i + 92));
    if (safe.length === 0) wrapped.push("");
  }
  const font = loadFont();
  return buildUnicodePdf(font, title, wrapped.slice(0, 180));
}
