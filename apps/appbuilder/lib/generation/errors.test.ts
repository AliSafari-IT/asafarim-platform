import { describe, it, expect } from "vitest";
import { ProviderError } from "@asafarim/appbuilder-ai";
import { classifyGenerationError, safeFailureMessage, GenerationJobError } from "./errors";
import { ConflictError, DestructiveConfirmationRequiredError, ForbiddenError, NotFoundError, OperationValidationError, StaleVersionError } from "../errors";
import { classifyModificationError, safeFailureMessage as modificationSafeMessage } from "../modification/errors";
import { classifyRepairError, safeFailureMessage as repairSafeMessage } from "../repair/errors";

describe("classifyGenerationError", () => {
  it("maps a retryable ProviderError (rate_limit) onto provider_rate_limit, retryable=true", () => {
    const err = classifyGenerationError(new ProviderError({ code: "rate_limit", message: "x" }));
    expect(err.code).toBe("provider_rate_limit");
    expect(err.retryable).toBe(true);
  });

  it("maps a non-retryable ProviderError (authentication_error) onto provider_configuration_error, retryable=false", () => {
    const err = classifyGenerationError(new ProviderError({ code: "authentication_error", message: "x" }));
    expect(err.code).toBe("provider_configuration_error");
    expect(err.retryable).toBe(false);
  });

  it("maps malformed_response onto malformed_provider_response, retryable=true (a schema miss is a one-off model slip, not persistent)", () => {
    const err = classifyGenerationError(new ProviderError({ code: "malformed_response", message: "x" }));
    expect(err.code).toBe("malformed_provider_response");
    expect(err.retryable).toBe(true);
  });

  it("maps StaleVersionError onto stale_base_version", () => {
    const err = classifyGenerationError(new StaleVersionError(3, 2));
    expect(err.code).toBe("stale_base_version");
  });

  it("maps DestructiveConfirmationRequiredError onto forbidden_operation", () => {
    const err = classifyGenerationError(new DestructiveConfirmationRequiredError({ classification: "entity_removed", details: [] }));
    expect(err.code).toBe("forbidden_operation");
  });

  it("maps OperationValidationError onto specification_validation_failed", () => {
    const err = classifyGenerationError(new OperationValidationError([{ path: [], code: "x", message: "bad" }]));
    expect(err.code).toBe("specification_validation_failed");
  });

  it("maps ForbiddenError and NotFoundError onto authorization_lost (fail closed, never a mutation)", () => {
    expect(classifyGenerationError(new ForbiddenError()).code).toBe("authorization_lost");
    expect(classifyGenerationError(new NotFoundError("App", "x")).code).toBe("authorization_lost");
  });

  it("maps a generic ConflictError onto stale_base_version", () => {
    expect(classifyGenerationError(new ConflictError("conflict")).code).toBe("stale_base_version");
  });

  it("maps an unrecognized error onto worker_infrastructure_error", () => {
    expect(classifyGenerationError(new Error("boom")).code).toBe("worker_infrastructure_error");
  });

  it("passes an existing GenerationJobError through unchanged", () => {
    const original = new GenerationJobError("invalid_request", "custom message");
    expect(classifyGenerationError(original)).toBe(original);
  });

  it("every classified error carries only the safe message, never the raw cause text", () => {
    const causeMessage = "raw SQL: SELECT api_key FROM secrets WHERE id=1";
    const err = classifyGenerationError(new Error(causeMessage));
    expect(err.message).not.toContain(causeMessage);
    expect(err.message).toBe(safeFailureMessage("worker_infrastructure_error"));
  });
});

/**
 * #64 — a client-side timeout used to be classified as `provider_unavailable`
 * and reported as "the AI provider was temporarily unavailable". It sent
 * whoever read it looking for an outage that was not happening: the provider
 * had been answering the whole time and we stopped waiting. These cases pin
 * the distinction so it cannot quietly collapse back.
 */
describe("provider timeout vs. provider unavailability (#64)", () => {
  it("classifies a timeout as provider_timeout, not provider_unavailable", () => {
    const err = classifyGenerationError(new ProviderError({ code: "timeout", message: "x" }));
    expect(err.code).toBe("provider_timeout");
  });

  it("still classifies a genuine outage as provider_unavailable", () => {
    const err = classifyGenerationError(new ProviderError({ code: "unavailable", message: "x" }));
    expect(err.code).toBe("provider_unavailable");
  });

  it("retries a timeout — a slow response can be a transient blip", () => {
    expect(classifyGenerationError(new ProviderError({ code: "timeout", message: "x" })).retryable).toBe(true);
  });

  it("names the configured limit, because that number is the corrective action", () => {
    const previous = process.env.APPBUILDER_AI_REQUEST_TIMEOUT_MS;
    process.env.APPBUILDER_AI_REQUEST_TIMEOUT_MS = "45000";
    try {
      const message = safeFailureMessage("provider_timeout");
      expect(message).toContain("45 seconds");
      // "Unavailable" is the specific wrong word: it blames the provider for
      // a limit we chose.
      expect(message.toLowerCase()).not.toContain("unavailable");
    } finally {
      if (previous === undefined) delete process.env.APPBUILDER_AI_REQUEST_TIMEOUT_MS;
      else process.env.APPBUILDER_AI_REQUEST_TIMEOUT_MS = previous;
    }
  });

  it("falls back to the documented default rather than throwing on a malformed limit", () => {
    const previous = process.env.APPBUILDER_AI_REQUEST_TIMEOUT_MS;
    process.env.APPBUILDER_AI_REQUEST_TIMEOUT_MS = "not-a-number";
    try {
      // Degrading the message beats throwing while we are already handling a
      // failure.
      expect(safeFailureMessage("provider_timeout")).toContain("120 seconds");
    } finally {
      if (previous === undefined) delete process.env.APPBUILDER_AI_REQUEST_TIMEOUT_MS;
      else process.env.APPBUILDER_AI_REQUEST_TIMEOUT_MS = previous;
    }
  });

  it("gives modification and repair the same classification and the same wording", () => {
    // Three pipelines, one truth — a timeout during a conversational change
    // must not read differently from a timeout during generation.
    expect(classifyModificationError(new ProviderError({ code: "timeout", message: "x" })).code).toBe("provider_timeout");
    expect(classifyRepairError(new ProviderError({ code: "timeout", message: "x" })).code).toBe("provider_timeout");
    expect(modificationSafeMessage("provider_timeout")).toBe(safeFailureMessage("provider_timeout"));
    expect(repairSafeMessage("provider_timeout")).toBe(safeFailureMessage("provider_timeout"));
  });
});
