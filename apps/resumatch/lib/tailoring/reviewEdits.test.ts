import { describe, expect, it } from "vitest";
import {
  approvedBullets,
  approvedOwnBullets,
  buildReviewBullets,
  isOwnBullet,
  orderProfileSkills,
  seedSkillEdits,
} from "./reviewEdits";

const keys = () => {
  let n = 0;
  return () => `k${++n}`;
};

describe("orderProfileSkills", () => {
  it("keeps only profile skills, in the AI's order, with the rest after", () => {
    expect(orderProfileSkills(["sql", "Rust", "React"], ["React", "Node.js", "SQL"])).toEqual(["SQL", "React", "Node.js"]);
  });
});

describe("seedSkillEdits", () => {
  it("drops edits the current profile makes moot", () => {
    expect(
      seedSkillEdits({ addedSkills: ["Go", "react"], removedSkills: ["SQL", "Cobol"] }, ["React", "SQL"]),
    ).toEqual({ addedSkills: ["Go"], removedSkills: ["SQL"] });
  });
});

describe("review bullets", () => {
  it("shows the profile's role summary when the AI wrote no bullets, so adding one keeps it", () => {
    const bullets = buildReviewBullets([], [], "Maintained the payroll service.", keys());
    expect(bullets).toEqual([
      { key: "k1", text: "Maintained the payroll service.", accepted: true, aiText: "Maintained the payroll service.", fromProfile: true },
    ]);
    expect(isOwnBullet(bullets[0])).toBe(false);
    bullets.push({ key: "x", text: "Trained new hires.", accepted: true, aiText: null });
    expect(approvedBullets(bullets)).toEqual(["Maintained the payroll service.", "Trained new hires."]);
    expect(approvedOwnBullets(bullets)).toEqual(["Trained new hires."]);
    // Not shown twice when a regenerate brings back the same text as the candidate's own.
    expect(buildReviewBullets([], ["Maintained the payroll service."], "Maintained the payroll service.", keys())).toHaveLength(1);
  });

  it("puts the candidate's own bullets first and ticks no more than eight", () => {
    const ai = Array.from({ length: 8 }, (_, i) => `AI ${i}`);
    const bullets = buildReviewBullets(ai, ["Mine"], "Profile summary.", keys());
    expect(bullets[0]).toMatchObject({ text: "Mine", aiText: null, accepted: true });
    expect(bullets.filter((b) => b.accepted)).toHaveLength(8);
    expect(bullets.at(-1)?.accepted).toBe(false);
  });

  it("sends ticked, non-empty bullets and remembers only the candidate's own", () => {
    const bullets = buildReviewBullets(["AI one", "AI two", "AI three"], [], null, keys());
    bullets[0].text = "AI one, reworded by me";
    bullets[1].accepted = false;
    bullets.push({ key: "x", text: "  ", accepted: true, aiText: null });
    bullets.push({ key: "y", text: " Written by me ", accepted: true, aiText: null });
    expect(isOwnBullet(bullets[0])).toBe(true);
    expect(isOwnBullet(bullets[2])).toBe(false);
    expect(approvedBullets(bullets)).toEqual(["AI one, reworded by me", "AI three", "Written by me"]);
    expect(approvedOwnBullets(bullets)).toEqual(["AI one, reworded by me", "Written by me"]);
  });
});

describe("the skill order the review sends", () => {
  it("fits the proposal cap and still saves the order the review shows", async () => {
    const { mergeTailoringSuggestions } = await import("./ai/schema");
    const names = Array.from({ length: 65 }, (_, i) => `Skill ${i}`);
    const shown = orderProfileSkills(["Skill 64", "Skill 3"], names);
    expect(shown).toHaveLength(65);
    const profile = {
      fullName: null, email: null, phone: null, baseLocation: null, links: [], headline: null, summary: null,
      skills: names.map((name) => ({ name, level: null })),
      experience: [], education: [], certifications: [], languages: [],
    } as never;
    const saved = mergeTailoringSuggestions(profile, {
      headline: null, summary: null, skillsOrder: shown.slice(0, 60), experienceBullets: [],
    });
    expect(saved.skills).toEqual(shown);
  });
});

describe("claim-check flags on the review (#930)", () => {
  it("starts a flagged AI bullet unticked and keeps its sources and reasons", () => {
    let n = 0;
    const bullets = buildReviewBullets(["Built Go services", "Ran Kubernetes clusters"], [], null, () => `k${n++}`, [
      { sources: ["Backend Engineer · Contoso"], flags: [] },
      { sources: ["Backend Engineer · Contoso"], flags: ["unsupported_requirement"] },
    ]);
    expect(bullets.map((b) => b.accepted)).toEqual([true, false]);
    expect(bullets[1]).toMatchObject({ flags: ["unsupported_requirement"], sources: ["Backend Engineer · Contoso"] });
    expect(approvedBullets(bullets)).toEqual(["Built Go services"]);
  });

  it("without metadata behaves exactly as before", () => {
    let n = 0;
    const bullets = buildReviewBullets(["A", "B"], [], null, () => `k${n++}`);
    expect(bullets.every((b) => b.accepted && b.flags === undefined)).toBe(true);
  });
});
