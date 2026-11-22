import { describe, expect, it } from "vitest";
import { sourceCasing } from "./sourceCasing";

describe("sourceCasing", () => {
  const source = "Founder of ASafariM Digital (asafarim.com). Skills: TypeScript, PostgreSQL, React. Kingfisher IT is hiring.";
  const casing = sourceCasing(source);

  it("restores the source spelling of brand-like names", () => {
    expect(casing.apply("as founder of ASafariM Digital")).toBe("as founder of ASafariM Digital");
    expect(casing.apply("Asafarim Digital and Typescript and Postgresql")).toBe("ASafariM Digital and TypeScript and PostgreSQL");
  });

  it("always replaces the brand's retired spelling (#778), even when the source has it", () => {
    const retired = "ASafar" + "IM";
    expect(sourceCasing(`Founder of ${retired} Digital`).apply(`founder of ${retired} Digital`)).toBe("founder of ASafariM Digital");
  });

  it("leaves ordinary words and plain capitals alone", () => {
    expect(casing.apply("REACT and react, The team, it works")).toBe("REACT and react, The team, it works");
  });

  it("keeps a form the source itself uses", () => {
    expect(sourceCasing("TypeScript and Typescript").apply("Typescript")).toBe("Typescript");
  });
});
