/**
 * Ekspor data sisi klien ke Excel, Word, atau PDF tanpa dependensi tambahan.
 *
 * - Excel memakai SpreadsheetML/HTML yang dikenali Excel (.xls).
 * - Word memakai HTML yang dikenali Microsoft Word (.doc).
 * - PDF dibuat langsung sebagai berkas PDF 1.4 sederhana (tabel teks).
 */

import type { CsvColumn } from "@/lib/csv";

export type ExportFormat = "xlsx" | "pdf" | "docx" | "csv";

export interface ExportFormatOption {
  format: ExportFormat;
  label: string;
  description: string;
}

export const EXPORT_FORMATS: ExportFormatOption[] = [
  { format: "xlsx", label: "Excel", description: "Berkas .xls, bisa dibuka Excel" },
  { format: "pdf", label: "PDF", description: "Dokumen siap cetak" },
  { format: "docx", label: "Word", description: "Berkas .doc, bisa diedit" },
  { format: "csv", label: "CSV", description: "Teks mentah untuk olahan data" },
];

/** Ambil baris tabel (header + data) dari definisi kolom. */
export function tableRows<T>(rows: T[], columns: CsvColumn<T>[]) {
  const header = columns.map((column) => column.header);
  const body = rows.map((row) =>
    columns.map((column) => {
      const value = column.value(row);
      return value === null || value === undefined ? "" : String(value);
    }),
  );
  return { header, body };
}

