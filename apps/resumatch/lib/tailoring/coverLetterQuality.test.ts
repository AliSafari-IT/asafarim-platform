import { describe, expect, it } from "vitest";
import { computeCoverLetterQuality } from "./coverLetterQuality";
import type { CoverLetterContent } from "./ai/coverLetter/schema";

function content(overrides: Partial<CoverLetterContent> = {}): CoverLetterContent {
  return {
    contractVersion: "1.0.0",
    greeting: "Dear Hiring Manager,",
    paragraphs: [
      "I am excited to apply for the Backend Engineer role at Acme, where my six years building payments infrastructure directly match your team's focus on reliability.",
      "At my current role I led the migration of our core API to Node.js and PostgreSQL, reducing latency by 40% and cutting incident volume in half.",
      "I would welcome the chance to discuss how my experience with distributed systems can contribute to your platform team.",
    ],
    signOff: "Sincerely,",
    fullName: "Jane Doe",
    ...overrides,
  };
}

describe("computeCoverLetterQuality", () => {
  it("reports word and paragraph counts", () => {
    const report = computeCoverLetterQuality(content());
    expect(report.paragraphCount).toBe(3);
    expect(report.wordCount).toBeGreaterThan(0);
  });

  it("flags a letter that is too short for the requested length", () => {
    const report = computeCoverLetterQuality(content({ paragraphs: ["Short letter."] }), "detailed");
    expect(report.wordCountInRange).toBe(false);
  });

  it("accepts a letter within the short target's range", () => {
    const report = computeCoverLetterQuality(
      content({
        paragraphs: [
          "I am excited to apply for the Backend Engineer role, where my six years of experience with Node.js and PostgreSQL fits your team's stated needs well, and I am confident in my ability to contribute quickly and effectively from day one in this position.",
          "I would very much welcome the opportunity to discuss my background further with you at your earliest convenience, whenever that works best for your schedule.",
        ],
      }),
      "short",
    );
    expect(report.wordCountInRange).toBe(true);
  });

  it("detects a generic cliche phrase", () => {
    const report = computeCoverLetterQuality(
      content({ paragraphs: ["I am writing to express my interest in this role."] }),
    );
    expect(report.genericPhrasesFound).toContain("i am writing to express my interest");
  });

  it("reports no generic phrases when none are present", () => {
    const report = computeCoverLetterQuality(content());
    expect(report.genericPhrasesFound).toEqual([]);
  });

  it("detects an unfilled placeholder in a paragraph", () => {
    const report = computeCoverLetterQuality(
      content({ paragraphs: ["I would love to join [Company Name] as a backend engineer."] }),
    );
    expect(report.hasUnfilledPlaceholder).toBe(true);
  });

  it("detects an unfilled placeholder in the greeting", () => {
    const report = computeCoverLetterQuality(content({ greeting: "Dear [Hiring Manager]," }));
    expect(report.hasUnfilledPlaceholder).toBe(true);
    expect(report.greetingLooksIntentional).toBe(false);
  });

  it("treats the neutral fallback greeting as intentional", () => {
    const report = computeCoverLetterQuality(content({ greeting: "Dear Hiring Manager," }));
    expect(report.greetingLooksIntentional).toBe(true);
  });

  it("treats a named greeting with no placeholder as intentional", () => {
    const report = computeCoverLetterQuality(content({ greeting: "Dear Ms. Rivera," }));
    expect(report.greetingLooksIntentional).toBe(true);
  });

  it("flags a missing signer name", () => {
    const report = computeCoverLetterQuality(content({ fullName: null }));
    expect(report.hasSignerName).toBe(false);
  });

  it("confirms a signer name is present", () => {
    const report = computeCoverLetterQuality(content());
    expect(report.hasSignerName).toBe(true);
  });
});

