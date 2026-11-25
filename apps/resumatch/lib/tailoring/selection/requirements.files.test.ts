import { describe, expect, it } from "vitest";
import { combineJobFileTexts } from "../jobFiles";
import { extractRequirements } from "./requirements";

/** Several uploaded files (lib/tailoring/jobFiles.ts): each file starts
 *  with fresh section state, and the header is never a requirement. */
describe("extractRequirements across uploaded files", () => {
  it("does not carry a Requirements section into the next file", () => {
    const text = combineJobFileTexts(
      [
        { name: "vacancy.txt", text: "Frontend developer\nRequirements:\n- Experience with React and TypeScript" },
        { name: "company.txt", text: "We opened a second warehouse in 2023.\nOur team is spread over three countries." },
      ],
      10_000,
    );
    const found = extractRequirements(text).map((r) => r.text);
    expect(found.some((t) => t.includes("React"))).toBe(true);
    expect(found.some((t) => t.includes("warehouse") || t.includes("countries") || t.includes("File 2"))).toBe(false);
  });

  it("does not let a We offer section hide the next file's requirements", () => {
    const text = combineJobFileTexts(
      [
        { name: "benefits.txt", text: "We offer:\n- A company car\n- Hybrid working" },
        { name: "vacancy.txt", text: "Frontend developer\n- 3+ years of experience with React" },
      ],
      10_000,
    );
    const found = extractRequirements(text).map((r) => r.text);
    expect(found.some((t) => t.includes("3+ years"))).toBe(true);
    expect(found.some((t) => t.includes("company car"))).toBe(false);
  });
});
