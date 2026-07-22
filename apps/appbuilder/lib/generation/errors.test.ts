import { describe, it, expect } from "vitest";
import { ProviderError } from "@asafarim/appbuilder-ai";
import { classifyGenerationError, safeFailureMessage, GenerationJobError } from "./errors";
import { ConflictError, DestructiveConfirmationRequiredError, ForbiddenError, NotFoundError, OperationValidationError, StaleVersionError } from "../errors";

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

  it("maps malformed_response onto malformed_provider_response", () => {
    const err = classifyGenerationError(new ProviderError({ code: "malformed_response", message: "x" }));
    expect(err.code).toBe("malformed_provider_response");
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