describe("computeCoverLetterQuality — per language (#642)", () => {
  const french = content({
    greeting: "Madame, Monsieur,",
    paragraphs: [
      "Développeur backend depuis six ans, je souhaite rejoindre Acme pour renforcer la fiabilité de votre plateforme de paiement.",
      "Chez mon employeur actuel, j’ai migré notre API principale vers Node.js et PostgreSQL, réduisant la latence de 40 %.",
      "Je serais heureux d’échanger avec vous sur la manière dont mon expérience peut servir votre équipe.",
    ],
    signOff: "Veuillez agréer, Madame, Monsieur, l’expression de mes salutations distinguées.",
  });

  it.each([
    ["nl", "Geachte heer/mevrouw,", "Met vriendelijke groet,"],
    ["fr", "Madame, Monsieur,", "Veuillez agréer, Madame, Monsieur, mes salutations distinguées."],
    ["de", "Sehr geehrte Damen und Herren,", "Mit freundlichen Grüßen"],
  ] as const)("accepts the honest no-name greeting and sign-off in %s", (language, greeting, signOff) => {
    const report = computeCoverLetterQuality(content({ greeting, signOff }), "standard", language);
    expect(report.greetingLooksIntentional).toBe(true);
    expect(report.greetingMatchesLanguage).toBe(true);
  });

  it("accepts a named greeting in the letter's language", () => {
    const report = computeCoverLetterQuality(
      content({ greeting: "Geachte mevrouw De Vries,", signOff: "Hoogachtend," }),
      "standard",
      "nl",
    );
    expect(report.greetingLooksIntentional).toBe(true);
    expect(report.greetingMatchesLanguage).toBe(true);
  });

  it("doesn't flag a correct French letter", () => {
    const report = computeCoverLetterQuality(french, "standard", "fr");
    expect(report.greetingLooksIntentional).toBe(true);
    expect(report.greetingMatchesLanguage).toBe(true);
    expect(report.genericPhrasesFound).toEqual([]);
    expect(report.hasUnfilledPlaceholder).toBe(false);
  });

  it("flags an English greeting or sign-off left in a French letter", () => {
    expect(computeCoverLetterQuality({ ...french, greeting: "Dear Hiring Manager," }, "standard", "fr").greetingMatchesLanguage).toBe(false);
    expect(computeCoverLetterQuality({ ...french, signOff: "Sincerely," }, "standard", "fr").greetingMatchesLanguage).toBe(false);
  });

  it("flags a German greeting in a Dutch letter", () => {
    const report = computeCoverLetterQuality(
      content({ greeting: "Sehr geehrte Damen und Herren,", signOff: "Met vriendelijke groet," }),
      "standard",
      "nl",
    );
    expect(report.greetingMatchesLanguage).toBe(false);
  });

  it("skips the language check for English and for letters with no recorded language", () => {
    expect(computeCoverLetterQuality(content(), "standard", "en").greetingMatchesLanguage).toBeNull();
    expect(computeCoverLetterQuality(content()).greetingMatchesLanguage).toBeNull();
  });

  it("still flags a placeholder in a non-English greeting", () => {
    const report = computeCoverLetterQuality(content({ greeting: "Geachte [naam]," }), "standard", "nl");
    expect(report.greetingLooksIntentional).toBe(false);
    expect(report.hasUnfilledPlaceholder).toBe(true);
  });

  it("finds the language's own clichés, and English ones too", () => {
    const report = computeCoverLetterQuality(
      content({ paragraphs: ["Hierbij solliciteer ik als teamspeler, a real team player."] }),
      "standard",
      "nl",
    );
    expect(report.genericPhrasesFound).toEqual(expect.arrayContaining(["hierbij solliciteer ik", "teamspeler", "team player"]));
  });

  it("keeps the length check language-neutral", () => {
    const en = computeCoverLetterQuality(content(), "short");
    const nl = computeCoverLetterQuality(content(), "short", "nl");
    expect(nl.wordCount).toBe(en.wordCount);
    expect(nl.wordCountInRange).toBe(en.wordCountInRange);
  });
});
