import { describe, expect, it } from "vitest";
import { emptySpecification, type ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { workflowIdempotencyGate } from "./workflowIdempotency";
import type { GateContext } from "../types";

function fakeContext(spec: ApplicationSpecificationType): GateContext {
  return {
    db: null as never,
    appId: "test-app",
    runId: "test-run",
    specPayload: spec,
    specVersionId: "v1",
    specVersionNumber: 1,
    specChecksum: "checksum",
    previewBuild: null,
    registryVersion: "test",
    ownerPrincipalId: "owner-1",
    signal: new AbortController().signal,
  };
}

describe("workflowIdempotencyGate", () => {
  it("skips with mandatoryOverride:false when the specification defines zero workflows — legitimately not applicable, must never count toward release eligibility as passed OR block it", async () => {
    const spec = emptySpecification({ name: "Test App", slug: "test-app" });
    const result = await workflowIdempotencyGate.execute(fakeContext(spec));
    expect(result.status).toBe("skipped");
    expect(result.mandatoryOverride).toBe(false);
    expect(result.skipReason).toMatch(/no active onCreate workflows/i);
  });

  it("skips (still mandatory — no override) when a workflow's trigger entity no longer exists", async () => {
    const spec = emptySpecification({ name: "Test App", slug: "test-app" });
    spec.workflows = [{ id: "wf1", name: "On task create", trigger: { kind: "onCreate", entityId: "ghost_entity" }, steps: [], archived: false }];
    const result = await workflowIdempotencyGate.execute(fakeContext(spec));
    expect(result.status).toBe("skipped");
    expect(result.mandatoryOverride).toBeUndefined();
  });
});
