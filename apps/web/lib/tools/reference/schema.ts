import { z } from "zod";

/**
 * Input and output of the internal shell-reference tool. Deliberately tiny:
 * it exists to exercise the shared shell, the server execution boundary,
 * and the provenance contract end to end, not to be a product.
 */
export const referenceInputSchema = z.object({
  text: z
    .string()
    .trim()
    .min(20, "Add a little more text — at least 20 characters.")
    .max(4000, "Your text is over the 4,000-character limit."),
});
export type ReferenceInput = z.infer<typeof referenceInputSchema>;

export const referenceItemSchema = z
  .object({
    text: z.string().min(1).max(500),
    provenance: z.enum(["extracted", "inferred", "uncertain"]),
    /** Verbatim excerpt from the input; required when provenance is "extracted". */
    source: z.string().min(1).max(500).optional(),
  })
  .refine((item) => item.provenance !== "extracted" || item.source, {
    message: "extracted items must quote their source",
  });
export type ReferenceItem = z.infer<typeof referenceItemSchema>;

export const referenceResultSchema = z.object({ items: z.array(referenceItemSchema).max(50) });
export type ReferenceResult = z.infer<typeof referenceResultSchema>;

export function referenceResultToMarkdown(result: ReferenceResult): string {
  const lines = ["# Checklist", ""];
  for (const item of result.items) {
    const tag = item.provenance === "extracted" ? "from text" : item.provenance === "inferred" ? "inferred" : "needs input";
    lines.push(`- [ ] ${item.text} _(${tag})_`);
    if (item.source) lines.push(`  > ${item.source}`);
  }
  return `${lines.join("\n")}\n`;
}
