import { describe, expect, it } from "vitest";
import { RunArtifactBundle, parseRunArtifactBundle } from "./bundle";
import {
  ProvisionTestsRequest,
  ProvisionTestsResponse,
} from "./provision";
import {
  parseWebhookEvent,
  TestDiagnosisProposal,
  WebhookEnvelope,
} from "./events";
import { CONTRACT_VERSION, SCHEMA_VERSIONS } from "./version";

const bundle = {
  v: 1,
  bundleId: "11111111-1111-1111-1111-111111111111",
  runId: "run_42",
  scenarioId: "scn_login",
  scenarioTitle: "User can sign in",
  appId: "asafarim-web",
  status: "failed",
  attempt: 1,
  startedAt: "2026-09-10T10:00:00.000Z",
  finishedAt: "2026-09-10T10:00:12.000Z",
  browser: "chrome:headless",
  errorClass: "selector_not_found",
  errorMessage: "Selector '#submit' not found",
  steps: [
    {
      index: 0,
      label: "navigate to /login",
      status: "passed",
      startedAtMs: 0,
      durationMs: 800,
    },
    {
      index: 1,
      label: "click #submit",
      status: "failed",
      startedAtMs: 800,
      durationMs: 4000,
      selector: "#submit",
      errorMessage: "not found",
    },
  ],
  artifacts: [
    {
      kind: "dom_snapshot",
      url: "https://storage.example.com/b/dom.html?sig=abc",
      bytes: 20480,
      contentType: "text/html",
      expiresInSeconds: 900,
    },
    {
      kind: "screenshot",
      url: "https://storage.example.com/b/shot.png?sig=abc",
    },
  ],
};

describe("version", () => {
  it("pins the contract + per-payload versions", () => {
    expect(CONTRACT_VERSION).toBe("1.0.0");
    expect(SCHEMA_VERSIONS.runArtifactBundle).toBe(1);
  });
});

describe("RunArtifactBundle", () => {
  it("accepts a well-formed failure bundle", () => {
    expect(() => parseRunArtifactBundle(bundle)).not.toThrow();
  });

  it("rejects an unknown top-level key (no source leakage)", () => {
    const withExtra = { ...bundle, sourceCode: "console.log(1)" };
    expect(RunArtifactBundle.safeParse(withExtra).success).toBe(false);
  });

  it("rejects the wrong version discriminant", () => {
    expect(RunArtifactBundle.safeParse({ ...bundle, v: 2 }).success).toBe(false);
  });

  it("accepts an optional producer context with a previous-pass ref", () => {
    const withContext = {
      ...bundle,
      context: {
        suiteId: "suite_1",
        suiteTitle: "Auth",
        fixtureId: "fix_1",
        fixtureTitle: "Login form",
        requirementId: "fr_1",
        requirementTitle: "Users can authenticate",
        runIndex: 0,
        targetBaseUrl: "https://staging.example.com",
        previousPass: {
          resultId: "res_prev",
          createdAt: "2026-09-09T10:00:00.000Z",
        },
      },
    };
    expect(RunArtifactBundle.safeParse(withContext).success).toBe(true);
  });

  it("rejects an unknown key inside context", () => {
    const bad = { ...bundle, context: { sourceFile: "app/page.tsx" } };
    expect(RunArtifactBundle.safeParse(bad).success).toBe(false);
  });
});

