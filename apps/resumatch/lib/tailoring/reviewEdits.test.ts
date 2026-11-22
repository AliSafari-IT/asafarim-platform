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
  it("puts the candidate's own bullets first and ticks no more than eight", () => {
    const ai = Array.from({ length: 8 }, (_, i) => `AI ${i}`);
    const bullets = buildReviewBullets(ai, ["Mine"], keys());
    expect(bullets[0]).toMatchObject({ text: "Mine", aiText: null, accepted: true });
    expect(bullets.filter((b) => b.accepted)).toHaveLength(8);
    expect(bullets.at(-1)?.accepted).toBe(false);
  });

  it("sends ticked, non-empty bullets and remembers only the candidate's own", () => {
    const bullets = buildReviewBullets(["AI one", "AI two", "AI three"], [], keys());
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
