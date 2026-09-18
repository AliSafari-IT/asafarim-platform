import { describe, expect, it } from "vitest";
import { buildLogEvent } from "../lib/observability/logger";

/**
 * Acceptance criterion from issue #246: "Worker logs never contain
 * CV-derived text". The worker's logging goes through the same
 * `buildLogEvent` -> `redact()` pipeline as the rest of ResuMatch (JM-015),
 * so this test proves the pipeline itself keeps CV content out, the way a
 * worker job handler would inadvertently try to log a job's payload.
 */
describe("worker log redaction", () => {
  it("never emits CV/resume text handed to a job payload", () => {
    const cvText =
      "Jane Doe, jane.doe@example.com, +1 555 0100, 123 Main St. " +
      "10+ years experience in distributed systems...";

    const event = buildLogEvent("info", "worker.job_received", {
      jobId: "job-123",
      cv: cvText,
      resume: cvText,
      extractedText: cvText,
      candidate: { name: "Jane Doe", email: "jane.doe@example.com" },
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("Jane Doe");
    expect(serialized).not.toContain("jane.doe@example.com");
    expect(serialized).not.toContain("555 0100");
    expect(serialized).not.toContain("Main St");
    expect(serialized).not.toContain(cvText);

    // Allow-listed, non-sensitive fields survive.
    expect(event.context.jobId).toBe("job-123");
    // Forbidden keys are dropped entirely, not just masked.
    expect(event.context).not.toHaveProperty("cv");
    expect(event.context).not.toHaveProperty("resume");
    expect(event.context).not.toHaveProperty("extractedText");
  });

  it("redacts a noop job's echoed payload the same way", () => {
    const event = buildLogEvent("info", "worker.noop", {
      jobId: "noop-1",
      payload: { cv: "sensitive CV body", note: "free text" },
    });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("sensitive CV body");
  });
});
