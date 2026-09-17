import { describe, expect, it } from "vitest";
import { buildHealthPayload } from "./health";

const noScanner = async () => ({ configured: false, reachable: false });

describe("health payload", () => {
  it("reports ok when every check passes", async () => {
    const payload = await buildHealthPayload(new Date(0), async () => true, "0.1.0", [], noScanner);
    expect(payload).toEqual({
      ok: true,
      service: "jobmatch",
      version: "0.1.0",
      checks: { process: true, database: true },
      scanner: { configured: false, reachable: false },
      warnings: [],
      timestamp: "1970-01-01T00:00:00.000Z",
    });
  });

  it("reports not-ok when the database is unreachable", async () => {
    const payload = await buildHealthPayload(new Date(0), async () => false, "0.1.0", [], noScanner);
    expect(payload.ok).toBe(false);
    expect(payload.checks.database).toBe(false);
  });

  it("exposes nothing about how the database is reached", async () => {
    const payload = await buildHealthPayload(new Date(0), async () => false, "0.1.0", [], noScanner);
    const serialized = JSON.stringify(payload);
    for (const leak of ["postgres", "jobmatch_dev", "5432", "55437", "@"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("does not let a scanner outage flip the overall ok flag", async () => {
    // A ClamAV outage should be visible, not turn into a container restart
    // loop that cannot fix a sidecar — see the module doc comment.
    const payload = await buildHealthPayload(
      new Date(0),
      async () => true,
      "0.1.0",
      [],
      async () => ({ configured: true, reachable: false }),
    );
    expect(payload.ok).toBe(true);
    expect(payload.scanner).toEqual({ configured: true, reachable: false });
  });
});

describe("health warnings", () => {
  it("reports configuration warnings without failing the check", async () => {
    // A loopback sign-in URL in production is worth an operator's attention
    // and is not a reason to report the service as down.
    const payload = await buildHealthPayload(
      new Date(0),
      async () => true,
      "0.1.0",
      ["NEXT_PUBLIC_JOBMATCH_URL is unset or points at localhost"],
      noScanner,
    );
    expect(payload.ok).toBe(true);
    expect(payload.warnings).toHaveLength(1);
  });

  it("still names no values in a warning", async () => {
    const payload = await buildHealthPayload(
      new Date(0),
      async () => true,
      "0.1.0",
      ["NEXT_PUBLIC_HUB_URL is unset or points at localhost"],
      noScanner,
    );
    expect(JSON.stringify(payload)).not.toContain("://");
  });
});
