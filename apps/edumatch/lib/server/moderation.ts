/**
 * Phase 4 — AI moderation & academic-integrity guardrail.
 *
 * The student-facing AI is a *tutor*, not a homework-completion service. We
 * pre-screen each student prompt (and any voice-transcript text) before it is
 * sent to a generation provider. Detected violations short-circuit the call
 * and produce a redirection message that explains why we won't answer and
 * what we *can* help with instead.
 *
 * Categories
 * ----------
 *   CHEATING          - "give me the answer key", "do my homework", "complete
 *                       this assignment for me"
 *   EXAM_BYPASS       - "I'm taking the test right now", "this is for my
 *                       online exam", "live proctored quiz"
 *   PLAGIARISM        - "rewrite this so my professor can't tell", "make this
 *                       undetectable to Turnitin"
 *   UNSAFE_PERSONAL   - self-harm, abuse, or other distress signals where a
 *                       tutor model is the wrong tool — redirect to support.
 *
 * Outcomes
 * --------
 *   ALLOW   - prompt is fine, generate normally
 *   REVIEW  - borderline, allowed but logged; UI may show a softer disclaimer
 *   REFUSE  - blocked, return a redirection response, do not call provider
 *
 * The matching here is deliberately a heuristic keyword/regex pass. It is
 * intentionally conservative — false positives are recoverable (the student
 * can rephrase) and far cheaper than calling an LLM moderator on every
 * inquiry. Future iterations can chain a model-based moderator on top.
 */

export type ModerationOutcome = "ALLOW" | "REVIEW" | "REFUSE";

export type ModerationCategory =
  | "CHEATING"
  | "EXAM_BYPASS"
  | "PLAGIARISM"
  | "UNSAFE_PERSONAL"
  | "OTHER"
  | "NONE";

export type ModerationDecision = {
  outcome: ModerationOutcome;
  category: ModerationCategory;
  reason: string;
  /** Suggested student-facing redirection message; only set when REFUSE. */
  redirectMessage?: string;
};

type Rule = {
  category: ModerationCategory;
  outcome: ModerationOutcome;
  patterns: RegExp[];
  reason: string;
};

