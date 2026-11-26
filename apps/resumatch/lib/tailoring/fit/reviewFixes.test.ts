import { describe, expect, it } from "vitest";
import { NO_EVIDENCE } from "../../evidence/prompt";
import { parseProfileContent } from "../../profile/contract";
import type { FitCategory, FitJudgment, FitPriority } from "./contract";
import { buildFitInputs, contactRedactor } from "./inputs";
import { keywordFitOutput } from "./keyword";
import { scoreFit, type FitRow } from "./rubric";
import { validateFitOutput } from "./validate";
import { buildFitView } from "./view";
import type { FitContext } from "./service";

/**
 * #972 review fixes: OR groups in suitability, a question for a partly
 * supported essential condition, contact details masked in free text, and
 * a degree met by level in the keyword check.
 */

function row(id: string, judgment: FitJudgment, extra: { category?: FitCategory; priority?: FitPriority; groupId?: string } = {}): FitRow {
  return {
    requirement: {
      id,
      quote: id,
      priority: extra.priority ?? "required",
      category: extra.category ?? "skill",
      essential: false,
      groupId: extra.groupId ?? null,
      protectedTrait: false,
    },
    assessment: { requirementId: id, judgment, citations: [], explanation: "", equivalence: null, flags: [] },
    removed: false,
    priorityCorrectedFrom: null,
    answeredBy: null,
  };
}
const suitability = (rows: FitRow[]) => scoreFit(rows, { profileTooThin: false }).suitability.overall;

describe("suitability of alternatives", () => {
  it("one ruled-out alternative is no blocker while another is still open", () => {
    const rows = [row("cert", "unmet", { category: "credential", groupId: "g" }), row("lic", "unknown", { category: "credential", groupId: "g" })];
    expect(suitability(rows)).toBe("needs_confirmation");
  });

  it("a supported non-constraint alternative meets the group", () => {
    const rows = [row("cert", "unmet", { category: "credential", groupId: "g" }), row("years", "direct", { category: "experience", groupId: "g" })];
    expect(suitability(rows)).toBe("none_stated");
  });

  it("the group is unmet only when every alternative is", () => {
    const rows = [row("cert", "unmet", { category: "credential", groupId: "g" }), row("lic", "unmet", { category: "credential", groupId: "g" })];
    expect(suitability(rows)).toBe("unmet_essential");
  });
});

const PROFILE = parseProfileContent({
  fullName: "Jordan Example",
  email: "jordan@example.test",
  phone: "+32 470 00 00 00",
  headline: "Developer",
  summary: "Jordan Example builds web apps.",
  skills: [{ name: "React" }, { name: "TypeScript" }, { name: "Node.js" }],
  education: [{ qualification: "PhD in Chemistry", institution: "Example University" }],
});

describe("contact details in free text", () => {
  it("masks the name, its parts, email and phone", () => {
    const redact = contactRedactor(PROFILE);
    expect(redact("Jordan Example and Jordan wrote to jordan@example.test, +32 470 00 00 00")).toBe(
      "[the candidate] and [the candidate] wrote to [email], [contact]",
    );
    // Only whole words: a word that contains a name part stays.
    expect(redact("Jordanian")).toBe("Jordanian");
  });

  it("nothing the analysis reads or cites carries them", () => {
    const evidence = {
      professional: [
        { revisionId: "rev_1", kind: "PROJECT" as const, title: "Shop rebuild", detail: "Jordan rebuilt the shop in React; mail jordan@example.test or call +32 470 00 00 00.", role: null, roleIndex: null },
      ],
      motivation: [],
      revisionIds: ["rev_1"],
    };
    const inputs = buildFitInputs({ profile: PROFILE, rawJobText: "Developer\nRequirements:\n- React\n- TypeScript\n- Node.js", evidence });
    expect(inputs.sourcesText).toContain("[the candidate] rebuilt the shop");
    const text = inputs.sourcesText + JSON.stringify(inputs.sources);
    expect(text).not.toMatch(/Jordan|jordan@|470 00/);
  });
});

describe("degree met by level", () => {
  it("the keyword check keeps a PhD for a master's requirement as supported, with its education source", () => {
    const job = "Research scientist\nRequirements:\n- Master's degree in Chemistry\n- Python\n- Lab experience";
    const inputs = buildFitInputs({ profile: PROFILE, rawJobText: job, evidence: NO_EVIDENCE });
    const analysis = validateFitOutput({
      output: keywordFitOutput(inputs.selection, inputs.sources),
      jobText: inputs.jobText,
      sources: inputs.sources,
      method: "keyword",
      completeness: { jobTruncated: false, profileSentencesOmitted: 0 },
    });
    const degree = analysis.requirements.find((r) => /master/i.test(r.quote))!;
    const assessed = analysis.assessments.find((a) => a.requirementId === degree.id)!;
    expect(assessed.judgment).toBe("direct");
    expect(assessed.citations[0]?.sourceId).toMatch(/^edu:/);
  });
});

describe("questions for partly supported essential conditions", () => {
  it("asks about a partly supported language level, not about a met alternative", () => {
    const job = "Support agent\nRequirements:\n- French at C1 level\n- Zendesk";
    const inputs = buildFitInputs({ profile: PROFILE, rawJobText: job, evidence: NO_EVIDENCE });
    const analysis = validateFitOutput({
      output: {
        requirements: [
          { key: "a", quote: "French at C1 level", priority: "required", category: "language", essential: true, anyOf: null },
          { key: "b", quote: "Zendesk", priority: "required", category: "skill", essential: false, anyOf: null },
        ],
        moreRequirementsOmitted: false,
        assessments: [
          { key: "a", judgment: "partial", citations: [{ sourceId: "headline", quote: "Developer" }], explanation: "x", equivalence: null },
          { key: "b", judgment: "unknown", citations: [], explanation: "x", equivalence: null },
        ],
      },
      jobText: inputs.jobText,
      sources: inputs.sources,
      method: "ai",
      completeness: { jobTruncated: false, profileSentencesOmitted: 0 },
    });
    const partial = analysis.assessments.find((a) => a.judgment === "partial");
    const context = { inputs, answers: [], corrections: [] } as unknown as FitContext;
    const score = scoreFit([], { profileTooThin: false });
    const view = buildFitView({ analysis, context, score, meta: null });
    const quotes = view.questions.map((q) => q.quote);
    expect(quotes).toContain("Zendesk");
    expect(partial).toBeDefined();
    expect(quotes).toContain("French at C1 level");
  });
});
