import { describe, expect, it } from "vitest";
import { NO_EVIDENCE } from "../../evidence/prompt";
import { parseProfileContent } from "../../profile/contract";
import type { FitModelOutput } from "./contract";
import { buildFitInputs } from "./inputs";
import { applyOverlay } from "./overlay";
import { scoreFit } from "./rubric";
import { validateFitOutput } from "./validate";

/**
 * #973 reproduction, synthetic: a Dutch posting against an English profile
 * with many skills the job never asks about. The old preview divided the
 * CV's skills that shared a word with the posting by all the CV's skills
 * (8% for a real case) and listed frequent posting words ("collega",
 * "tot", "leden", "oplossingen") as "not covered". The background match is
 * computed over the job's own requirements, so unrelated skills cannot
 * lower it, and only extracted requirements can ever be gaps.
 */

const JOB = `Full-stack ontwikkelaar
Je wordt lid van een team van tot 12 leden en werkt samen met elke collega aan oplossingen voor onze klanten.
Samen met je collega's bouw je oplossingen die werken.
Vereisten:
- Ervaring met TypeScript en React
- Kennis van relationele databanken
- Ervaring met Kubernetes
- Vlot Nederlands`;

const UNRELATED = [
  "Hydrological modelling", "MATLAB", "Fortran", "ArcGIS", "QGIS", "R", "SPSS", "LaTeX", "Origin", "HEC-RAS",
  "MIKE SHE", "SWAT", "Remote sensing", "Statistics", "Field surveys", "ASP.NET Core", "C#", "SQL Server", "MongoDB",
  "Playwright", "Cypress", "Jest", "Vitest", "Docker", "GitHub Actions", "Azure DevOps", "Jira", "Confluence", "Figma",
  "Photoshop", "Illustrator", "Premiere", "Technical writing", "LinkedIn articles", "Scrum", "Kanban", "Mentoring",
  "Public speaking", "Persian", "French", "German", "Excel", "Power BI", "Tableau", "Python", "pandas", "NumPy",
  "SciPy", "Matplotlib", "Jupyter", "Linux", "Bash", "PowerShell", "Nginx", "Caddy", "Redis", "RabbitMQ", "Kafka",
];

function profile(extraSkills: string[]) {
  return parseProfileContent({
    fullName: "Sam Example",
    headline: "Full-stack developer",
    summary: "Full-stack developer building web applications with TypeScript and React.",
    skills: [{ name: "TypeScript" }, { name: "React" }, { name: "PostgreSQL" }, ...extraSkills.map((name) => ({ name }))],
    experience: [
      { title: "Full-stack developer", employer: "Example Software", summary: "Builds React and TypeScript front ends on PostgreSQL databases." },
    ],
  });
}

/** What a model reading Dutch against English returns: an equivalence, not
 *  a shared literal word, for the databases line. */
function reply(): FitModelOutput {
  return {
    requirements: [
      { key: "r1", quote: "Ervaring met TypeScript en React", priority: "required", category: "skill", essential: false, anyOf: null },
      { key: "r2", quote: "Kennis van relationele databanken", priority: "required", category: "skill", essential: false, anyOf: null },
      { key: "r3", quote: "Ervaring met Kubernetes", priority: "required", category: "skill", essential: false, anyOf: null },
      { key: "r4", quote: "Vlot Nederlands", priority: "required", category: "language", essential: true, anyOf: null },
    ],
    moreRequirementsOmitted: false,
    assessments: [
      { key: "r1", judgment: "direct", citations: [{ sourceId: "exp:0", quote: "Builds React and TypeScript front ends" }], explanation: "React and TypeScript in the current role.", equivalence: null },
      {
        key: "r2",
        judgment: "direct",
        citations: [{ sourceId: "exp:0", quote: "on PostgreSQL databases" }],
        explanation: "PostgreSQL is a relational database.",
        equivalence: { jobTerm: "relationele databanken", profileTerm: "PostgreSQL" },
      },
      { key: "r3", judgment: "unknown", citations: [], explanation: "Not mentioned.", equivalence: null },
      { key: "r4", judgment: "unknown", citations: [], explanation: "No language level stated.", equivalence: null },
    ],
  };
}

function score(extraSkills: string[]) {
  const inputs = buildFitInputs({ profile: profile(extraSkills), rawJobText: JOB, evidence: NO_EVIDENCE });
  const analysis = validateFitOutput({
    output: reply(),
    jobText: inputs.jobText,
    sources: inputs.sources,
    method: "ai",
    completeness: { jobTruncated: false, profileSentencesOmitted: 0 },
  });
  return { analysis, score: scoreFit(applyOverlay(analysis, [], []), { profileTooThin: inputs.profileTooThin }) };
}

describe("Dutch posting, English profile (#973)", () => {
  it("matches across languages through a stated equivalence", () => {
    const { analysis } = score([]);
    const db = analysis.assessments.find((a) => a.equivalence)!;
    expect(db.judgment).toBe("direct");
  });

  it("many unrelated skills do not lower the background match", () => {
    const few = score([]).score;
    const many = score(UNRELATED).score;
    expect(UNRELATED.length).toBeGreaterThan(50);
    expect(few.percent).toBe(50);
    expect(many.percent).toBe(few.percent);
    expect(many.completeness).toBe(few.completeness);
  });

  it("only extracted requirements can be gaps; posting boilerplate never is", () => {
    const { analysis, score: s } = score(UNRELATED);
    const quotes = new Map(analysis.requirements.map((r) => [r.id, r.quote]));
    for (const id of [...s.gaps, ...s.strengths, ...s.transferable]) expect(quotes.has(id)).toBe(true);
    const shown = analysis.requirements.map((r) => r.quote.toLowerCase());
    for (const word of ["collega", "tot", "leden", "oplossingen"]) expect(shown).not.toContain(word);
    // Unknown is never "not met".
    expect(s.counts.unmet).toBe(0);
  });
});
