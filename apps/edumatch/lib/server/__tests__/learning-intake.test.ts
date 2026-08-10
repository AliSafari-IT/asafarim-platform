import { describe, expect, it } from "vitest";
import {
  EXTRACTION_SYSTEM_PROMPT,
  INTAKE_PROMPT_VERSION,
  extractJsonObject,
  heuristicExtract,
  heuristicTriage,
  mergeBriefFields,
  parseBriefFields,
  valueFingerprint,
} from "../learning-intake";
import type { AvailabilityWindow, BriefFields } from "../learning-brief";

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

// Regression: a student said "Wednesdays afternoon", then corrected with
// "I said only on Wednesdays, not any other day(s)" — and the review panel
// showed MON five times plus WED twice. Two causes: availability was unioned
// across turns (so a correction could never remove anything), and the
// fingerprint was key-order sensitive (so re-stated windows didn't dedupe).
describe("availability is a restatement, not an accumulation", () => {
  const wed: AvailabilityWindow = { day: "WED", from: "16:00", to: "19:00" };
  const mon: AvailabilityWindow = { day: "MON", from: "16:00", to: "19:00" };

  it("replaces availability wholesale instead of unioning it", () => {
    const merged = mergeBriefFields(
      { availability: [mon, wed] },
      { availability: [wed] },
    );
    expect(merged.availability).toEqual([wed]);
  });

  it("honours a correction that narrows the days", () => {
    // Turn 1: "Wednesdays afternoon" — the model also emitted a stray Monday.
    let fields = mergeBriefFields({}, { availability: [mon, wed] });
    // Turn 2: "I said only on Wednesdays, not any other day(s)".
    fields = mergeBriefFields(fields, { availability: [wed] });
    expect(fields.availability).toEqual([wed]);
    expect(fields.availability?.some((w) => w.day === "MON")).toBe(false);
  });

  it("keeps what we had when a turn mentions no availability at all", () => {
    const merged = mergeBriefFields({ availability: [wed] }, {});
    expect(merged.availability).toEqual([wed]);
  });

  it("does not wipe availability on an empty array from the model", () => {
    const merged = mergeBriefFields(
      { availability: [wed] },
      { availability: [] },
    );
    expect(merged.availability).toEqual([wed]);
  });

  it("de-duplicates repeats inside a single extraction", () => {
    const merged = mergeBriefFields({}, { availability: [wed, wed, wed] });
    expect(merged.availability).toEqual([wed]);
  });

  it("still accumulates difficulties, which genuinely add up", () => {
    const merged = mergeBriefFields(
      { difficulties: ["word problems"] },
      { difficulties: ["factorising"] },
    );
    expect(merged.difficulties).toEqual(["word problems", "factorising"]);
  });
});

describe("valueFingerprint", () => {
  it("treats objects as equal regardless of key order", () => {
    // The old JSON.stringify fingerprint failed exactly here, which is why
    // re-stated availability windows piled up instead of de-duplicating.
    expect(valueFingerprint({ day: "WED", from: "16:00", to: "19:00" })).toBe(
      valueFingerprint({ to: "19:00", day: "WED", from: "16:00" }),
    );
  });

  it("still distinguishes genuinely different values", () => {
    expect(valueFingerprint({ day: "WED" })).not.toBe(
      valueFingerprint({ day: "MON" }),
    );
  });

  it("is case- and whitespace-insensitive for scalars", () => {
    expect(valueFingerprint("  Factorising ")).toBe(valueFingerprint("factorising"));
  });
});

describe("extraction prompt", () => {
  it("offers no copyable availability data for the model to echo back", () => {
    // Root cause of the stray Mondays: the prompt showed
    // `{ "day": "MON", "from": "16:00", "to": "19:00" }` as the schema
    // example, and the model copied it verbatim into its answer. A schema
    // example must never look like a plausible real value.
    expect(EXTRACTION_SYSTEM_PROMPT).not.toMatch(/"day"\s*:\s*"(MON|TUE|WED|THU|FRI|SAT|SUN)"/);
    expect(EXTRACTION_SYSTEM_PROMPT).not.toMatch(/"(from|to)"\s*:\s*"\d{2}:\d{2}"/);
  });

  it("shows availability as an angle-bracket placeholder instead", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('"day": "<MON|TUE|WED|THU|FRI|SAT|SUN>"');
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('"from": "<HH:MM>"');
  });

  it("tells the model availability is a complete restatement", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/COMPLETE restatement/);
  });

  it("is versioned so a prompt change is visible in stored responses", () => {
    expect(INTAKE_PROMPT_VERSION).toBe("brief-v1");
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
