/**
 * CSV writer with spreadsheet-formula-injection protection. A cell whose
 * value begins with = + - @ TAB or CR is prefixed with a single quote so
 * Excel/Sheets/LibreOffice treat it as text, not a formula
 * (docs: M05 "protect spreadsheet exports from formula injection").
 * Pure and dependency-free so it is unit-tested in isolation.
 */
const DANGEROUS = /^[=+\-@\t\r]/;

export function escapeCell(value: unknown): string {
  if (value == null) return "";
  let s = typeof value === "string" ? value : JSON.stringify(value);
  if (DANGEROUS.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: readonly (keyof T & string)[],
): string {
  const header = columns.map((c) => escapeCell(c)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCell(row[c])).join(",")).join("\r\n");
  return rows.length ? `${header}\r\n${body}\r\n` : `${header}\r\n`;
}

/** Minimal RFC-4180 CSV parser: quoted fields, embedded quotes/newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
