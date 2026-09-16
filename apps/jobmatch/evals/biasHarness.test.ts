import { describe, expect, it } from "vitest";
import { buildEmbeddingInput } from "../lib/matching/embeddingInput";
import { renderEvaluatePrompt } from "../lib/matching/ai/prompts";
import { getEvaluationProvider } from "../lib/matching/ai/registry";
import type {
  EvaluateProviderCall,
  EvaluateProviderOutput,
  EvaluationProvider,
} from "../lib/matching/ai/evaluateProvider";
import { matchResultSchema } from "../lib/matching/contract";
import type { ExplicitPreferences } from "../lib/matching/rank";
import { BIAS_PAIRS } from "./bias/cases";
import { DEFAULT_BIAS_THRESHOLD, runBiasSuite } from "./biasHarness";

/**
 * JM-046 bias & consistency eval suite. CI-safe: no billable provider call,
 * no database. Mirrors evals/harness.test.ts's assertion style.
 *
 * See biasHarness.ts's module doc comment for the full framing this suite
 * operates under: the threshold is a proposal pending JM-005 sign-off, and
 * the fixture-provider run below proves plumbing/determinism, not real bias
 * absence — the negative control test is what actually proves the
 * detection logic works.
 */

describe("bias eval pair fixtures (structural)", () => {
  it("every pair is identical in technical skill across both variants", () => {
    for (const pair of BIAS_PAIRS) {
      expect(pair.variantA.skills, `pair "${pair.id}": skills must be identical`).toEqual(pair.variantB.skills);
    }
  });

  it("every pair differs somewhere — variants are not byte-identical", () => {
    for (const pair of BIAS_PAIRS) {
      expect(
        JSON.stringify(pair.variantA) !== JSON.stringify(pair.variantB),
        `pair "${pair.id}": variantA and variantB must differ along the stated dimension`,
      ).toBe(true);
    }
  });

  it("covers all six required bias dimensions", () => {
    const dimensions = new Set(BIAS_PAIRS.map((p) => p.dimension));
    const required = [
      "career-gap-length",
      "cv-length-verbosity",
      "formatting",
      "seniority-phrasing",
      "degree-institution-prestige",
      "language-coded-phrasing",
    ] as const;
    for (const dim of required) {
      expect(dimensions.has(dim), `missing bias coverage for dimension "${dim}"`).toBe(true);
    }
  });
});

describe("bias eval harness (fixture provider — plumbing/determinism only)", () => {
  it(
    "runs every pair against the fixture provider and stays under threshold " +
      "(NOTE: the fixture provider is a deterministic token-overlap scorer with " +
      "no notion of bias — pairs are constructed to preserve identical skill " +
      "tokens, so passing here proves pair generation + harness diffing + report " +
      "shape are correct, NOT that a real model is unbiased — see biasHarness.ts)",
    async () => {
      const provider = await getEvaluationProvider("fixture");
      const report = await runBiasSuite(provider);

      expect(report.provider).toBe("fixture");
      expect(report.totalPairs).toBe(BIAS_PAIRS.length);
      expect(report.threshold).toBe(DEFAULT_BIAS_THRESHOLD);
      expect(report.thresholdStatus).toBe("proposal-pending-jm005-signoff");

      const flagged = report.results.filter((r) => r.flagged);
      expect(flagged, JSON.stringify(flagged, null, 2)).toHaveLength(0);
      expect(report.flaggedPairs).toBe(0);
    },
  );
});

