import { describe, expect, it } from "vitest";
import {
  MAX_EXTRACTION_ATTEMPTS,
  type DocumentStatusName,
  canTransition,
  explainReasonCode,
  mayExtract,
  nextStatusAfterExtractionFailure,
  shouldRetryExtraction,
} from "./pipeline";
import {
  INSECURE_DEV_SCANNER_VALUE,
  createScanner,
  decideFromVerdict,
  nullScanner,
} from "./scanner";

const ALL_STATUSES: DocumentStatusName[] = [
  "UPLOADED",
  "SCANNING",
  "QUARANTINED",
  "CLEAN",
  "EXTRACTING",
  "EXTRACTED",
  "FAILED",
];

describe("document pipeline state machine", () => {
  it("permits extraction only from states a clean scan can reach", () => {
    const extractable = ALL_STATUSES.filter(mayExtract);
    expect(extractable).toEqual(["CLEAN", "EXTRACTING"]);
  });

  it("cannot reach an extractable state without passing through SCANNING", () => {
    // The whole security property in one assertion: from UPLOADED, the only
    // forward edge is SCANNING, and CLEAN is reachable from nowhere else.
    expect(canTransition("UPLOADED", "CLEAN")).toBe(false);
    expect(canTransition("UPLOADED", "EXTRACTING")).toBe(false);
    expect(canTransition("UPLOADED", "SCANNING")).toBe(true);

    const reachesClean = ALL_STATUSES.filter((s) => canTransition(s, "CLEAN"));
    expect(reachesClean).toEqual(["SCANNING"]);
  });

  it("never releases a quarantined document", () => {
    for (const target of ALL_STATUSES) {
      expect(canTransition("QUARANTINED", target)).toBe(false);
    }
  });

  it("treats EXTRACTED and FAILED as terminal", () => {
    for (const terminal of ["EXTRACTED", "FAILED"] as const) {
      for (const target of ALL_STATUSES) {
        expect(canTransition(terminal, target)).toBe(false);
      }
    }
  });

  it("bounds extraction retries", () => {
    expect(shouldRetryExtraction(0)).toBe(true);
    expect(shouldRetryExtraction(MAX_EXTRACTION_ATTEMPTS - 1)).toBe(true);
    expect(shouldRetryExtraction(MAX_EXTRACTION_ATTEMPTS)).toBe(false);

    expect(nextStatusAfterExtractionFailure(1)).toBe("EXTRACTING");
    expect(nextStatusAfterExtractionFailure(MAX_EXTRACTION_ATTEMPTS)).toBe("FAILED");
  });

  it("explains every reason code without leaking a parser or scanner message", () => {
    for (const code of [
      "MALWARE_DETECTED",
      "SCANNER_UNAVAILABLE",
      "UNSUPPORTED_TYPE",
      "DECLARED_TYPE_MISMATCH",
      "FILE_TOO_LARGE",
      "EMPTY_FILE",
      "ENCRYPTED_DOCUMENT",
      "NO_TEXT_LAYER",
      "EXTRACTION_ERROR",
    ]) {
      expect(explainReasonCode(code)).not.toBe("This document could not be processed.");
    }
    expect(explainReasonCode(null)).toBe("This document could not be processed.");
    expect(explainReasonCode("SOMETHING_NEW")).toBe("This document could not be processed.");
  });
});

describe("scan verdicts", () => {
  it("advances only on a clean verdict", () => {
    expect(decideFromVerdict({ outcome: "clean", scannerName: "x" })).toEqual({ advance: true });
  });

  it("quarantines an infected file", () => {
    expect(
      decideFromVerdict({ outcome: "infected", scannerName: "x", signature: "Eicar-Test" }),
    ).toEqual({ advance: false, reasonCode: "MALWARE_DETECTED" });
  });

  it("fails closed when the scanner cannot answer", () => {
    // The important one. An unscanned document must be handled exactly like
    // an infected one — never waved through as a dev-mode convenience.
    expect(decideFromVerdict({ outcome: "unavailable", scannerName: "x" })).toEqual({
      advance: false,
      reasonCode: "SCANNER_UNAVAILABLE",
    });
  });

  it("defaults to a scanner that quarantines when none is configured", async () => {
    const scanner = createScanner({});
    expect(scanner.name).toBe(nullScanner.name);
    const verdict = await scanner.scan(new Uint8Array([1, 2, 3]));
    expect(decideFromVerdict(verdict).advance).toBe(false);
  });

  it("does not silently disable scanning when the scanner URL is malformed", async () => {
    const scanner = createScanner({ JOBMATCH_SCANNER_URL: "not a url" });
    const verdict = await scanner.scan(new Uint8Array([1]));
    expect(decideFromVerdict(verdict).advance).toBe(false);
  });
});

describe("the insecure dev scanner", () => {
  it("is available in development, so the pipeline can be exercised locally", async () => {
    const scanner = createScanner({
      NODE_ENV: "development",
      JOBMATCH_SCANNER: INSECURE_DEV_SCANNER_VALUE,
    });
    const verdict = await scanner.scan(new Uint8Array([1]));
    expect(decideFromVerdict(verdict).advance).toBe(true);
  });

  it("is refused on every deployed environment, whatever the variable says", async () => {
    // The point of the control: setting this in production changes nothing.
    for (const deployed of [
      { NODE_ENV: "production" },
      { JOBMATCH_ENVIRONMENT: "production" },
      { JOBMATCH_ENVIRONMENT: "staging" },
      { NODE_ENV: "development", JOBMATCH_ENVIRONMENT: "staging" },
    ]) {
      const scanner = createScanner({ ...deployed, JOBMATCH_SCANNER: INSECURE_DEV_SCANNER_VALUE });
      const verdict = await scanner.scan(new Uint8Array([1]));
      expect(decideFromVerdict(verdict).advance).toBe(false);
    }
  });

  it("is selected only by its exact literal, never by a truthy value", async () => {
    for (const value of ["true", "1", "yes", "insecure", "accept-all", "INSECURE-ACCEPT-ALL"]) {
      const scanner = createScanner({ NODE_ENV: "development", JOBMATCH_SCANNER: value });
      const verdict = await scanner.scan(new Uint8Array([1]));
      expect(decideFromVerdict(verdict).advance).toBe(false);
    }
  });

  it("names itself on the verdict, so documents cleared this way stay identifiable", async () => {
    const scanner = createScanner({
      NODE_ENV: "development",
      JOBMATCH_SCANNER: INSECURE_DEV_SCANNER_VALUE,
    });
    const verdict = await scanner.scan(new Uint8Array([1]));
    expect(verdict.scannerName).toContain("insecure");
  });
});
