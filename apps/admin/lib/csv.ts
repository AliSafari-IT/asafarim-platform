/**
 * CSV serialization for console exports.
 *
 * Exports are a compliance surface: they leave the console and land in
 * spreadsheets, so the escaping here is deliberately strict rather than
 * clever.
 */

export type CsvCell = string | number | boolean | Date | null | undefined;

function serializeCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function escapeCell(value: CsvCell): string {
  const text = serializeCell(value);
  // A leading =, +, - or @ makes Excel/Sheets evaluate the cell as a
  // formula. Prefix with a quote so exported data can never execute.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  if (/["\n\r,]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  // CRLF + BOM so Excel opens UTF-8 exports without mangling accents.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function csvResponse(filename: string, body: string): Response {
  const stamped = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${stamped}"`,
      // Exports contain personal data — never let a proxy hold a copy.
      "Cache-Control": "no-store, private",
    },
  });
}
