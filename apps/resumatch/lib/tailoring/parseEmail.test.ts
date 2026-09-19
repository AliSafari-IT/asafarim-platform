import { describe, expect, it } from "vitest";
import { parseJobInvitationEmail } from "./parseEmail";

describe("parseJobInvitationEmail", () => {
  it("strips a signature block", () => {
    const email = [
      "Hi there,",
      "",
      "We have a Senior Backend Engineer role that looks like a great fit for your background in distributed systems and PostgreSQL.",
      "",
      "--",
      "Jane Recruiter",
      "Talent Acquisition, Acme Corp",
      "jane@acme.example",
    ].join("\n");
    const parsed = parseJobInvitationEmail(email);
    expect(parsed.rawText).toContain("Senior Backend Engineer");
    expect(parsed.rawText).not.toContain("Talent Acquisition");
  });

  it("strips a quoted reply thread", () => {
    const email = [
      "Sounds great, here is the role we discussed with full details about the backend position and requirements.",
      "",
      "On Mon, Jan 5, 2026 at 3:00 PM John Smith <john@example.com> wrote:",
      "> Can you send me more details about the opening?",
      "> Thanks",
    ].join("\n");
    const parsed = parseJobInvitationEmail(email);
    expect(parsed.rawText).toContain("full details about the backend position");
    expect(parsed.rawText).not.toContain("Can you send me more details");
  });

  it("strips quoted lines prefixed with >", () => {
    const email = [
      "Please see the attached role description below with all the responsibilities and requirements listed.",
      "> old quoted content that should not appear",
      "> more quoted content",
    ].join("\n");
    const parsed = parseJobInvitationEmail(email);
    expect(parsed.rawText).not.toContain("old quoted content");
  });

  it("strips a confidentiality disclaimer footer", () => {
    const email = [
      "We'd love to have you apply for our open Platform Engineer position with responsibilities across our core services.",
      "",
      "This e-mail and any files transmitted with it are confidential and intended solely for the addressee.",
    ].join("\n");
    const parsed = parseJobInvitationEmail(email);
    expect(parsed.rawText).not.toContain("confidential");
  });

  it("guesses a title from the subject line, stripping Re:/Fwd: prefixes", () => {
    const parsed = parseJobInvitationEmail("Some job description text that is long enough to pass the minimum length check easily.", "Fwd: Re: Senior Backend Engineer opening");
    expect(parsed.guessedTitle).toBe("Senior Backend Engineer opening");
  });

  it("returns a null title when no subject is given", () => {
    const parsed = parseJobInvitationEmail("Some job description text that is long enough to pass the minimum length check easily.");
    expect(parsed.guessedTitle).toBeNull();
  });

  it("guesses an employer from a parenthesized From line", () => {
    const email = [
      "From: Jane Recruiter (Acme Corp) <jane@acme.example>",
      "",
      "We have an opening that matches your background well across several core engineering responsibilities.",
    ].join("\n");
    const parsed = parseJobInvitationEmail(email);
    expect(parsed.guessedEmployer).toBe("Acme Corp");
  });

  it("guesses an employer from the email domain when no parenthesized name exists", () => {
    const email = [
      "From: Jane Recruiter <jane@acmecorp.example>",
      "",
      "We have an opening that matches your background well across several core engineering responsibilities.",
    ].join("\n");
    const parsed = parseJobInvitationEmail(email);
    expect(parsed.guessedEmployer).toBe("Acmecorp");
  });

  it("does not guess a free-mail domain as the employer", () => {
    const email = [
      "From: Jane Recruiter <jane@gmail.com>",
      "",
      "We have an opening that matches your background well across several core engineering responsibilities.",
    ].join("\n");
    const parsed = parseJobInvitationEmail(email);
    expect(parsed.guessedEmployer).toBeNull();
  });
});