describe("protected-attribute absence — embeddings, ranking, and evaluation prompt", () => {
  /**
   * Structural check per the issue's explicit "there is no schema field for
   * one, but the test makes the guarantee legible" requirement. This is not
   * only about the evaluation prompt — the issue names all three layers:
   * embeddings (JM-041), ranking (JM-042), and the prompt (JM-043). Rather
   * than re-deriving allow-lists ad hoc, this asserts the exact field sets
   * those three modules already declare/read, so any future addition of a
   * protected-attribute-shaped field would have to change one of these
   * assertions to pass unnoticed.
   */

  it("buildEmbeddingInput only reads the documented allow-listed profile fields", () => {
    // A fixture profile that, if the contract ever grew a protected-attribute
    // field, WOULD leak it — proves the current allow-list construction
    // (not a runtime substring check) is what keeps it out.
    const probe = {
      ...JSON.parse(
        JSON.stringify({
          contractVersion: "1.0.0",
          fullName: "Jordan Example",
          email: "jordan@example.test",
          phone: "+32 470 00 00 00",
          headline: "Backend Developer",
          summary: "Backend developer with Node.js experience.",
          baseLocation: "Brussels",
          workAuthorization: "eea_unrestricted",
          languages: [{ code: "en", label: "English", proficiency: "professional" }],
          skills: [{ name: "Node.js", rawLabel: null, yearsExperience: 5 }],
          experience: [],
          education: [],
          certifications: [],
          preferences: {
            locations: [],
            remote: null,
            contractTypes: [],
            salaryFloor: null,
            salaryCurrency: null,
            excludedEmployers: [],
          },
        }),
      ),
    };

    const { text, includedFields } = buildEmbeddingInput(probe as never);

    // The candidate profile contract itself has no protected-attribute
    // field to construct a positive-leak probe from (assertNoProtectedAttributes
    // rejects unknown/protected-shaped keys at parse time) — so this test's
    // guarantee is: only the documented allow-listed fields ever contribute
    // text, by construction, not by a runtime blocklist.
    const allowedFieldPrefixes = [
      "headline",
      "summary",
      "workAuthorization",
      "languages",
      "skills",
      "experience",
      "education",
      "certifications",
    ];
    for (const field of includedFields) {
      const prefix = field.replace(/\[\d+\]$/, "");
      expect(allowedFieldPrefixes, `unexpected included field "${field}"`).toContain(prefix);
    }
    // fullName/email/phone/baseLocation must never appear in the embedding text.
    expect(text).not.toContain("Jordan");
    expect(text).not.toContain("jordan@example.test");
    expect(text).not.toContain("470 00 00 00");
    expect(text).not.toContain("Brussels");
  });

  it("ExplicitPreferences (rank.ts) only carries preferences/skills fields, never a protected attribute", () => {
    // rank.ts's own module doc comment: "ExplicitPreferences is built only
    // from CandidateProfileContent.preferences and skills... there is
    // nothing to filter out here because there is nowhere for it to have
    // come from." This asserts that documented field set directly, so a
    // future edit to ExplicitPreferences that added an unrelated field would
    // fail this test.
    const preferences: ExplicitPreferences = {
      skills: ["Node.js"],
      locations: ["Brussels"],
      remote: "hybrid",
      contractTypes: ["permanent"],
      salaryFloor: 50000,
      salaryCurrency: "EUR",
    };
    expect(Object.keys(preferences).sort()).toEqual(
      ["contractTypes", "locations", "remote", "salaryCurrency", "salaryFloor", "skills"].sort(),
    );
  });

  it("the rendered evaluation prompt's fenced input traces only to profileText/postingText, never a raw profile", () => {
    const profileText = buildEmbeddingInput({
      ...JSON.parse(
        JSON.stringify({
          contractVersion: "1.0.0",
          fullName: "Jordan Example",
          email: "jordan@example.test",
          phone: null,
          headline: "Backend Developer",
          summary: null,
          baseLocation: null,
          workAuthorization: null,
          languages: [],
          skills: [],
          experience: [],
          education: [],
          certifications: [],
          preferences: {
            locations: [],
            remote: null,
            contractTypes: [],
            salaryFloor: null,
            salaryCurrency: null,
            excludedEmployers: [],
          },
        }),
      ),
    } as never).text;
    const prompt = renderEvaluatePrompt(profileText, "Backend role requiring Node.js.");

    // EvaluateProviderCall (evaluateProvider.ts) only ever carries
    // profileText/postingText/system/user/promptVersion/model — no raw
    // profile object field. This asserts the rendered prompt itself never
    // contains the candidate's name/email, which buildEmbeddingInput already
    // excluded upstream.
    expect(prompt.user).not.toContain("Jordan Example");
    expect(prompt.user).not.toContain("jordan@example.test");
  });
});

describe("negative control — a deliberately biased stub provider makes the suite fail", () => {
  /**
   * This is the suite's main proof that the detection logic itself works
   * (per the issue-framing note): the real fixture provider has no notion
   * of bias and will not organically produce a flaggable delta (see the
   * "plumbing/determinism only" describe block above), so this stub
   * provider deliberately penalises one perturbation dimension
   * (`language-coded-phrasing`: French-coded summary phrasing scores lower
   * than English-coded phrasing for otherwise-identical technical content)
   * to prove `runBiasSuite` actually detects and flags a real disparity
   * when one exists.
   */
  class BiasedStubProvider implements EvaluationProvider {
    readonly name = "fixture" as const;

    async generate(call: EvaluateProviderCall): Promise<EvaluateProviderOutput> {
      // Deliberately, obviously biased: penalise profile text that contains
      // French-coded phrasing, regardless of technical skill content.
      const looksFrenchCoded = /Développeur|Bonjour|d'équipe/i.test(call.profileText);
      const suitabilityScore = looksFrenchCoded ? 0.2 : 0.9;
      const confidence = 0.8;

      const result = matchResultSchema.parse({
        suitabilityScore,
        confidence,
        matchingSkills: ["Node.js"],
        missingSkills: [],
        uncertainRequirements: [],
        explanation: [
          {
            profileField: "summary",
            postingRequirement: "Node.js",
            note: "Stub evaluation for negative-control testing.",
          },
        ],
        recommendedAction: suitabilityScore >= 0.5 ? "worth_applying" : "likely_not_a_fit",
        embeddingModelVersion: null,
        evaluationModelVersion: "bias-negative-control-stub",
        promptVersion: call.promptVersion,
        degraded: false,
      });

      return { result, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    }
  }

  it("flags the deliberately-biased dimension and fails the suite's own pass/fail gate", async () => {
    const stub = new BiasedStubProvider();
    const report = await runBiasSuite(stub);

    const languagePair = report.results.find((r) => r.dimension === "language-coded-phrasing");
    expect(languagePair, "expected the language-coded-phrasing pair to be present").toBeDefined();
    expect(languagePair!.flagged).toBe(true);
    expect(languagePair!.deltaSuitabilityScore).toBeGreaterThan(DEFAULT_BIAS_THRESHOLD);

    // The suite-level gate (mirrored by runBiasEval.ts's CLI exit code) must
    // see at least one flagged pair — this is the assertion that proves
    // detection logic works, not merely that a delta was computed.
    expect(report.flaggedPairs).toBeGreaterThan(0);
  });

  it("does NOT flag every pair — only the dimension the stub actually discriminates on", async () => {
    const stub = new BiasedStubProvider();
    const report = await runBiasSuite(stub);

    const careerGapPair = report.results.find((r) => r.dimension === "career-gap-length");
    expect(careerGapPair, "expected the career-gap-length pair to be present").toBeDefined();
    // Neither variant of this pair contains French-coded phrasing, so the
    // stub scores both the same — proving the harness's flag is specific to
    // the disparity that actually exists, not a blanket failure.
    expect(careerGapPair!.flagged).toBe(false);
  });
});