function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([`\uFEFF${content}`], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function baseName(filename: string): string {
  return filename.replace(/\.(csv|xls|xlsx|pdf|doc|docx)$/i, "");
}

function htmlDocument(title: string, header: string[], body: string[][]): string {
  const head = header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const rows = body
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td>${escapeHtml(cell)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #2b1a10; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  p.meta { color: #7a6a5f; font-size: 10px; margin: 0 0 14px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbb9a8; padding: 5px 7px; text-align: left; }
  th { background: #efe4d6; font-weight: bold; }
  tr:nth-child(even) td { background: #faf6f1; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="meta">Dicetak ${escapeHtml(new Date().toLocaleString("id-ID"))}</p>
<table>
<thead><tr>${head}</tr></thead>
<tbody>${rows}</tbody>
</table>
</body>
</html>`;
}

/** Unduh tabel sebagai Excel (.xls berbasis HTML, tanpa library). */
export function downloadExcel<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
  title = baseName(filename),
): void {
  const { header, body } = tableRows(rows, columns);
  downloadBlob(
    `${baseName(filename)}.xls`,
    htmlDocument(title, header, body),
    "application/vnd.ms-excel;charset=utf-8",
  );
}

/** Unduh tabel sebagai Word (.doc berbasis HTML, tanpa library). */
export function downloadWord<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
  title = baseName(filename),
): void {
  const { header, body } = tableRows(rows, columns);
  downloadBlob(
    `${baseName(filename)}.doc`,
    htmlDocument(title, header, body),
    "application/msword;charset=utf-8",
  );
}

// ---------------------------------------------------------------------------
// PDF writer minimal
// ---------------------------------------------------------------------------

const WIN_ANSI: Record<string, number> = {
  "€": 128,
  "‚": 130,
  "ƒ": 131,
  "„": 132,
  "…": 133,
  "†": 134,
  "‡": 135,
  "ˆ": 136,
  "‰": 137,
  "Š": 138,
  "‹": 139,
  "Œ": 140,
  "Ž": 142,
  "‘": 145,
  "’": 146,
  "“": 147,
  "”": 148,
  "•": 149,
  "–": 150,
  "—": 151,
  "˜": 152,
  "™": 153,
  "š": 154,
  "›": 155,
  "œ": 156,
  "ž": 158,
  "Ÿ": 159,
};

/** Escape teks ke literal string PDF (ASCII murni, WinAnsi). */
function pdfText(value: string): string {
  let result = "";
  for (const char of value.replace(/[\r\n\t]+/g, " ")) {
    const mapped = WIN_ANSI[char];
    let code = mapped ?? char.charCodeAt(0);
    if (!Number.isFinite(code) || code < 32 || code > 255) code = 63;
    if (char === "(" || char === ")" || char === "\\") {
      result += `\\${char}`;
    } else if (code < 32 || code > 126) {
      result += `\\${code.toString(8).padStart(3, "0")}`;
    } else {
      result += char;
    }
  }
  return result;
}

function wrapText(value: string, maxChars: number): string[] {
  const limit = Math.max(4, maxChars);
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > limit) {
      if (current) {
        lines.push(current);
        current = "";
      }
      let rest = word;
      while (rest.length > limit) {
        lines.push(rest.slice(0, limit));
        rest = rest.slice(limit);
      }
      current = rest;
      continue;
    }
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= limit) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface PdfPage {
  commands: string[];
}

/** Bangun berkas PDF tabel sederhana, satu halaman per kelompok baris. */
function buildPdf(
  title: string,
  header: string[],
  body: string[][],
): string {
  const pageWidth = 842; // A4 landscape
  const pageHeight = 595;
  const margin = 32;
  const titleSize = 14;
  const fontSize = 7.5;
  const lineHeight = 9;
  const cellPaddingX = 3;
  const cellPaddingY = 4;
  const charWidth = fontSize * 0.6;
  const availableWidth = pageWidth - margin * 2;

  const maxLengths = header.map((cell, index) => {
    const dataMax = body.reduce((max, row) => Math.max(max, (row[index] ?? "").length), 0);
    return Math.max(6, Math.min(42, Math.max(cell.length, dataMax)));
  });
  const weightSum = maxLengths.reduce((sum, value) => sum + value, 0) || 1;
  const widths = maxLengths.map((value) => (value / weightSum) * availableWidth);
  const columnX: number[] = [];
  let runningX = margin;
  for (const width of widths) {
    columnX.push(runningX);
    runningX += width;
  }

  const pages: PdfPage[] = [];
  let page: PdfPage = { commands: [] };
  let y = pageHeight - margin - 30;

  const drawText = (
    text: string,
    x: number,
    atY: number,
    font: "F1" | "F2",
    size: number,
  ) => {
    page.commands.push(
      `BT /${font} ${size} Tf ${x.toFixed(2)} ${atY.toFixed(2)} Td (${pdfText(text)}) Tj ET`,
    );
  };

  const drawRow = (cells: string[], isHeader: boolean) => {
    const wrapped = cells.map((cell, index) =>
      wrapText(cell, Math.floor((widths[index] - cellPaddingX * 2) / charWidth)),
    );
    const lineCount = Math.max(1, ...wrapped.map((lines) => lines.length));
    const rowHeight = lineCount * lineHeight + cellPaddingY * 2;

    if (y - rowHeight < margin + 18) {
      pages.push(page);
      page = { commands: [] };
      y = pageHeight - margin - 18;
      // Header diulang di setiap halaman.
      drawRow(header, true);
    }

    if (isHeader) {
      page.commands.push(
        `0.937 0.894 0.839 rg ${margin.toFixed(2)} ${(y - rowHeight).toFixed(2)} ${availableWidth.toFixed(2)} ${rowHeight.toFixed(2)} re f 0 0 0 rg`,
      );
    }

    wrapped.forEach((lines, columnIndex) => {
      const x = columnX[columnIndex] + cellPaddingX;
      lines.forEach((line, lineIndex) => {
        drawText(
          line,
          x,
          y - cellPaddingY - fontSize - lineIndex * lineHeight,
          isHeader ? "F2" : "F1",
          fontSize,
        );
      });
    });

    // Garis horizontal pemisah baris.
    page.commands.push(
      `0.72 0.65 0.58 RG 0.4 w ${margin.toFixed(2)} ${(y - rowHeight).toFixed(2)} m ${(margin + availableWidth).toFixed(2)} ${(y - rowHeight).toFixed(2)} l S`,
    );
    y -= rowHeight;
  };

  drawText(title, margin, pageHeight - margin - 10, "F2", titleSize);
  drawText(
    `Dicetak ${new Date().toLocaleString("id-ID")}`,
    margin,
    pageHeight - margin - 23,
    "F1",
    8,
  );
  y = pageHeight - margin - 38;

  drawRow(header, true);
  body.forEach((row) => drawRow(row, false));
  pages.push(page);

  // Setiap halaman membutuhkan nomor dan footer.
  const fontObjectId = 3;
  const boldFontObjectId = 4;
  const firstPageObjectId = 5;
  const pageIds = pages.map((_, index) => firstPageObjectId + index * 2);

  const objects = new Map<number, string>();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>");
  objects.set(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>");

  pages.forEach((item, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const footer = `BT /F1 7 Tf ${margin} 18 Td (Halaman ${index + 1} dari ${pages.length}) Tj ET`;
    const content = [...item.commands, footer].join("\n");
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R /F2 ${boldFontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.set(
      contentId,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  const maxObjectId = Math.max(...objects.keys());
  for (let id = 1; id <= maxObjectId; id += 1) {
    const object = objects.get(id);
    if (!object) continue;
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${maxObjectId + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let id = 1; id <= maxObjectId; id += 1) {
    const offset = offsets[id] ?? 0;
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

/** Unduh tabel sebagai PDF (dibuat langsung di browser, tanpa library). */
export function downloadPdf<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
  title = baseName(filename),
): void {
  const { header, body } = tableRows(rows, columns);
  const pdf = buildPdf(title, header, body);
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${baseName(filename)}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
