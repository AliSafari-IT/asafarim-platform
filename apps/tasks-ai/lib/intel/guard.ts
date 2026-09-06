/**
 * Anti-surveillance guard (docs: M08 / charter §5 / compliance decisions).
 *
 * Enforced in code, not just policy: no intelligence payload may expose a
 * per-person productivity score, ranking, rating, emotion/sentiment, or an
 * automated performance judgment. Signals talk about *work* (tasks, dates,
 * dependencies), never about *people*.
 */
const BANNED_KEYS =
  /(productivity|performance|efficiency|ranking|rank|rating|score_?per_?(person|user|member|employee)|emotion|sentiment|mood|keystroke|activity_?level|idle_?time)/i;

const BANNED_PHRASES = [
  /\btop performer\b/i,
  /\bunderperform/i,
  /\bproductivity score\b/i,
  /\bperformance (score|rating|review)\b/i,
  /\bslack(er|ing)\b/i,
  /\blazy\b/i,
];

export class SurveillanceGuardError extends Error {
  constructor(reason: string) {
    super(`intelligence payload rejected: ${reason}`);
    this.name = "SurveillanceGuardError";
  }
}

/** Throws if `payload` looks like it scores or judges a person. */
export function assertNoSurveillance(payload: unknown): void {
  walk(payload, []);
}

function walk(node: unknown, path: string[]): void {
  if (node == null) return;
  if (typeof node === "string") {
    for (const re of BANNED_PHRASES) {
      if (re.test(node)) {
        throw new SurveillanceGuardError(`banned phrase at ${path.join(".") || "<root>"}: "${node.slice(0, 60)}"`);
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, [...path, String(i)]));
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (BANNED_KEYS.test(k)) {
        throw new SurveillanceGuardError(`banned key at ${[...path, k].join(".")}`);
      }
      walk(v, [...path, k]);
    }
  }
}