const REFUSE_RULES: Rule[] = [
  {
    category: "EXAM_BYPASS",
    outcome: "REFUSE",
    reason: "Live exam / proctored test bypass request.",
    patterns: [
      /\b(?:i['’]?m|i am|currently)\s+(?:in|taking|writing|sitting)\s+(?:an?\s+)?(?:exam|test|quiz|midterm|final)\b/i,
      /\b(?:online|live|proctored|timed)\s+(?:exam|test|quiz)\b/i,
      /\b(?:answers?\s+(?:to|for)\s+(?:my|the)\s+(?:exam|test|quiz))\b/i,
      /\b(?:exam|test|quiz)\s+(?:is\s+)?(?:happening\s+)?(?:right\s+)?now\b/i,
    ],
  },
  {
    category: "PLAGIARISM",
    outcome: "REFUSE",
    reason: "Plagiarism / detector-evasion request.",
    patterns: [
      /\b(?:rewrite|paraphrase|reword)\s+(?:this|it|my essay|my paper)\s+(?:so|to)\s+(?:that\s+)?(?:my\s+)?(?:professor|teacher|instructor|turnitin|ai detector|gptzero)\b/i,
      /\b(?:professor|teacher|instructor)\s+can(?:not|'t|n['’]t)\s+tell\s+(?:it(?:'s| is)|this\s+is)\s+ai\b/i,
      /\b(?:bypass|fool|evade|trick|defeat)\s+(?:turnitin|ai detector|gptzero|plagiarism)\b/i,
      /\b(?:undetectable|uncatchable)\s+(?:by|to)\s+(?:turnitin|ai|plagiarism)\b/i,
      /\bmake\s+(?:this|it)\s+(?:look|seem)\s+human(?:-written)?\b/i,
    ],
  },
  {
    category: "CHEATING",
    outcome: "REFUSE",
    reason: "Direct homework-completion / answer-key request.",
    patterns: [
      /\b(?:do|complete|finish)\s+(?:my|this)\s+(?:homework|assignment|essay|project)\b/i,
      /\b(?:give|send|provide)\s+me\s+the\s+answer\s+key\b/i,
      /\bjust\s+(?:tell|give)\s+me\s+the\s+answers?\b/i,
      /\bwrite\s+(?:my|the)\s+(?:essay|paper|report|assignment)\s+for\s+me\b/i,
    ],
  },
  {
    category: "UNSAFE_PERSONAL",
    outcome: "REFUSE",
    reason: "Personal-safety topic outside tutor scope; redirect to support.",
    patterns: [
      // Deliberately narrow — we redirect with a supportive message rather than
      // refuse coldly. Any of these triggers a refusal + resource pointer.
      /\b(?:kill|hurt|harm)\s+(?:myself|me)\b/i,
      /\bi\s+want\s+to\s+(?:die|end\s+(?:it|my\s+life))\b/i,
      /\bsuicid(?:e|al)\b/i,
      /\b(?:abuse|abusive)\s+(?:parent|family|partner|relationship)\b/i,
    ],
  },
];

const REVIEW_RULES: Rule[] = [
  {
    category: "CHEATING",
    outcome: "REVIEW",
    reason: "Possible homework-completion intent; allow with disclaimer.",
    patterns: [
      /\bsolve\s+(?:this|it)\s+for\s+me\b/i,
      /\bgive\s+me\s+the\s+(?:final|full)\s+(?:solution|answer)\b/i,
    ],
  },
  {
    category: "PLAGIARISM",
    outcome: "REVIEW",
    reason: "Possible rewrite request; allow with disclaimer.",
    patterns: [
      /\b(?:rewrite|paraphrase)\s+(?:this|my)\s+(?:essay|paragraph|paper)\b/i,
    ],
  },
];

/**
 * Default redirection messages by category. Used when REFUSE is returned and
 * the caller wants a student-facing string to render instead of provider
 * output.
 */
export const REDIRECTION_MESSAGES: Record<ModerationCategory, string> = {
  CHEATING:
    "EduMatch AI helps you *learn* the material — it won't write your homework, " +
    "essay, or assignment for you. Try sharing the specific step or concept " +
    "you're stuck on and we'll work through it together.",
  EXAM_BYPASS:
    "EduMatch AI can't help with a live or in-progress exam, test, or quiz. " +
    "Once the exam is over, share the questions and we'll review the concepts " +
    "together so you're ready next time.",
  PLAGIARISM:
    "EduMatch AI won't help disguise AI- or AI-assisted writing to evade " +
    "plagiarism or AI-detection tools. If you'd like feedback on your own " +
    "writing — clarity, structure, argument — share the draft and we'll review " +
    "it as a tutor would.",
  UNSAFE_PERSONAL:
    "It sounds like something serious is going on. EduMatch AI isn't the right " +
    "place for that — please reach out to someone you trust or a local crisis " +
    "service. In many regions you can also dial a national helpline. We're " +
    "here for the academic side whenever you're ready.",
  OTHER:
    "EduMatch AI couldn't safely respond to that prompt. Try rephrasing the " +
    "specific concept or step you'd like help with.",
  NONE: "",
};

/**
 * Run the moderation pre-check on the student-supplied text.
 *
 * `text` is the full effective prompt (description + any voice transcript).
 * Returns the outcome, category, reason, and (when REFUSE) a redirection
 * message suitable for display.
 */
export function moderatePrompt(text: string): ModerationDecision {
  const haystack = (text ?? "").toString();

  // Empty prompts cannot violate; let the validation layer reject them.
  if (haystack.trim().length === 0) {
    return { outcome: "ALLOW", category: "NONE", reason: "Empty prompt." };
  }

  for (const rule of REFUSE_RULES) {
    for (const re of rule.patterns) {
      if (re.test(haystack)) {
        return {
          outcome: rule.outcome,
          category: rule.category,
          reason: rule.reason,
          redirectMessage: REDIRECTION_MESSAGES[rule.category],
        };
      }
    }
  }

  for (const rule of REVIEW_RULES) {
    for (const re of rule.patterns) {
      if (re.test(haystack)) {
        return {
          outcome: rule.outcome,
          category: rule.category,
          reason: rule.reason,
        };
      }
    }
  }

  return { outcome: "ALLOW", category: "NONE", reason: "No rule matched." };
}

/**
 * Convenience: should the caller proceed with provider generation?
 */
export function moderationAllowsGeneration(decision: ModerationDecision): boolean {
  return decision.outcome !== "REFUSE";
}

/**
 * Disclaimer the student-facing UI should display *alongside* AI output.
 * The text is intentionally short, friendly, and non-legalese.
 */
export const AI_DISCLAIMER =
  "EduMatch AI is a study aid, not a final authority. It can be wrong or " +
  "incomplete. Always check answers against your textbook, teacher, or a " +
  "verified tutor before relying on them — and never submit AI text as your " +
  "own work.";
