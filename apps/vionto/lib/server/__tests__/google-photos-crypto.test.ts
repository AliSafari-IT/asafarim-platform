import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetEncryptionKeyCache,
  decryptToken,
  encryptToken,
  getEncryptionKey,
  safeEqual,
} from "../google-photos/crypto";

// 32-byte key as 64 hex chars.
const HEX_KEY = "0".repeat(64);
// 32-byte key as base64 (32 bytes of 0x01).
const BASE64_KEY = Buffer.alloc(32, 1).toString("base64");

describe("google-photos token crypto", () => {
  const originalKey = process.env.VIONTO_TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.VIONTO_TOKEN_ENCRYPTION_KEY = HEX_KEY;
    __resetEncryptionKeyCache();
  });

  afterEach(() => {
    process.env.VIONTO_TOKEN_ENCRYPTION_KEY = originalKey;
    __resetEncryptionKeyCache();
  });

  it("round-trips a token through encrypt → decrypt", () => {
    const secret = "ya29.a0AfH6SMexample-access-token";
    const encrypted = encryptToken(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptToken(encrypted)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const secret = "refresh-token-value";
    expect(encryptToken(secret)).not.toBe(encryptToken(secret));
  });

  it("round-trips unicode and empty strings", () => {
    for (const value of ["", "日本語 🎉 café", "a".repeat(4096)]) {
      expect(decryptToken(encryptToken(value))).toBe(value);
    }
  });

  it("accepts a base64-encoded 32-byte key", () => {
    process.env.VIONTO_TOKEN_ENCRYPTION_KEY = BASE64_KEY;
    __resetEncryptionKeyCache();
    expect(getEncryptionKey().length).toBe(32);
    const enc = encryptToken("hello");
    expect(decryptToken(enc)).toBe("hello");
  });

  it("throws when the key is missing", () => {
    delete process.env.VIONTO_TOKEN_ENCRYPTION_KEY;
    __resetEncryptionKeyCache();
    expect(() => getEncryptionKey()).toThrow(/not set/i);
  });

  it("throws when the key is the wrong length", () => {
    process.env.VIONTO_TOKEN_ENCRYPTION_KEY = "tooshort";
    __resetEncryptionKeyCache();
    expect(() => getEncryptionKey()).toThrow(/32 bytes/i);
  });

  it("detects tampering via the GCM auth tag", () => {
    const encrypted = encryptToken("sensitive");
    const [iv, authTag, ciphertext] = encrypted.split(".");
    // Flip a byte in the ciphertext.
    const buf = Buffer.from(ciphertext, "base64url");
    buf[0] ^= 0xff;
    const tampered = [iv, authTag, buf.toString("base64url")].join(".");
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptToken("not-a-valid-payload")).toThrow(/malformed/i);
    expect(() => decryptToken("a.b")).toThrow(/malformed/i);
  });

  it("safeEqual compares strings correctly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
