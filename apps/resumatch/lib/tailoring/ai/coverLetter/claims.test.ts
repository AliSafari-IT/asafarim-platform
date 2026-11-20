import { describe, expect, it } from "vitest";
import { claimEvidence, splitSentences, stripUnbackedClaims, unbackedClaims } from "./claims";
import { groundCoverLetterSuggestion } from "./grounding";

/** A profile in the shape buildProfileText produces — no mentoring, no team lead. */
const PROFILE = [
  "AI Application Developer",
  "Full-stack developer building production AI systems end to end.",
  "Languages: Dutch (professional), English (professional), Persian (native).",
  "Skills: ASP.NET Core, Node.js, React, TypeScript, SQL Server, PostgreSQL, pgvector, MongoDB, Docker, GitHub Actions, Azure DevOps.",
  "AI Application Developer at Probex Belgium (2024-01 to present): Lead code reviews and end-to-end testing for products such as immostory; turn findings into improvements; produce technical documentation; promote products externally on LinkedIn.",
].join("\n");

const JOB =
  "Als Application & Solutions Engineer bij PVS train je Sales, Support en distributiepartners en ben je tweedelijns technisch expert. DSP en netwerkaudio. Contact: Ms. Grauls.";

const evidence = claimEvidence(PROFILE);

describe("unbackedClaims", () => {
  it("flags the invented mentoring claim from the reported letter", () => {
    expect(unbackedClaims("I also mentor developers, produce technical documentation and promote products externally.", evidence)).toEqual([
      "mentoring",
    ]);
  });

  it("accepts mentoring when the profile states it", () => {
    const backed = claimEvidence(`${PROFILE}\nMentored two junior developers.`);
    expect(unbackedClaims("I also mentor developers.", backed)).toEqual([]);
  });

  it("flags invented people leadership but not leading code reviews", () => {
    expect(unbackedClaims("At Acme I led a team of five engineers.", evidence)).toContain("people_leadership");
    expect(unbackedClaims("I managed the development team.", evidence)).toContain("people_leadership");
    expect(unbackedClaims("At Probex I lead code reviews and end-to-end testing for the development teams.", evidence)).toEqual([]);
  });

  it("flags training people only when the profile never mentions it", () => {
    expect(unbackedClaims("I have trained colleagues on our deployment pipeline.", evidence)).toContain("training_people");
    expect(unbackedClaims("I trained models on GPU clusters.", evidence)).toEqual([]);
  });

  it("checks spoken languages against the profile, across label languages", () => {
    expect(unbackedClaims("I speak Dutch and English at a professional level.", evidence)).toEqual([]);
    expect(unbackedClaims("I speak Dutch, English and French.", evidence)).toEqual(["spoken_language"]);
    expect(unbackedClaims("I am fluent in German.", evidence)).toEqual(["spoken_language"]);
    const nlLabels = claimEvidence("Talen: Nederlands, Engels.");
    expect(unbackedClaims("I speak Dutch.", nlLabels)).toEqual([]);
  });

  it("flags certifications, awards, publications without evidence", () => {
    expect(unbackedClaims("I am an AWS certified architect.", evidence)).toContain("certification");
    expect(unbackedClaims("My work was awarded a prize in 2023.", evidence)).toContain("award");
    expect(unbackedClaims("I have published papers on retrieval.", evidence)).toContain("publication");
  });

  it("covers common Dutch, French and German phrasings", () => {
    expect(unbackedClaims("Daarnaast begeleid ik ontwikkelaars.", evidence)).toContain("mentoring");
    expect(unbackedClaims("J'encadre des développeurs juniors.", evidence)).toContain("mentoring");
    expect(unbackedClaims("Ich leite ein Team von Entwicklern.", evidence)).toContain("people_leadership");
  });

  it("does not treat the job's own duties as evidence", () => {
    // The job asks for training partners; the profile never says the candidate did it.
    expect(unbackedClaims("I have trained distribution partners and staff.", claimEvidence(PROFILE))).toContain("training_people");
  });
});

describe("splitSentences", () => {
  it("keeps tech names and abbreviations intact", () => {
    expect(splitSentences("I use ASP.NET Core and Node.js daily. I also test e.g. APIs.")).toEqual([
      "I use ASP.NET Core and Node.js daily.",
      "I also test e.g. APIs.",
    ]);
  });
});

describe("stripUnbackedClaims", () => {
  it("removes only the offending sentence", () => {
    const paragraph =
      "My background includes preparing production systems for demonstrations. I also mentor developers, produce technical documentation and promote products externally. I speak Dutch and English at a professional level.";
    const result = stripUnbackedClaims(paragraph, evidence);
    expect(result.removedSentences).toBe(1);
    expect(result.paragraph).toBe(
      "My background includes preparing production systems for demonstrations. I speak Dutch and English at a professional level.",
    );
  });

  it("returns null when every sentence is unbacked", () => {
    expect(stripUnbackedClaims("I mentor developers. I led a team of engineers.", evidence).paragraph).toBeNull();
  });
});

describe("groundCoverLetterSuggestion — claim check", () => {
  it("strips the mentoring sentence from the reported letter and keeps the rest", () => {
    const result = groundCoverLetterSuggestion(
      {
        greeting: "Dear Ms. Grauls,",
        paragraphs: [
          "I am applying for the Application & Solutions Engineer position at PVS.",
          "My background includes preparing production systems for demonstrations. I also mentor developers, produce technical documentation and promote products externally, which maps well to training Sales, Support and distribution partners.",
        ],
        signOff: "Sincerely,",
      },
      PROFILE,
      JOB,
      "en",
    );
    expect(result.removedClaimSentences).toBe(1);
    expect(result.suggestion?.paragraphs).toHaveLength(2);
    expect(result.suggestion?.paragraphs.join(" ")).not.toMatch(/mentor/i);
  });

  it("degrades when nothing grounded is left", () => {
    const result = groundCoverLetterSuggestion(
      { greeting: "Dear Hiring Manager,", paragraphs: ["I mentor developers."], signOff: "Sincerely," },
      PROFILE,
      JOB,
      "en",
    );
    expect(result.suggestion).toBeNull();
  });
});
