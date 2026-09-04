import { describe, expect, it } from "vitest";
import {
  foldEmployerName,
  foldLocation,
  locationMatchesAny,
  normalizeContractType,
  normalizeLanguageToken,
} from "./vocabulary";

describe("location folding", () => {
  it("recognises Belgian city names across languages", () => {
    expect(foldLocation("Bruxelles")).toBe(foldLocation("Brussel"));
    expect(foldLocation("Brussels")).toBe(foldLocation("Bruxelles"));
    expect(foldLocation("Antwerpen")).toBe(foldLocation("Anvers"));
    expect(foldLocation("Liège")).toBe(foldLocation("Luik"));
  });

  it("matches a preference against a posting location in either direction", () => {
    expect(locationMatchesAny(["Hasselt"], "Hasselt, Belgium")).toBe(true);
    expect(locationMatchesAny(["Hasselt, Belgium"], "Hasselt")).toBe(true);
  });

  it("matches across the language a location happens to be written in", () => {
    expect(locationMatchesAny(["Brussels"], "Bruxelles, Belgique")).toBe(true);
    expect(locationMatchesAny(["Bruxelles"], "Brussel")).toBe(true);
  });

  it("does not match genuinely different places", () => {
    expect(locationMatchesAny(["Hasselt"], "Antwerp")).toBe(false);
  });
});

describe("contract type normalisation", () => {
  it("recognises common phrasings across languages", () => {
    expect(normalizeContractType("CDI")).toBe("permanent");
    expect(normalizeContractType("Vast contract")).toBe("permanent");
    expect(normalizeContractType("Fixed-term")).toBe("fixed_term");
    expect(normalizeContractType("CDD")).toBe("fixed_term");
    expect(normalizeContractType("Freelance")).toBe("contract");
    expect(normalizeContractType("Stage")).toBe("internship");
  });

  it("returns null rather than guessing at an unrecognised phrase", () => {
    // A wrong guess here would hide a job over a labelling difference
    // rather than a real one.
    expect(normalizeContractType("Something unusual")).toBeNull();
  });
});

describe("language token normalisation", () => {
  it("recognises names in the languages JobMatch launches with", () => {
    expect(normalizeLanguageToken("Dutch")).toBe("nl");
    expect(normalizeLanguageToken("Nederlands")).toBe("nl");
    expect(normalizeLanguageToken("French")).toBe("fr");
    expect(normalizeLanguageToken("German")).toBe("de");
  });

  it("passes a bare two-letter code through", () => {
    expect(normalizeLanguageToken("en")).toBe("en");
    expect(normalizeLanguageToken("NL")).toBe("nl");
  });

  it("returns null for an unrecognised token", () => {
    expect(normalizeLanguageToken("Klingon")).toBeNull();
  });
});

describe("employer name folding", () => {
  it("treats a legal-suffix variant as the same employer", () => {
    expect(foldEmployerName("Example NV")).toBe(foldEmployerName("Example"));
    expect(foldEmployerName("Example BVBA")).toBe(foldEmployerName("EXAMPLE"));
  });

  it("keeps genuinely different names apart", () => {
    expect(foldEmployerName("Example NV")).not.toBe(foldEmployerName("Other Example NV"));
  });
});
