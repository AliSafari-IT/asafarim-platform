import { describe, expect, it } from "vitest";
import {
  extractJsonObject,
  heuristicExtract,
  heuristicTriage,
  mergeBriefFields,
  parseBriefFields,
} from "../learning-intake";
import type { BriefFields } from "../learning-brief";

describe("extractJsonObject", () => {
  it("reads a bare object", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("survives markdown fences and surrounding prose", () => {
    const raw = 'Sure! Here you go:\n```json\n{"a":1}\n```\nHope that helps.';
    expect(extractJsonObject(raw)).toEqual({ a: 1 });
  });

  it("returns null rather than throwing on malformed JSON", () => {
    expect(extractJsonObject("{not json")).toBeNull();
    expect(extractJsonObject("no braces at all")).toBeNull();
  });
});

describe("parseBriefFields", () => {
  it("keeps valid fields and drops invalid ones individually", () => {
    const parsed = parseBriefFields({
      subject: "Mathematics",
      educationalLevel: "SPACE_CAMP", // not a grade level
      mode: "ONLINE",
    });
    expect(parsed.subject).toBe("Mathematics");
    expect(parsed.mode).toBe("ONLINE");
    expect(parsed.educationalLevel).toBeUndefined();
  });

  it("ignores unknown keys a model invents", () => {
    const parsed = parseBriefFields({ subject: "Physics", vibes: "good" });
    expect(parsed).toEqual({ subject: "Physics" });
    expect("vibes" in parsed).toBe(false);
  });

  it("skips empty values instead of writing them", () => {
    expect(parseBriefFields({ topic: "", subject: null })).toEqual({});
  });

  it("returns an empty object for a non-object input", () => {
    expect(parseBriefFields("nope")).toEqual({});
    expect(parseBriefFields(null)).toEqual({});
  });
});

describe("mergeBriefFields", () => {
  it("fills gaps without overwriting what the student already told us", () => {
    const known: BriefFields = { subject: "Mathematics" };
    const merged = mergeBriefFields(known, {
      subject: "Physics",
      topic: "Quadratics",
    });
    expect(merged.subject).toBe("Mathematics");
    expect(merged.topic).toBe("Quadratics");
  });

  it("treats a blank existing value as a gap", () => {
    const merged = mergeBriefFields({ subject: "  " }, { subject: "Biology" });
    expect(merged.subject).toBe("Biology");
  });

  it("unions list fields instead of replacing them", () => {
    const merged = mergeBriefFields(
      { difficulties: ["factorising"] },
      { difficulties: ["completing the square"] },
    );
    expect(merged.difficulties).toEqual(["factorising", "completing the square"]);
  });

  it("de-duplicates list entries case-insensitively", () => {
    const merged = mergeBriefFields(
      { difficulties: ["Factorising"] },
      { difficulties: ["factorising", "fractions"] },
    );
    expect(merged.difficulties).toEqual(["Factorising", "fractions"]);
  });
});

describe("heuristicExtract (no AI provider configured)", () => {
  it("recognises a subject and topic it can actually see", () => {
    const fields = heuristicExtract(
      "I'm stuck on quadratic equations in my maths homework",
    );
    expect(fields.subject).toBe("Mathematics");
    expect(fields.topic).toBe("Quadratic equations");
  });

  it("works across the platform's languages", () => {
    expect(heuristicExtract("ik snap wiskunde niet").subject).toBe("Mathematics");
    expect(heuristicExtract("j'ai un problème en physique").subject).toBe("Physics");
  });

  it("leaves the level empty rather than guessing it from the subject", () => {
    expect(heuristicExtract("I need help with calculus").educationalLevel).toBeUndefined();
  });

  it("reads the level only when the student says it", () => {
    expect(heuristicExtract("I'm in 5 VWO").educationalLevel).toBe("K12");
    expect(heuristicExtract("second year of my bachelor").educationalLevel).toBe(
      "UNDERGRAD",
    );
  });

  it("turns a relative exam date into a deadline", () => {
    const fields = heuristicExtract("I have an exam in two weeks");
    expect(fields.deadlineKind).toBe("EXAM");
    const days = Math.round(
      (fields.deadlineAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    );
    expect(days).toBe(14);
  });

  it("picks up an explicit format preference", () => {
    expect(heuristicExtract("preferably online please").mode).toBe("ONLINE");
    expect(heuristicExtract("I'd like someone in person").mode).toBe("IN_PERSON");
  });
});

describe("heuristicTriage", () => {
  it("asks for more when the level or topic is unknown", () => {
    expect(heuristicTriage({ subject: "Mathematics" }).outcome).toBe(
      "NEEDS_DIAGNOSTIC",
    );
  });

  it("recommends a tutor when a deadline is close", () => {
    expect(
      heuristicTriage({
        subject: "Mathematics",
        topic: "Quadratics",
        educationalLevel: "K12",
        deadlineAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      }).outcome,
    ).toBe("TUTOR_RECOMMENDED");
  });

  it("recommends a tutor when the difficulty spans several topics", () => {
    expect(
      heuristicTriage({
        subject: "Mathematics",
        topic: "Quadratics",
        educationalLevel: "K12",
        difficulties: ["factorising", "the discriminant"],
      }).outcome,
    ).toBe("TUTOR_RECOMMENDED");
  });

  it("says self-study is enough for one focused topic with no deadline", () => {
    expect(
      heuristicTriage({
        subject: "Mathematics",
        topic: "Quadratics",
        educationalLevel: "K12",
      }).outcome,
    ).toBe("SELF_STUDY");
  });
});
