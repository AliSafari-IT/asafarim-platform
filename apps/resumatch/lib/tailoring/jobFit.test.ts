import { describe, expect, it } from "vitest";
import { parseProfileContent } from "../profile/contract";
import { assessJobFit } from "./jobFit";

const developer = parseProfileContent({
  headline: "Full-stack developer · React · TypeScript · ASP.NET Core",
  summary:
    "Full-stack developer building AI-powered web applications with React, TypeScript, Node.js and ASP.NET Core. Background in engineering hydrology and scientific software. Writes end-to-end tests with Playwright and reviews code.",
  skills: [
    { name: "React" },
    { name: "TypeScript" },
    { name: "Node.js" },
    { name: "ASP.NET Core" },
    { name: "PostgreSQL" },
    { name: "SQL Server" },
    { name: "MongoDB" },
    { name: "Playwright" },
    { name: "CI/CD" },
    { name: "Docker" },
  ],
  experience: [
    {
      title: "Full-stack developer",
      employer: "Probex",
      summary: "QA and end-to-end testing of web platforms with Playwright; develops features in React and Node.js; reviews pull requests.",
    },
    {
      title: "Scientific software developer",
      employer: "University",
      summary: "Built hydrological models and data pipelines; analysed rainfall and river discharge data; wrote reports.",
    },
  ],
  education: [{ qualification: "MSc Engineering Hydrology" }],
});

const reactJob = `Senior Frontend Developer (React / TypeScript)
We are looking for a frontend developer to build our React applications.
You write TypeScript every day, use Node.js tooling, and test with Playwright.
Requirements: 4+ years React, TypeScript, REST APIs, Docker, CI/CD pipelines.
Nice to have: PostgreSQL, ASP.NET Core. You review code and mentor juniors.
You will develop new features for our web applications and improve test coverage.`;

const nurseJob = `Verpleegkundige ziekenhuis – afdeling geriatrie
Als verpleegkundige sta je in voor de zorg van patiënten op de afdeling geriatrie.
Je dient medicatie toe, volgt de patiënten op, verzorgt wonden en werkt nauw samen met artsen.
Vereisten: bachelor verpleegkunde, erkenning als verpleegkundige, ervaring in de zorg voor ouderen.
Je werkt in een ploegensysteem, ook in het weekend en 's nachts. Patiëntenzorg en empathie staan centraal.
Je overlegt met het zorgteam over de verzorging en het welzijn van de patiënt.`;

const truckJob = `Truck driver C/E – international transport
We are hiring a truck driver with a valid C/E driving licence and code 95.
You drive international routes across Benelux, France and Germany, load and unload freight,
secure cargo, keep the tachograph up to date and inspect the truck before every trip.
Requirements: driving licence C/E, code 95, ADR certificate is a plus, experience with trailers and freight.
Flexible driving hours, overnight routes, forklift experience welcome. Safe driving record required.`;

const hydrologyJob = `Hydrologist – flood risk modelling
You build hydrological and hydraulic models for river catchments and analyse rainfall and discharge data.
You write Python scripts to automate data pipelines, prepare flood risk reports and present results.
Requirements: MSc in hydrology or water engineering, experience with hydrological models, rainfall-runoff data,
GIS, Python. Knowledge of river discharge measurements is a plus. You report to the water management team.`;

describe("assessJobFit", () => {
  it("rates a developer posting as a strong fit for a developer", () => {
    const fit = assessJobFit(developer, reactJob);
    expect(fit.level).toBe("strong");
    expect(fit.matchedSkills).toEqual(expect.arrayContaining(["React", "TypeScript", "Node.js", "Playwright"]));
    expect(fit.closestExperience[0]?.title).toBe("Full-stack developer");
  });

  it("warns for a nursing posting (Dutch) against a developer profile", () => {
    const fit = assessJobFit(developer, nurseJob);
    expect(fit.level).toBe("low");
    expect(fit.matchedSkills).toEqual([]);
    expect(fit.missingTerms.map((t) => t.toLowerCase())).toContain("verpleegkundige");
  });

  it("warns for a truck-driver posting against a developer profile", () => {
    const fit = assessJobFit(developer, truckJob);
    expect(fit.level).toBe("low");
    expect(fit.missingTerms).toEqual(expect.arrayContaining(["truck", "driving"]));
  });

  it("does not warn for a posting that matches the candidate's background, not their current job", () => {
    const fit = assessJobFit(developer, hydrologyJob);
    expect(fit.level).not.toBe("low");
    expect(fit.closestExperience[0]?.title).toBe("Scientific software developer");
  });

  it("returns unknown, never a warning, for an almost empty profile", () => {
    const fit = assessJobFit(parseProfileContent({ headline: "Hi" }), truckJob);
    expect(fit.level).toBe("unknown");
  });

  it("returns unknown for a posting with hardly any text", () => {
    expect(assessJobFit(developer, "Driver wanted. Apply now.").level).toBe("unknown");
  });

  it("lists at most ten matched and ten missing terms", () => {
    const fit = assessJobFit(developer, truckJob);
    expect(fit.matchedTerms.length).toBeLessThanOrEqual(10);
    expect(fit.missingTerms.length).toBeLessThanOrEqual(10);
    expect(fit.termsConsidered).toBeLessThanOrEqual(25);
  });

  it("is deterministic", () => {
    expect(assessJobFit(developer, nurseJob)).toEqual(assessJobFit(developer, nurseJob));
  });

  it("matches short technical skill names (C++, C#, CI/CD) and applies the three-skill exception", () => {
    const embedded = parseProfileContent({
      headline: "Embedded engineer",
      summary: "Writes firmware for industrial controllers.",
      skills: [{ name: "C++" }, { name: "C#" }, { name: "CI/CD" }],
      experience: [{ title: "Embedded engineer", summary: "Firmware for industrial controllers." }],
    });
    const job = `Game studio hiring. Engine programmer: gameplay systems, rendering, shaders, physics,
      animation, multiplayer netcode, consoles, profiling, tooling. You use C++ and C# daily and keep our CI/CD green.
      Gameplay, rendering, shaders, physics, animation, netcode, consoles.`;
    const fit = assessJobFit(embedded, job);
    expect(fit.matchedSkills).toEqual(["C++", "C#", "CI/CD"]);
    expect(fit.level).not.toBe("low");
  });
});

