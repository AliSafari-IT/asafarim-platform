import { describe, expect, it } from "vitest";
import { sourceCasing } from "./sourceCasing";

describe("sourceCasing", () => {
  const source = "Founder of ASafariM Digital (asafarim.com). Skills: TypeScript, PostgreSQL, React. Kingfisher IT is hiring.";
  const casing = sourceCasing(source);

  it("restores the source spelling of brand-like names", () => {
    expect(casing.apply("as founder of ASafarIM Digital")).toBe("as founder of ASafariM Digital");
    expect(casing.apply("Asafarim Digital and Typescript and Postgresql")).toBe("ASafariM Digital and TypeScript and PostgreSQL");
  });

  it("leaves ordinary words and plain capitals alone", () => {
    expect(casing.apply("REACT and react, The team, it works")).toBe("REACT and react, The team, it works");
  });

  it("keeps a form the source itself uses", () => {
    expect(sourceCasing("TypeScript and Typescript").apply("Typescript")).toBe("Typescript");
  });
});
