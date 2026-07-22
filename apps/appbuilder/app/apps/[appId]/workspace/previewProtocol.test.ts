import { describe, expect, it } from "vitest";
import { evaluateParentInboundMessage, parseParentInboundMessage } from "./previewProtocol";

const BASE = {
  expectedNonce: "nonce-123",
  expectedAppId: "app_1",
  currentVersionNumber: 5,
};

describe("parseParentInboundMessage", () => {
  it("parses a well-formed ab-preview-ready message", () => {
    expect(parseParentInboundMessage({ type: "ab-preview-ready", nonce: "n1" })).toEqual({
      type: "ab-preview-ready",
      nonce: "n1",
    });
  });

  it("parses a well-formed ab-preview-select message", () => {
    const parsed = parseParentInboundMessage({
      type: "ab-preview-select",
      nonce: "n1",
      appId: "app_1",
      specificationVersionNumber: 3,
      pageId: "tasks",
      componentId: "tasks_table",
    });
    expect(parsed).toMatchObject({ type: "ab-preview-select", appId: "app_1", specificationVersionNumber: 3 });
  });

  it("rejects an unallowlisted message type", () => {
    expect(parseParentInboundMessage({ type: "ab-preview-EXECUTE", nonce: "n1" })).toBeNull();
  });

  it("rejects a non-object payload", () => {
    expect(parseParentInboundMessage("just a string")).toBeNull();
    expect(parseParentInboundMessage(null)).toBeNull();
    expect(parseParentInboundMessage(42)).toBeNull();
  });

  it("rejects a select message missing required fields", () => {
    expect(parseParentInboundMessage({ type: "ab-preview-select", nonce: "n1" })).toBeNull();
  });

  it("never carries through unexpected extra fields as trusted actor identity", () => {
    const parsed = parseParentInboundMessage({
      type: "ab-preview-select",
      nonce: "n1",
      appId: "app_1",
      specificationVersionNumber: 1,
      actorPrincipalId: "someone-else",
      cookie: "session=stolen",
    });
    expect(parsed).not.toHaveProperty("actorPrincipalId");
    expect(parsed).not.toHaveProperty("cookie");
  });
});

describe("evaluateParentInboundMessage — origin/source/nonce/app/version gating", () => {
  it("rejects a message from the wrong origin regardless of contents", () => {
    const result = evaluateParentInboundMessage({
      ...BASE,
      rawData: { type: "ab-preview-select", nonce: "nonce-123", appId: "app_1", specificationVersionNumber: 5 },
      originMatches: false,
      sourceMatches: true,
    });
    expect(result).toEqual({ kind: "rejected", reason: "origin_mismatch" });
  });

  it("rejects a message from the wrong source (not this specific iframe)", () => {
    const result = evaluateParentInboundMessage({
      ...BASE,
      rawData: { type: "ab-preview-select", nonce: "nonce-123", appId: "app_1", specificationVersionNumber: 5 },
      originMatches: true,
      sourceMatches: false,
    });
    expect(result).toEqual({ kind: "rejected", reason: "source_mismatch" });
  });

  it("rejects an unallowlisted message type even with matching origin/source", () => {
    const result = evaluateParentInboundMessage({
      ...BASE,
      rawData: { type: "ab-preview-exfiltrate", nonce: "nonce-123" },
      originMatches: true,
      sourceMatches: true,
    });
    expect(result).toEqual({ kind: "rejected", reason: "unallowlisted_type" });
  });

  it("rejects a message with a stale/wrong nonce", () => {
    const result = evaluateParentInboundMessage({
      ...BASE,
      rawData: { type: "ab-preview-select", nonce: "wrong-nonce", appId: "app_1", specificationVersionNumber: 5 },
      originMatches: true,
      sourceMatches: true,
    });
    expect(result).toEqual({ kind: "rejected", reason: "nonce_mismatch" });
  });

  it("rejects a selection claiming a different app", () => {
    const result = evaluateParentInboundMessage({
      ...BASE,
      rawData: { type: "ab-preview-select", nonce: "nonce-123", appId: "someone-elses-app", specificationVersionNumber: 5 },
      originMatches: true,
      sourceMatches: true,
    });
    expect(result).toEqual({ kind: "rejected", reason: "app_mismatch" });
  });

  it("flags a stale-version selection instead of accepting it", () => {
    const result = evaluateParentInboundMessage({
      ...BASE,
      rawData: { type: "ab-preview-select", nonce: "nonce-123", appId: "app_1", specificationVersionNumber: 4 },
      originMatches: true,
      sourceMatches: true,
    });
    expect(result).toEqual({ kind: "stale_version" });
  });

  it("acknowledges a valid handshake-ready message", () => {
    const result = evaluateParentInboundMessage({
      ...BASE,
      rawData: { type: "ab-preview-ready", nonce: "nonce-123" },
      originMatches: true,
      sourceMatches: true,
    });
    expect(result).toEqual({ kind: "handshake_ack" });
  });

  it("accepts a fully valid, current-version selection", () => {
    const result = evaluateParentInboundMessage({
      ...BASE,
      rawData: {
        type: "ab-preview-select",
        nonce: "nonce-123",
        appId: "app_1",
        specificationVersionNumber: 5,
        pageId: "tasks",
        componentId: "tasks_table",
        componentKind: "dataTable",
        label: "Tasks table",
      },
      originMatches: true,
      sourceMatches: true,
    });
    expect(result).toEqual({
      kind: "selection",
      selection: {
        appId: "app_1",
        specificationVersionNumber: 5,
        pageId: "tasks",
        componentId: "tasks_table",
        componentKind: "dataTable",
        label: "Tasks table",
      },
    });
  });
});
