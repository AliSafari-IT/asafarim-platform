import { describe, expect, it } from "vitest";
import { parseProfileContent } from "../../profile/contract";
import { NO_EVIDENCE } from "../../evidence/prompt";
import { degreeRequirement, educationLevel } from "./degrees";
import { extractRequirements } from "./requirements";
import { clarificationQuestions, selectTailoringInputs } from "./select";

/** Synthetic fixtures only: no real CV or posting text. */

const profile = (education: { qualification: string; institution?: string }[], summary = "Built web apps.") =>
  parseProfileContent({ experience: [{ title: "Developer", employer: "A", summary }], education });

const status = (education: { qualification: string }[], line: string, summary?: string) =>
  selectTailoringInputs({ profile: profile(education, summary), jobText: `Jouw profiel\n- ${line}`, evidence: NO_EVIDENCE }).coverage[0]!;

const PHD_MSC_BSC = [
  { qualification: "Applied Information Technology — Programming" },
  { qualification: "PhD in Engineering Hydrology" },
  { qualification: "MSc & BSc in Natural Resources Engineering" },
];

describe("educationLevel", () => {
  it("reads abbreviations and words, in four languages", () => {
    expect(educationLevel("MSc & BSc in Natural Resources Engineering")).toBe(2);
    expect(educationLevel("PhD in Engineering Hydrology")).toBe(3);
    expect(educationLevel("Ph.D. Physics")).toBe(3);
    expect(educationLevel("Bachelor Toegepaste Informatica")).toBe(1);
    expect(educationLevel("Master's degree in Economics")).toBe(2);
    expect(educationLevel("Doctoraat in de wetenschappen")).toBe(3);
    expect(educationLevel("Licentiaat Rechten")).toBe(2);
  });

  it("is null for an entry that names no degree level", () => {
    expect(educationLevel("Applied Information Technology — Programming")).toBeNull();
    expect(educationLevel("Diploma secundair onderwijs")).toBeNull();
    expect(educationLevel("Certified Scrum Master")).toBeNull();
    expect(educationLevel("Licentie Microsoft 365")).toBeNull();
  });
});

describe("degree requirements", () => {
  it("a PhD and an MSc meet 'Bachelor- of masterdiploma', citing the education entries", () => {
    const c = status(PHD_MSC_BSC, "Bachelor- of masterdiploma.");
    expect(c.status).toBe("supported");
    expect(c.sourceIds.sort()).toEqual(["edu:1", "edu:2"]);
  });

  it("is never asked about once the education meets it", () => {
    const { coverage } = selectTailoringInputs({
      profile: profile(PHD_MSC_BSC),
      jobText: "Jouw profiel\n- Bachelor- of masterdiploma.\n- Ervaring met ERP-, WMS- of logistieke toepassingen is een pluspunt.",
      evidence: NO_EVIDENCE,
    });
    expect(clarificationQuestions(coverage).map((q) => q.text)).toEqual(["Ervaring met ERP-, WMS- of logistieke toepassingen is een pluspunt."]);
  });

  it("levels: a higher degree meets a lower one, never the reverse", () => {
    expect(status([{ qualification: "PhD in Chemistry" }], "Master's degree required").status).toBe("supported");
    expect(status([{ qualification: "BSc Chemistry" }], "Bachelor or master degree").status).toBe("supported");
    expect(status([{ qualification: "BSc Chemistry" }], "Master's degree required").status).toBe("unknown");
    expect(status([{ qualification: "BSc Chemistry" }], "PhD in a quantitative field").status).toBe("unknown");
  });

  it("a field the requirement names must be named by the same entry", () => {
    expect(status(PHD_MSC_BSC, "Master in Computer Science").status).toBe("unknown");
    expect(status(PHD_MSC_BSC, "Master in AI").status).toBe("unknown");
    expect(status(PHD_MSC_BSC, "Master in Education").status).toBe("unknown");
    expect(status([{ qualification: "MSc Computer Science" }], "Master in Computer Science or a related field").status).toBe("supported");
    expect(status([{ qualification: "PhD in Engineering Hydrology" }], "Master in engineering").status).toBe("supported");
  });

  it("'hoger onderwijs' and similar describe the degree, not its subject", () => {
    expect(status(PHD_MSC_BSC, "Diploma hoger onderwijs (bachelor of master)").status).toBe("supported");
    expect(status(PHD_MSC_BSC, "Een relevant universitair diploma of gelijkwaardige ervaring").status).toBe("supported");
  });

  it("only education counts: a degree word in a summary or role is not a degree", () => {
    expect(status([], "Bachelor- of masterdiploma.", "Mentored master students on their thesis.").status).toBe("unknown");
    expect(status([{ qualification: "Applied Information Technology — Programming" }], "Bachelor degree").status).toBe("unknown");
  });

  it("Scrum Master and master data are not degree requirements", () => {
    const scrum = extractRequirements("Requirements:\n- Certified Scrum Master")[0]!;
    expect(degreeRequirement(scrum)).toBeNull();
    const mdm = extractRequirements("Requirements:\n- Experience with master data management")[0]!;
    expect(degreeRequirement(mdm)).toBeNull();
    expect(status(PHD_MSC_BSC, "Certified Scrum Master").status).toBe("unknown");
  });

  it("the candidate's 'no' still wins, as a conflict the candidate settles", () => {
    const jobText = "Jouw profiel\n- Bachelor- of masterdiploma.";
    const id = extractRequirements(jobText)[0]!.id;
    const c = selectTailoringInputs({ profile: profile(PHD_MSC_BSC), jobText, evidence: NO_EVIDENCE, unmetRequirementIds: [id] }).coverage[0]!;
    expect(c).toMatchObject({ status: "conflict", unmetBy: "candidate" });
  });
});
