import { describe, expect, it } from "vitest";
import { emptyProfile } from "../profile/contract";
import { buildProfileText } from "./buildProfileText";

describe("buildProfileText", () => {
  it("never sends profile links to a model", () => {
    const { text, includedFields } = buildProfileText({
      ...emptyProfile(),
      headline: "Backend engineer",
      links: [
        { kind: "github", label: null, url: "https://github.com/jordan-example" },
        { kind: "product", label: "Example App", url: "https://app.example.test" },
      ],
    });
    expect(text).toContain("Backend engineer");
    expect(text).not.toMatch(/github\.com|example\.test|Example App/);
    expect(includedFields).not.toContain("links");
  });
});
