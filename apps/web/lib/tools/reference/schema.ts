import type { Provenance } from "../provenance";

/**
 * Output of the internal shell-reference tool. Deliberately tiny: it exists
 * to exercise the shared shell and provenance contract end to end, not to be
 * a product. Real tools (#675–#677) define their own Zod-validated schemas.
 */
export interface ReferenceItem {
  text: string;
  provenance: Provenance;
  /** Verbatim excerpt from the input; required when provenance is "extracted". */
  source?: string;
}

export interface ReferenceResult {
  items: ReferenceItem[];
}

export function referenceResultToMarkdown(result: ReferenceResult): string {
  const lines = ["# Checklist", ""];
  for (const item of result.items) {
    const tag = item.provenance === "extracted" ? "from text" : item.provenance === "inferred" ? "inferred" : "needs input";
    lines.push(`- [ ] ${item.text} _(${tag})_`);
    if (item.source) lines.push(`  > ${item.source}`);
  }
  return `${lines.join("\n")}\n`;
}
