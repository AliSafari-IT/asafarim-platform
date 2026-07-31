import { describe, expect, it } from "vitest";
import { clearDraft, draftKey, hasUnsavedAnswers, loadDraft, parseDraft, saveDraft } from "./clarificationDraft";

/**
 * The draft is the half of the fix that actually saves the work — the
 * confirmation dialog only helps a user who notices it. So the parse path
 * matters: it feeds straight into form state, and anything it gets wrong is
 * either lost answers or someone else's text appearing in the form.
 */

describe("hasUnsavedAnswers", () => {
  it("is false for an empty form and for whitespace alone", () => {
    expect(hasUnsavedAnswers({})).toBe(false);
    expect(hasUnsavedAnswers({ q1: "", q2: "" })).toBe(false);
    expect(hasUnsavedAnswers({ q1: "   \n\t " })).toBe(false);
  });

  it("is true as soon as one answer has real content", () => {
    expect(hasUnsavedAnswers({ q1: "", q2: "Ali Safari" })).toBe(true);
  });
});

describe("draftKey", () => {
  it("separates rounds, so round 2 never inherits round 1's answers", () => {
    expect(draftKey("app-1", "job-1", 1)).not.toBe(draftKey("app-1", "job-1", 2));
  });

  it("separates apps and jobs", () => {
    expect(draftKey("app-1", "job-1", 1)).not.toBe(draftKey("app-2", "job-1", 1));
    expect(draftKey("app-1", "job-1", 1)).not.toBe(draftKey("app-1", "job-2", 1));
  });
});

describe("parseDraft", () => {
  const now = new Date("2026-07-31T12:00:00Z");

  function stored(answers: unknown, savedAt = now.toISOString()) {
    return JSON.stringify({ answers, savedAt });
  }

  it("restores stored answers", () => {
    const answers = { q1: "Ali Safari — AI developer", q2: "Three projects…" };
    expect(parseDraft(stored(answers), now)).toEqual(answers);
  });

  it("returns null for anything that is not a usable draft", () => {
    // Every one of these would otherwise reach form state as-is.
    expect(parseDraft("not json", now)).toBeNull();
    expect(parseDraft("null", now)).toBeNull();
    expect(parseDraft('"a string"', now)).toBeNull();
    expect(parseDraft("[1,2,3]", now)).toBeNull();
    expect(parseDraft(JSON.stringify({ savedAt: now.toISOString() }), now)).toBeNull();
    expect(parseDraft(stored("not an object"), now)).toBeNull();
    expect(parseDraft(stored([1, 2]), now)).toBeNull();
  });

  it("drops non-string values rather than putting them in a textarea", () => {
    expect(parseDraft(stored({ q1: "kept", q2: 42, q3: null, q4: { nested: true } }), now)).toEqual({
      q1: "kept",
    });
  });

  it("returns null when nothing survives filtering", () => {
    expect(parseDraft(stored({ q1: 42, q2: null }), now)).toBeNull();
    expect(parseDraft(stored({ q1: "   " }), now)).toBeNull();
  });

  it("discards a draft older than a week", () => {
    const old = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(parseDraft(stored({ q1: "stale" }, old), now)).toBeNull();

    const recent = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
    expect(parseDraft(stored({ q1: "fresh" }, recent), now)).toEqual({ q1: "fresh" });
  });

  it("keeps a draft whose timestamp is missing or unparseable rather than discarding real work", () => {
    // Erring toward keeping: a bad timestamp is a bug in our own writer, and
    // throwing the user's answers away over it would be the worse outcome.
    expect(parseDraft(JSON.stringify({ answers: { q1: "keep me" } }), now)).toEqual({ q1: "keep me" });
    expect(parseDraft(stored({ q1: "keep me" }, "not-a-date"), now)).toEqual({ q1: "keep me" });
  });
});

/**
 * The round trip against a real storage implementation, and specifically the
 * sequence the user reported: fill in answers, refresh, get an empty form.
 */
describe("save/load round trip", () => {
  function installStorage(): Map<string, string> {
    const data = new Map<string, string>();
    const fake: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, String(v)),
      removeItem: (k) => void data.delete(k),
    };
    Object.defineProperty(globalThis, "window", {
      value: { sessionStorage: fake },
      configurable: true,
      writable: true,
    });
    return data;
  }

  it("persists answers and reads them back", () => {
    installStorage();
    saveDraft("app-1", "job-1", 1, { q1: "Ali Safari", q2: "" });
    expect(loadDraft("app-1", "job-1", 1)).toEqual({ q1: "Ali Safari", q2: "" });
  });

  it("keeps the draft across a simulated reload, which is the whole point", () => {
    const data = installStorage();
    saveDraft("app-1", "job-1", 1, { q1: "half-written answer" });
    // A reload keeps sessionStorage but resets every module and React state.
    installStorageFrom(data);
    expect(loadDraft("app-1", "job-1", 1)).toEqual({ q1: "half-written answer" });
  });

  function installStorageFrom(data: Map<string, string>) {
    Object.defineProperty(globalThis, "window", {
      value: {
        sessionStorage: {
          getItem: (k: string) => data.get(k) ?? null,
          setItem: (k: string, v: string) => void data.set(k, String(v)),
          removeItem: (k: string) => void data.delete(k),
        },
      },
      configurable: true,
      writable: true,
    });
  }

  it("does not let an empty-form save wipe a stored draft when the restore has not landed yet", () => {
    // The bug this guards: both effects run in the same commit, and
    // `setAnswers(restored)` does not apply until the next render — so an
    // unguarded save fired with `answers` still `{}` and deleted the draft
    // the restore had just read. A refresh inside that window lost
    // everything, which is exactly the reported symptom.
    installStorage();
    saveDraft("app-1", "job-1", 1, { q1: "written before the refresh" });

    const restored = loadDraft("app-1", "job-1", 1);
    expect(restored).toEqual({ q1: "written before the refresh" });

    // The panel only calls saveDraft once the round is marked hydrated, so
    // the empty-state write never happens. Were it to happen, this is what
    // it would cost:
    saveDraft("app-1", "job-1", 1, {});
    expect(loadDraft("app-1", "job-1", 1)).toBeNull();
  });

  it("clears only the round that was submitted", () => {
    installStorage();
    saveDraft("app-1", "job-1", 1, { q1: "round one" });
    saveDraft("app-1", "job-1", 2, { q9: "round two" });

    clearDraft("app-1", "job-1", 1);

    expect(loadDraft("app-1", "job-1", 1)).toBeNull();
    expect(loadDraft("app-1", "job-1", 2)).toEqual({ q9: "round two" });
  });

  it("never throws when storage is unavailable, and reports no draft", () => {
    Object.defineProperty(globalThis, "window", {
      value: {
        get sessionStorage(): Storage {
          throw new Error("storage denied");
        },
      },
      configurable: true,
      writable: true,
    });
    expect(() => saveDraft("app-1", "job-1", 1, { q1: "x" })).not.toThrow();
    expect(loadDraft("app-1", "job-1", 1)).toBeNull();
  });
});
