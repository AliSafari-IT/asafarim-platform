import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPLAY_WINDOW_SECONDS,
  signPayload,
  verifySignature,
} from "./signing.js";

const SECRET = "whsec_testora_tasksai_example";
const BODY = JSON.stringify({ v: 1, hello: "world" });

describe("signPayload / verifySignature", () => {
  it("round-trips a freshly signed payload", () => {
    const signed = signPayload({ secret: SECRET, rawBody: BODY });
    const result = verifySignature({
      secret: SECRET,
      rawBody: BODY,
      signature: signed.signature,
      timestamp: signed.timestamp,
      deliveryId: signed.deliveryId,
      now: signed.timestamp,
    });
    expect(result).toEqual({ ok: true });
  });

  it("exposes headers ready to attach to a request", () => {
    const signed = signPayload({ secret: SECRET, rawBody: BODY });
    expect(signed.headers["x-asafarim-signature"]).toBe(signed.signature);
    expect(signed.headers["x-asafarim-delivery"]).toBe(signed.deliveryId);
    expect(signed.headers["x-asafarim-timestamp"]).toBe(String(signed.timestamp));
  });

  it("rejects a tampered body", () => {
    const signed = signPayload({ secret: SECRET, rawBody: BODY });
    const result = verifySignature({
      secret: SECRET,
      rawBody: BODY + " ",
      signature: signed.signature,
      timestamp: signed.timestamp,
      deliveryId: signed.deliveryId,
      now: signed.timestamp,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a replayed body outside the window", () => {
    const signed = signPayload({ secret: SECRET, rawBody: BODY, timestamp: 1_000 });
    const result = verifySignature({
      secret: SECRET,
      rawBody: BODY,
      signature: signed.signature,
      timestamp: signed.timestamp,
      deliveryId: signed.deliveryId,
      now: 1_000 + DEFAULT_REPLAY_WINDOW_SECONDS + 1,
    });
    expect(result).toEqual({ ok: false, reason: "timestamp_out_of_window" });
  });

  it("rejects the wrong secret", () => {
    const signed = signPayload({ secret: SECRET, rawBody: BODY });
    const result = verifySignature({
      secret: "whsec_wrong",
      rawBody: BODY,
      signature: signed.signature,
      timestamp: signed.timestamp,
      deliveryId: signed.deliveryId,
      now: signed.timestamp,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("accepts either secret during rotation", () => {
    const signed = signPayload({ secret: "whsec_old", rawBody: BODY });
    const result = verifySignature({
      secret: ["whsec_new", "whsec_old"],
      rawBody: BODY,
      signature: signed.signature,
      timestamp: signed.timestamp,
      deliveryId: signed.deliveryId,
      now: signed.timestamp,
    });
    expect(result).toEqual({ ok: true });
  });

  it("reports missing fields", () => {
    const result = verifySignature({
      secret: SECRET,
      rawBody: BODY,
      signature: undefined,
      timestamp: undefined,
      deliveryId: undefined,
    });
    expect(result).toEqual({ ok: false, reason: "missing_fields" });
  });

  it("reports a malformed timestamp", () => {
    const signed = signPayload({ secret: SECRET, rawBody: BODY });
    const result = verifySignature({
      secret: SECRET,
      rawBody: BODY,
      signature: signed.signature,
      timestamp: "not-a-number",
      deliveryId: signed.deliveryId,
    });
    expect(result).toEqual({ ok: false, reason: "malformed_timestamp" });
  });

  it("binds the signature to the delivery id", () => {
    const signed = signPayload({ secret: SECRET, rawBody: BODY });
    const result = verifySignature({
      secret: SECRET,
      rawBody: BODY,
      signature: signed.signature,
      timestamp: signed.timestamp,
      deliveryId: "00000000-0000-0000-0000-000000000000",
      now: signed.timestamp,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });
});
