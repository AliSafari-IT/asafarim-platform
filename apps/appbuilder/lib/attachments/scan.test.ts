import { describe, expect, it } from "vitest";
import { resolveScanAdapter, ScannerNotConfiguredError } from "./scan";

describe("resolveScanAdapter", () => {
  it("falls back to the honest no-op adapter outside production when unconfigured", async () => {
    const adapter = resolveScanAdapter({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
    const result = await adapter.scan(Buffer.from("x"), "text/plain");
    expect(result.verdict).toBe("not_configured");
  });

  it("fails closed in production when no scanner is configured", () => {
    expect(() => resolveScanAdapter({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(
      ScannerNotConfiguredError,
    );
  });

  it("fails closed on an unrecognized configured adapter name, in every environment", () => {
    expect(() =>
      resolveScanAdapter({ NODE_ENV: "test", APPBUILDER_ATTACHMENT_SCANNER: "not-a-real-adapter" } as NodeJS.ProcessEnv),
    ).toThrow(/Unrecognized/);
  });
});
