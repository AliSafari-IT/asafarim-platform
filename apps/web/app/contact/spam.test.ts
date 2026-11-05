import { describe, expect, it } from "vitest";

import {
  ContactRateLimiter,
  MIN_FILL_MS,
  looksRandom,
  spamReason,
} from "./spam";

const now = 1_800_000_000_000;
const person = {
  name: "Ann Peeters",
  message: "We need a booking app for our clinic, ideally live by spring.",
  honeypot: "",
  startedAt: String(now - 60_000),
};

describe("spamReason", () => {
  it("lets a person through", () => {
    expect(spamReason(person, now)).toBeNull();
  });

  it("the honeypot, filled", () => {
    expect(spamReason({ ...person, honeypot: "Acme Ltd" }, now)).toBe(
      "honeypot"
    );
  });

  it("no timing (no JavaScript, a forged or stale value), or sent within seconds", () => {
    for (const startedAt of [
      "",
      "abc",
      String(now + 5_000),
      String(now - 2 * 86_400_000),
    ]) {
      expect(spamReason({ ...person, startedAt }, now), startedAt).toBe(
        "no_timing"
      );
    }
    expect(
      spamReason({ ...person, startedAt: String(now - MIN_FILL_MS + 1) }, now)
    ).toBe("too_fast");
  });

  it("random mixed-case text in the name or the message (the bot of 27 Oct)", () => {
    expect(spamReason({ ...person, name: "NEqMpoHHVxBfzlXovNdRd" }, now)).toBe(
      "random_text"
    );
    expect(
      spamReason({ ...person, message: "PwaOeHsAxlgCPYNNUsZKc" }, now)
    ).toBe("random_text");
  });

  it("a message stuffed with links", () => {
    const message =
      "Buy now https://a.example https://b.example www.c.example http://d.example";
    expect(spamReason({ ...person, message }, now)).toBe("links");
  });
});

describe("looksRandom", () => {
  it("real names and words pass", () => {
    for (const text of [
      "McDonald",
      "Alexander",
      "JavaScript",
      "Ann Peeters",
      "MacKenzie-Smith",
      "DeAngelo",
    ]) {
      expect(looksRandom(text), text).toBe(false);
    }
  });
  it("generated strings do not", () => {
    for (const text of [
      "NEqMpoHHVxBfzlXovNdRd",
      "PwaOeHsAxlgCPYNNUsZKc",
      "xKqWmZpLtRvB",
    ]) {
      expect(looksRandom(text), text).toBe(true);
    }
  });
});

describe("ContactRateLimiter", () => {
  it("three per window per client, then a refusal until the window moves on", () => {
    const limiter = new ContactRateLimiter(3, 600_000);
    expect([1, 2, 3].map((i) => limiter.allow("a", now + i))).toEqual([
      true,
      true,
      true,
    ]);
    expect(limiter.allow("a", now + 10)).toBe(false);
    expect(limiter.allow("b", now + 10)).toBe(true);
    expect(limiter.allow("a", now + 600_005)).toBe(true);
  });

  it("forgets the oldest clients beyond its size", () => {
    const limiter = new ContactRateLimiter(1, 600_000, 2);
    limiter.allow("a", now);
    limiter.allow("b", now);
    limiter.allow("c", now);
    // "a" was dropped, so it may send again
    expect(limiter.allow("a", now + 1)).toBe(true);
  });
});
