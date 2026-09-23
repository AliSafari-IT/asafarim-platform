import { beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isSecretEnvelope } from "./secret-cipher";

describe("secret-cipher", () => {
  beforeEach(() => {
    process.env.SETTINGS_ENCRYPTION_KEY = "test-only-key-do-not-use-in-prod";
  });

  it("round-trips a plaintext value", () => {
    const envelope = encryptSecret("sk_live_super_secret_value");
    expect(decryptSecret(envelope)).toBe("sk_live_super_secret_value");
  });

  it("round-trips an empty string", () => {
    const envelope = encryptSecret("");
    expect(decryptSecret(envelope)).toBe("");
  });

  it("produces a distinct ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-value");
    expect(decryptSecret(b)).toBe("same-value");
  });

  it("marks its output as a recognizable secret envelope", () => {
    const envelope = encryptSecret("value");
    expect(isSecretEnvelope(envelope)).toBe(true);
    expect(isSecretEnvelope("plain text")).toBe(false);
    expect(isSecretEnvelope(42)).toBe(false);
  });

  it("throws on a tampered ciphertext (auth tag mismatch)", () => {
    const envelope = encryptSecret("value");
    const [version, iv, tag, ciphertext] = envelope.split(":");
    const tampered = [
      version,
      iv,
      tag,
      Buffer.from("tampered-bytes-here").toString("base64"),
    ].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects a truncated auth tag instead of accepting a weaker check", () => {
    const envelope = encryptSecret("value");
    const [version, iv, tag, ciphertext] = envelope.split(":");
    const truncatedTag = Buffer.from(tag!, "base64").subarray(0, 4).toString("base64");
    expect(() => decryptSecret([version, iv, truncatedTag, ciphertext].join(":"))).toThrow();
  });

  it("throws a clear error when SETTINGS_ENCRYPTION_KEY is unset", () => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    expect(() => encryptSecret("value")).toThrow(/SETTINGS_ENCRYPTION_KEY/);
  });
});
