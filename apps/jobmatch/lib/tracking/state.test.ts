import { describe, expect, it } from "vitest";
import { checkTransition } from "./state";

describe("tracked-job state transitions", () => {
  it("allows creating a new record only as SAVED", () => {
    expect(checkTransition(null, "SAVED")).toEqual({ allowed: true, isNoop: false });
    expect(checkTransition(null, "REJECTED").allowed).toBe(false);
    expect(checkTransition(null, "APPLIED").allowed).toBe(false);
  });

  it("allows SAVED to REJECTED and back", () => {
    expect(checkTransition("SAVED", "REJECTED").allowed).toBe(true);
    expect(checkTransition("REJECTED", "SAVED").allowed).toBe(true);
  });

  it("allows APPLIED from either SAVED or REJECTED", () => {
    expect(checkTransition("SAVED", "APPLIED").allowed).toBe(true);
    expect(checkTransition("REJECTED", "APPLIED").allowed).toBe(true);
  });

  it("does not allow moving out of APPLIED", () => {
    expect(checkTransition("APPLIED", "SAVED").allowed).toBe(false);
    expect(checkTransition("APPLIED", "REJECTED").allowed).toBe(false);
  });

  it("treats a same-status transition as an allowed no-op, not a rejection", () => {
    expect(checkTransition("SAVED", "SAVED")).toEqual({ allowed: true, isNoop: true });
    expect(checkTransition("REJECTED", "REJECTED")).toEqual({ allowed: true, isNoop: true });
    expect(checkTransition("APPLIED", "APPLIED")).toEqual({ allowed: true, isNoop: true });
  });
});
