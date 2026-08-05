import { describe, it, expect } from "vitest";
import {
  moderatePrompt,
  moderationAllowsGeneration,
  REDIRECTION_MESSAGES,
  AI_DISCLAIMER,
} from "../moderation";

describe("moderatePrompt", () => {
  describe("allowed prompts", () => {
    const allowed = [
      "Can you help me understand how derivatives work?",
      "Walk me through how to solve this quadratic equation.",
      "I'm stuck on a Python recursion problem, could you explain the base case?",
      "Compare and contrast mitosis and meiosis.",
      "What's the difference between a metaphor and a simile?",
      // Genuine empty / whitespace prompt
      "   ",
    ];
    for (const text of allowed) {
      it(`allows: "${text.slice(0, 40)}..."`, () => {
        const decision = moderatePrompt(text);
        expect(decision.outcome).toBe("ALLOW");
        expect(decision.category).toBe("NONE");
        expect(moderationAllowsGeneration(decision)).toBe(true);
      });
    }
  });

  describe("borderline prompts (REVIEW)", () => {
    const borderline = [
      "Can you rewrite my essay so it flows better?",
      "Just solve this for me, I'm out of time.",
    ];
    for (const text of borderline) {
      it(`flags as REVIEW: "${text.slice(0, 40)}..."`, () => {
        const decision = moderatePrompt(text);
        expect(decision.outcome).toBe("REVIEW");
        expect(decision.category).not.toBe("NONE");
        // REVIEW still allows generation; UI shows a softer disclaimer.
        expect(moderationAllowsGeneration(decision)).toBe(true);
      });
    }
  });

  describe("refused prompts", () => {
    it("refuses live exam bypass", () => {
      const d = moderatePrompt("I'm taking my final exam right now, what's the answer to question 4?");
      expect(d.outcome).toBe("REFUSE");
      expect(d.category).toBe("EXAM_BYPASS");
      expect(d.redirectMessage).toBe(REDIRECTION_MESSAGES.EXAM_BYPASS);
      expect(moderationAllowsGeneration(d)).toBe(false);
    });

    it("refuses plagiarism / detector evasion", () => {
      const d = moderatePrompt("Rewrite this essay so my professor can't tell it's AI.");
      expect(d.outcome).toBe("REFUSE");
      expect(d.category).toBe("PLAGIARISM");
    });

    it("refuses turnitin evasion", () => {
      const d = moderatePrompt("Make this undetectable by Turnitin please");
      expect(d.outcome).toBe("REFUSE");
      expect(d.category).toBe("PLAGIARISM");
    });

    it("refuses 'do my homework for me'", () => {
      const d = moderatePrompt("Please do my homework on the French Revolution.");
      expect(d.outcome).toBe("REFUSE");
      expect(d.category).toBe("CHEATING");
    });

    it("refuses answer-key requests", () => {
      const d = moderatePrompt("Just send me the answer key for chapter 4");
      expect(d.outcome).toBe("REFUSE");
      expect(d.category).toBe("CHEATING");
    });

    it("refuses unsafe personal/self-harm prompts with a supportive redirect", () => {
      const d = moderatePrompt("I want to kill myself, can you help me with my homework anyway");
      expect(d.outcome).toBe("REFUSE");
      expect(d.category).toBe("UNSAFE_PERSONAL");
      // Make sure the message is supportive, not just a dry refusal.
      expect(d.redirectMessage).toMatch(/serious|trust|crisis|helpline/i);
    });
  });

  it("disclaimer mentions textbook/teacher/tutor verification", () => {
    expect(AI_DISCLAIMER).toMatch(/textbook|teacher|tutor/i);
  });
});
