import { describe, expect, it } from "vitest";
import type { ClaimIssue } from "./selection/claims";
import {
  applyRecheck,
  confirmedClaimsOf,
  fieldIssuesFrom,
  openCount,
  removalFor,
  savedConfirmation,
  setAllStatus,
  setIssueStatus,
  withoutOpenIssues,
} from "./claimReview";

function issue(text: string, phrase: string, reason: ClaimIssue["reason"] = "name_not_found"): ClaimIssue {
  const start = text.indexOf(phrase);
  if (start < 0) throw new Error(`"${phrase}" not in "${text}"`);
  return {
    id: `${reason}:${start}`,
    reason,
    start,
    end: start + phrase.length,
    text: phrase,
    whole: start === 0 && phrase.length === text.length,
    rule: null,
    requirementId: null,
    requirementText: null,
    unmetBy: null,
    evidence: [],
  };
}

const remove = (text: string, phrase: string, field: "headline" | "summary" | "bullet" = "bullet") =>
  removalFor(text, issue(text, phrase), field);

describe("removalFor (#964)", () => {
  it("removes a list item with its joiner", () => {
    expect(remove("Built APIs with React, Vue and Node.js.", "Vue")).toEqual({ text: "Built APIs with React and Node.js.", kind: "phrase" });
    expect(remove("Built APIs with React and Vue.", "Vue")).toEqual({ text: "Built APIs with React.", kind: "phrase" });
    expect(remove("Used Vue and React to build dashboards", "Vue")).toEqual({ text: "Used React to build dashboards", kind: "phrase" });
  });

  it("removes a trailing 'using X' phrase", () => {
    expect(remove("Developed automated E2E testing specs using Playwright.", "Playwright")).toEqual({
      text: "Developed automated E2E testing specs.",
      kind: "phrase",
    });
  });

  it("removes a bracketed aside", () => {
    expect(remove("Led QA for two products (Visa) across web and mobile", "Visa")).toEqual({
      text: "Led QA for two products across web and mobile",
      kind: "phrase",
    });
  });

  it("removes a headline segment", () => {
    expect(remove("Full-Stack Developer · ASP.NET Core · React.js", "ASP.NET", "headline")).toEqual({
      text: "Full-Stack Developer · React.js",
      kind: "segment",
    });
  });

  it("falls back to the sentence, and to nothing for a one-sentence bullet", () => {
    const summary = "Full-stack developer. Reached a 98% resolution rate on 1,200 issues. Builds React apps.";
    expect(remove(summary, "98%", "summary")).toEqual({ text: "Full-stack developer. Builds React apps.", kind: "sentence" });
    expect(remove("Reached a 98% resolution rate", "98%")).toBeNull();
  });

  it("never cuts a whole-claim issue or stale offsets", () => {
    const text = "Tuned PostgreSQL";
    expect(removalFor(text, issue(text, text), "bullet")).toBeNull();
    expect(removalFor("Tuned MySQL", issue(text, "PostgreSQL"), "bullet")).toBeNull();
  });
});

describe("issue status and save (#964)", () => {
  const summary = "Full-stack developer. Mentored 5 juniors at Contoso. Builds React apps.";
  const field = fieldIssuesFrom("summary", null, summary, [issue(summary, "Mentored", "responsibility"), issue(summary, "5", "number_not_found")]);

  it("counts open issues and drops them as they are resolved", () => {
    expect(openCount({ summary: field })).toBe(2);
    const one = setIssueStatus(field, field.issues[0]!.id, "confirmed", "  I coached two interns. ");
    expect(openCount({ summary: one })).toBe(1);
    expect(one.issues[0]).toMatchObject({ status: "confirmed", detail: "I coached two interns." });
  });

  it("leaves open AI wording out on save, sentence by sentence", () => {
    expect(withoutOpenIssues(field, summary)).toEqual({ text: "Full-stack developer. Builds React apps.", fallback: false });
    const headline = "Senior Developer";
    const h = fieldIssuesFrom("headline", null, headline, [issue(headline, "Senior", "responsibility")]);
    expect(withoutOpenIssues(h, headline).fallback).toBe(true);
  });

  it("a recheck keeps confirmations on the same words and drops what it no longer finds", () => {
    const confirmed = setIssueStatus(field, field.issues[0]!.id, "confirmed", "detail");
    const edited = "Full-stack developer. Mentored juniors at Contoso. Builds React apps.";
    const after = applyRecheck(confirmed, edited, [issue(edited, "Mentored", "responsibility")]);
    expect(after.issues).toMatchObject([{ text: "Mentored", status: "confirmed", detail: "detail" }]);
    expect(after.checkedText).toBe(edited);
  });

  it("ticking a flagged bullet confirms it; unticking excludes it", () => {
    const text = "Answered tickets for Visa";
    const bullet = fieldIssuesFrom("bullet", 1, text, [issue(text, "Visa")]);
    expect(setAllStatus(bullet, ["open", "excluded"], "confirmed").issues[0]!.status).toBe("confirmed");
    expect(setAllStatus(bullet, ["open", "confirmed"], "excluded").issues[0]!.status).toBe("excluded");
  });

  it("keeps confirmed claims apart, with their role, only while the words are still saved", () => {
    const text = "Answered tickets for Visa";
    const bullet = setAllStatus(fieldIssuesFrom("bullet", 1, text, [issue(text, "Visa")]), ["open"], "confirmed");
    const role = { title: "Support Engineer", employer: "Fabrikam", startedOn: "2020-01" };
    const claims = confirmedClaimsOf({ b1: bullet }, () => role, () => text);
    expect(claims).toEqual([{ where: "bullet", ...role, claim: "Visa", reason: "name_not_found", detail: null }]);
    expect(confirmedClaimsOf({ b1: bullet }, () => role, () => "Answered tickets")).toEqual([]);
    expect(confirmedClaimsOf({ b1: bullet }, () => role, () => undefined)).toEqual([]);
    expect(savedConfirmation(claims, "bullet", role, { reason: "name_not_found", text: "Visa" })).toBeDefined();
    expect(savedConfirmation(claims, "bullet", { ...role, employer: "Other" }, { reason: "name_not_found", text: "Visa" })).toBeUndefined();
  });
});
