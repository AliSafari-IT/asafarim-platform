import { describe, expect, it } from "vitest";
import { COVER_LETTER_CONVENTIONS } from "../../language";
import { groundCoverLetterSuggestion } from "./grounding";
import { CoverLetterFixtureProvider } from "./providers/fixture";
import type { CoverLetterSuggestion } from "./schema";

const PROFILE = `Jane Doe
Backend engineer at Acme Corp, 2020-01 to 2023-12.
Built the payments API with Node.js and PostgreSQL.
Reduced p95 latency by 40%.`;

const JOB = `Globex is hiring a Senior Backend Engineer for its Payments team in Brussels.
You will own our TypeScript services on AWS.`;

function letter(paragraphs: string[], overrides: Partial<CoverLetterSuggestion> = {}): CoverLetterSuggestion {
  return { greeting: "Dear Hiring Manager,", paragraphs, signOff: "Sincerely,", ...overrides };
}

const GROUNDED = "At Acme Corp I built the payments API with Node.js and PostgreSQL and reduced latency by 40%.";

describe("groundCoverLetterSuggestion", () => {
  it("passes a well-grounded letter through unchanged", () => {
    const input = letter([
      "I am applying for the Senior Backend Engineer role at Globex.",
      GROUNDED,
      "I would welcome the chance to talk.",
    ]);
    const result = groundCoverLetterSuggestion(input, PROFILE, JOB, "en");
    expect(result.suggestion).toEqual(input);
    expect(result.droppedParagraphs).toBe(0);
    expect(result.greetingReplaced).toBe(false);
    expect(result.signOffReplaced).toBe(false);
  });

  it("does not flag the job posting's own terms (employer, role, location, stack)", () => {
    const input = letter(["I would love to join the Payments team at Globex in Brussels and work with TypeScript on AWS."]);
    expect(groundCoverLetterSuggestion(input, PROFILE, JOB, "en").suggestion).toEqual(input);
  });

  it("drops a paragraph naming an employer that is in neither source", () => {
    const input = letter([GROUNDED, "Before that I led the platform team at Initech."]);
    const result = groundCoverLetterSuggestion(input, PROFILE, JOB, "en");
    expect(result.suggestion?.paragraphs).toEqual([GROUNDED]);
    expect(result.droppedParagraphs).toBe(1);
  });

  it("drops a paragraph claiming a technology that is in neither source", () => {
    const input = letter([GROUNDED, "I also run our clusters on Kubernetes."]);
    expect(groundCoverLetterSuggestion(input, PROFILE, JOB, "en").suggestion?.paragraphs).toEqual([GROUNDED]);
  });

  it("drops a paragraph inventing a metric", () => {
    const input = letter([GROUNDED, "I cut infrastructure costs by 65%."]);
    expect(groundCoverLetterSuggestion(input, PROFILE, JOB, "en").suggestion?.paragraphs).toEqual([GROUNDED]);
  });

  it("degrades (null suggestion) when no paragraph survives", () => {
    const input = letter(["I scaled Kubernetes at Initech to 500 nodes."]);
    const result = groundCoverLetterSuggestion(input, PROFILE, JOB, "en");
    expect(result.suggestion).toBeNull();
    expect(result.droppedParagraphs).toBe(1);
  });

  it("replaces a greeting with an invented recipient by the neutral salutation", () => {
    const input = letter([GROUNDED], { greeting: "Dear Ms. Henderson," });
    const result = groundCoverLetterSuggestion(input, PROFILE, JOB, "en");
    expect(result.greetingReplaced).toBe(true);
    expect(result.suggestion?.greeting).toBe(COVER_LETTER_CONVENTIONS.en.neutralGreeting);
  });

  it("checks the name after an honorific in a paragraph too", () => {
    const input = letter([GROUNDED, "Dr. Petrov at Acme Corp can vouch for my work."]);
    expect(groundCoverLetterSuggestion(input, PROFILE, JOB, "en").suggestion?.paragraphs).toEqual([GROUNDED]);
  });

  it("keeps a greeting whose recipient the job posting names", () => {
    const input = letter([GROUNDED], { greeting: "Dear Ms. Henderson," });
    const result = groundCoverLetterSuggestion(input, PROFILE, `${JOB}\nContact: Ms. Henderson`, "en");
    expect(result.suggestion?.greeting).toBe("Dear Ms. Henderson,");
  });

  it("keeps every language's own neutral greeting and sign-off", () => {
    for (const language of ["en", "nl", "fr", "de"] as const) {
      const { neutralGreeting, signOff } = COVER_LETTER_CONVENTIONS[language];
      const result = groundCoverLetterSuggestion(letter([GROUNDED], { greeting: neutralGreeting, signOff }), PROFILE, JOB, language);
      expect(result.greetingReplaced).toBe(false);
      expect(result.signOffReplaced).toBe(false);
    }
  });

  it("replaces a sign-off carrying an invented metric with the conventional one", () => {
    const input = letter([GROUNDED], { signOff: "Ready to deliver 250% growth," });
    const result = groundCoverLetterSuggestion(input, PROFILE, JOB, "nl");
    expect(result.suggestion?.signOff).toBe(COVER_LETTER_CONVENTIONS.nl.signOff);
  });

  it("does not drop German prose for its capitalized nouns, but still catches numbers and tech names", () => {
    const german = "Bei Acme Corp habe ich die Zahlungs-API mit Node.js und PostgreSQL gebaut und die Latenz um 40% gesenkt.";
    const input = letter([german, "Außerdem betreibe ich Cluster mit K8s für 200 Kunden."]);
    const result = groundCoverLetterSuggestion(input, PROFILE, JOB, "de");
    expect(result.suggestion?.paragraphs).toEqual([german]);
  });

  it("lets every fixture-provider letter through, so offline runs never degrade", async () => {
    const output = await new CoverLetterFixtureProvider().generate({
      profileText: PROFILE,
      jobText: JOB,
      system: "system",
      user: "user",
      promptVersion: "cover_letter@1",
      model: "fixture-cover-letter-1",
    });
    expect(groundCoverLetterSuggestion(output.suggestion, PROFILE, JOB, null).suggestion).toEqual(output.suggestion);
  });
});