describe("provision", () => {
  const request = {
    v: 1,
    provisionId: "22222222-2222-2222-2222-222222222222",
    taskRef: "task_abc",
    checkRef: "check_abc",
    featureTitle: "Password reset",
    acceptanceCriteria: [
      { ref: "ac_1", text: "A user requests a reset link by email" },
      { ref: "ac_2", text: "The link expires after 30 minutes" },
    ],
    appId: "asafarim-web",
    callbackUrl: "https://tasks-ai.asafarim.com/api/inbound/testora/greenlight",
  };

  it("defaults requiredRuns to 3", () => {
    const parsed = ProvisionTestsRequest.parse(request);
    expect(parsed.requiredRuns).toBe(3);
  });

  it("requires at least one acceptance criterion", () => {
    expect(
      ProvisionTestsRequest.safeParse({ ...request, acceptanceCriteria: [] })
        .success,
    ).toBe(false);
  });

  it("round-trips a response", () => {
    const res = {
      v: 1,
      provisionId: request.provisionId,
      scenarios: [
        { scenarioId: "scn_1", criterionRef: "ac_1", state: "pending" },
        { scenarioId: "scn_2", criterionRef: "ac_2", state: "authoring" },
      ],
    };
    expect(ProvisionTestsResponse.safeParse(res).success).toBe(true);
  });
});

describe("parseWebhookEvent", () => {
  it("validates the envelope and the data for its event type", () => {
    const envelope = {
      v: 1,
      deliveryId: "33333333-3333-3333-3333-333333333333",
      eventType: "regression.detected",
      occurredAt: "2026-09-10T10:05:00.000Z",
      source: "testora",
      data: {
        scenarioId: "scn_login",
        scenarioTitle: "User can sign in",
        appId: "asafarim-web",
        previousStatus: "passed",
        runsSinceLastPass: 1,
        bundle: { bundleId: bundle.bundleId, inline: bundle },
      },
    };
    const result = parseWebhookEvent(envelope);
    expect(result.ok).toBe(true);
  });

  it("rejects data that does not match the event type", () => {
    const envelope = {
      v: 1,
      deliveryId: "44444444-4444-4444-4444-444444444444",
      eventType: "flake.detected",
      occurredAt: "2026-09-10T10:05:00.000Z",
      source: "testora",
      data: { nope: true },
    };
    const result = parseWebhookEvent(envelope);
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed envelope", () => {
    expect(parseWebhookEvent({ v: 1 }).ok).toBe(false);
  });

  it("accepts a green-light callback", () => {
    const envelope = {
      v: 1,
      deliveryId: "55555555-5555-5555-5555-555555555555",
      eventType: "greenlight.reached",
      occurredAt: "2026-09-10T10:30:00.000Z",
      source: "testora",
      data: {
        provisionId: "22222222-2222-2222-2222-222222222222",
        taskRef: "task_abc",
        checkRef: "check_abc",
        verdict: "green",
        cleanRuns: 3,
        requiredRuns: 3,
        flakeCount: 0,
        artifactsComplete: true,
        scenarios: [
          { scenarioId: "scn_1", criterionRef: "ac_1", state: "passing" },
        ],
      },
    };
    expect(parseWebhookEvent(envelope).ok).toBe(true);
  });
});

describe("WebhookEnvelope", () => {
  it("rejects unknown keys", () => {
    expect(
      WebhookEnvelope.safeParse({
        v: 1,
        deliveryId: "66666666-6666-6666-6666-666666666666",
        eventType: "run.completed",
        occurredAt: "2026-09-10T10:05:00.000Z",
        source: "testora",
        data: {},
        extra: "x",
      }).success,
    ).toBe(false);
  });
});

describe("TestDiagnosisProposal", () => {
  it("accepts a locator diagnosis", () => {
    const proposal = {
      v: 1,
      bundleId: bundle.bundleId,
      scenarioId: "scn_login",
      category: "locator",
      confidence: 0.82,
      suspectedFile: "src/app/(auth)/login/page.tsx",
      rationale: "The submit button id changed from #submit to #login-submit.",
      suggestedFix: "Update the selector to #login-submit.",
    };
    expect(TestDiagnosisProposal.safeParse(proposal).success).toBe(true);
  });

  it("rejects confidence outside [0,1]", () => {
    expect(
      TestDiagnosisProposal.safeParse({
        v: 1,
        bundleId: bundle.bundleId,
        scenarioId: "scn_login",
        category: "unknown",
        confidence: 1.4,
        rationale: "x",
      }).success,
    ).toBe(false);
  });
});
