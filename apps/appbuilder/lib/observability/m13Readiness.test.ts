import { describe, expect, it } from "vitest";
import {
  checkEvaluationReadiness,
  checkMalwareScanningReadiness,
  checkModelVisionReadiness,
  checkStorageReadiness,
  checkUrlImportReadiness,
  m13LaunchBlockingIssues,
  type M13ReadinessSection,
  type M13ReadinessSnapshot,
} from "./m13Readiness";

const REMOTE_STORAGE = {
  STORAGE_ENDPOINT: "https://s3.example.test",
  STORAGE_BUCKET: "appbuilder",
  STORAGE_ACCESS_KEY: "key",
  STORAGE_SECRET_KEY: "secret",
};

/**
 * The single rule every case below exists to enforce, from the M13 doc:
 * "Unconfigured dependencies must not report healthy."
 */
function expectNotHealthy(section: M13ReadinessSection) {
  expect(section.status).not.toBe("healthy");
}

describe("storage readiness", () => {
  it("is healthy only when a remote bucket is fully configured", () => {
    expect(checkStorageReadiness({ ...REMOTE_STORAGE }).status).toBe("healthy");
  });

  it("is unhealthy in production with no remote bucket — files would be lost on redeploy", () => {
    const section = checkStorageReadiness({ NODE_ENV: "production" });
    expect(section.status).toBe("unhealthy");
    expect(section.summary).toMatch(/redeploy/i);
  });

  it("is unhealthy in production when the local driver is explicitly selected", () => {
    expectNotHealthy(
      checkStorageReadiness({ NODE_ENV: "production", STORAGE_DRIVER: "local" })
    );
  });

  it("is unhealthy when remote storage is requested but incompletely configured", () => {
    const section = checkStorageReadiness({
      STORAGE_DRIVER: "s3",
      STORAGE_ENDPOINT: "https://s3.example.test",
      // no bucket, no credentials
    });
    expect(section.status).toBe("unhealthy");
  });

  it("reports local-driver development as not_configured, never healthy", () => {
    expect(checkStorageReadiness({}).status).toBe("not_configured");
  });

  it("never echoes credential values", () => {
    const section = checkStorageReadiness({ ...REMOTE_STORAGE });
    const serialized = JSON.stringify(section);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("key");
  });
});

describe("malware scanning readiness", () => {
  it("is unhealthy in production with no scanner configured (uploads already fail closed)", () => {
    const section = checkMalwareScanningReadiness({ NODE_ENV: "production" });
    expect(section.status).toBe("unhealthy");
  });

  it("is unhealthy for a typo'd adapter name in any environment", () => {
    expectNotHealthy(
      checkMalwareScanningReadiness({ APPBUILDER_ATTACHMENT_SCANNER: "clamavv" })
    );
    expectNotHealthy(
      checkMalwareScanningReadiness({
        NODE_ENV: "production",
        APPBUILDER_ATTACHMENT_SCANNER: "clamavv",
      })
    );
  });

  it("reports the development no-op adapter as not_configured", () => {
    const section = checkMalwareScanningReadiness({});
    expect(section.status).toBe("not_configured");
    expect(section.detail.resolvedAdapter).toBe("noop");
  });
});

describe("model vision readiness", () => {
  it("reports 'off' as not_configured, not as a fault", () => {
    const section = checkModelVisionReadiness({});
    expect(section.status).toBe("not_configured");
    expect(section.summary).toMatch(/vision_unavailable/);
  });

  it("is unhealthy when the flag is on but no provider path sends image parts", () => {
    // Turning the flag on today would claim a capability that does not
    // exist — the readiness section must say so rather than go green.
    const section = checkModelVisionReadiness({ APPBUILDER_VISION_ENABLED: "true" });
    expect(section.status).toBe("unhealthy");
    expect(section.detail.imagePartsImplemented).toBe(false);
  });
});

describe("URL import readiness", () => {
  it("is healthy when enabled and not_configured when off — never unhealthy for being off", () => {
    expect(checkUrlImportReadiness({ APPBUILDER_URL_IMPORTS_ENABLED: "true" }).status).toBe(
      "healthy"
    );
    expect(checkUrlImportReadiness({}).status).toBe("not_configured");
  });

  it("never probes anything on read — a probing readiness endpoint is itself an SSRF surface", () => {
    expect(checkUrlImportReadiness({}).detail.probesOnRead).toBe(false);
  });

  it("states that GitHub is called without any token", () => {
    expect(checkUrlImportReadiness({}).detail.githubAuthentication).toMatch(/none/i);
  });
});

describe("evaluation readiness", () => {
  it("reports the corpus version this build was made against", () => {
    const section = checkEvaluationReadiness();
    expect(section.detail.evaluationVersion).toMatch(/^m13\./);
  });
});

describe("launch-blocking issues", () => {
  const section = (status: M13ReadinessSection["status"]): M13ReadinessSection => ({
    status,
    summary: `summary for ${status}`,
    detail: {},
  });

  function snapshotWith(overrides: Partial<M13ReadinessSnapshot>): M13ReadinessSnapshot {
    return {
      storage: section("healthy"),
      extraction: section("degraded"),
      malwareScanning: section("not_configured"),
      modelVision: section("not_configured"),
      urlImport: section("not_configured"),
      cleanupLag: section("healthy"),
      evaluation: section("healthy"),
      featureFlags: [],
      ...overrides,
    };
  }

  it("does not block on a feature that is deliberately off or on a documented deferral", () => {
    // Otherwise every deployment would carry a permanent blocker it has no
    // way to clear, and the list would stop meaning anything.
    expect(m13LaunchBlockingIssues(snapshotWith({}))).toEqual([]);
  });

  it("blocks on a genuine misconfiguration", () => {
    const issues = m13LaunchBlockingIssues(snapshotWith({ storage: section("unhealthy") }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^Attachment storage: /);
  });

  it("reports every unhealthy section, not just the first", () => {
    const issues = m13LaunchBlockingIssues(
      snapshotWith({
        storage: section("unhealthy"),
        malwareScanning: section("unhealthy"),
        cleanupLag: section("unhealthy"),
      })
    );
    expect(issues).toHaveLength(3);
  });
});
