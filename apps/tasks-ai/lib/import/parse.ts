import { z } from "zod";
import { parseCsv } from "../export/csv";

/**
 * Deterministic, dependency-light import parsing + validation for CSV and
 * JSON task files. Pure so the dry-run report is unit-testable without a
 * database. The `rowKey` is a stable hash of the source row so re-running
 * an apply is idempotent (docs: M05 "imports are previewable and
 * idempotent").
 */
export type ImportKind = "csv" | "json";

export interface FieldMapping {
  /** target task field -> source column name (CSV) or source key (JSON) */
  title: string;
  description?: string;
  dueDate?: string;
  estimate?: string;
  externalId?: string;
}

export interface StagedRow {
  rowKey: string;
  data: { title: string; description?: string; dueDate?: string; estimate?: number };
  status: "ok" | "error" | "duplicate";
  errors: string[];
}

const rowSchema = z.object({
  title: z.string().min(1, "title is required").max(500),
  description: z.string().max(20000).optional(),
  dueDate: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "dueDate is not a valid date"),
  estimate: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(Number(v)), "estimate is not a number"),
});

function hashRow(obj: Record<string, unknown>): string {
  // FNV-1a over the JSON — stable and fast, no crypto import needed here.
  const s = JSON.stringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function stageRows(
  kind: ImportKind,
  text: string,
  mapping: FieldMapping,
): { rows: StagedRow[]; totalRows: number } {
  const records: Record<string, string>[] = kind === "csv" ? fromCsv(text) : fromJson(text);
  const seen = new Set<string>();

  const rows = records.map((rec) => {
    const raw = {
      title: rec[mapping.title]?.trim() ?? "",
      description: mapping.description ? rec[mapping.description]?.trim() || undefined : undefined,
      dueDate: mapping.dueDate ? rec[mapping.dueDate]?.trim() || undefined : undefined,
      estimate: mapping.estimate ? rec[mapping.estimate]?.trim() || undefined : undefined,
    };
    const parsed = rowSchema.safeParse(raw);
    const rowKey =
      (mapping.externalId && rec[mapping.externalId]?.trim()) || hashRow(raw);

    if (!parsed.success) {
      return {
        rowKey,
        data: { title: raw.title },
        status: "error" as const,
        errors: parsed.error.issues.map((i) => i.message),
      };
    }
    const dup = seen.has(rowKey);
    seen.add(rowKey);
    return {
      rowKey,
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        dueDate: parsed.data.dueDate,
        estimate: parsed.data.estimate ? Number(parsed.data.estimate) : undefined,
      },
      status: dup ? ("duplicate" as const) : ("ok" as const),
      errors: [],
    };
  });

  return { rows, totalRows: rows.length };
}

function fromCsv(text: string): Record<string, string>[] {
  const grid = parseCsv(text);
  if (grid.length === 0) return [];
  const header = grid[0];
  return grid.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => (rec[h] = r[i] ?? ""));
    return rec;
  });
}

function fromJson(text: string): Record<string, string>[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("file is not valid JSON");
  }
  const arr = Array.isArray(data) ? data : Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items : null;
  if (!arr) throw new Error("JSON must be an array of objects or { items: [...] }");
  return arr.map((o) => {
    const rec: Record<string, string> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      rec[k] = v == null ? "" : String(v);
    }
    return rec;
  });
}
