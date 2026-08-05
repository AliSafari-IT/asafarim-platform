import { describe, expect, it } from "vitest";
import { emptySpecification, type ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { previewRenderabilityGate } from "./previewRenderability";
import type { GateContext, PreviewBuildRow } from "../types";

function fakeContext(spec: ApplicationSpecificationType): GateContext {
  return {
    db: null as never,
    appId: "test-app",
    runId: "test-run",
    specPayload: spec,
    specVersionId: "v1",
    specVersionNumber: 1,
    specChecksum: "checksum",
    previewBuild: { status: "succeeded" } as PreviewBuildRow,
    registryVersion: "test",
    ownerPrincipalId: "owner-1",
    signal: new AbortController().signal,
  };
}

describe("previewRenderabilityGate", () => {
  it("fails when a page's component has a config the registry schema rejects (unrecognized key), not just a silent inline diagnostic", async () => {
    const spec = emptySpecification({ name: "Test App", slug: "test-app" });
    spec.pages = [
      {
        id: "page1",
        name: "Home",
        path: "",
        archived: false,
        components: [
          {
            id: "c1",
            kind: "statWidget",
            order: 0,
            // Not a valid StatWidgetConfig key — mirrors the AI-generated
            // "notes"/"fields"/"labelField"/"valueField" mismatches that
            // previously sailed through this gate as `ok: true`.
            config: { labelField: "x", valueField: "y" },
          },
        ],
      },
    ];

    const result = await previewRenderabilityGate.execute(fakeContext(spec));
    expect(result.status).toBe("failed");
    expect(result.structuredFailures?.[0]?.code).toBe("invalid_config");
  });

  it("still passes for a valid specification with no fatal render warnings", async () => {
    const spec = emptySpecification({ name: "Test App", slug: "test-app" });
    const result = await previewRenderabilityGate.execute(fakeContext(spec));
    expect(result.status).toBe("passed");
  });
});
