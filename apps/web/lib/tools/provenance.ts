/**
 * The shared output contract every Workbench tool follows (charter §3):
 * each item is visibly extracted from the input, inferred, or uncertain.
 */
export type Provenance = "extracted" | "inferred" | "uncertain";

export const PROVENANCE_LABELS: Record<Provenance, { label: string; description: string }> = {
  extracted: { label: "From your text", description: "Quotes the part of your text it came from." },
  inferred: { label: "Inferred", description: "The AI's reasoning from your text, not something it said directly." },
  uncertain: { label: "Needs your input", description: "Your text didn't say; fill this in yourself." },
};
