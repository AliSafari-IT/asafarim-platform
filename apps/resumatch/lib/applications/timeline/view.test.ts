import { describe, expect, it } from "vitest";
import { latestActivity, mergeTimeline, type EmailEntryView, type EventEntryView } from "./view";

const event = (id: string, occurredAt: string, kind: EventEntryView["kind"] = "NOTE", createdAt = occurredAt): EventEntryView => ({
  type: "event",
  id,
  kind,
  origin: "MANUAL",
  occurredAt,
  timeZone: "UTC",
  summary: null,
  sender: null,
  recipient: null,
  nextAction: null,
  followUpDay: null,
  fromStatus: null,
  toStatus: null,
  createdAt,
  updatedAt: createdAt,
  attachments: [],
  isRecordedSubmission: false,
});
const email = (id: string, at: string, status = "ACCEPTED"): EmailEntryView => ({ type: "email", id, status, at, to: "hr@example.com", subject: "S", statusTransition: null });

describe("mergeTimeline", () => {
  it("keeps every entry, oldest first, with sent emails in place", () => {
    const merged = mergeTimeline(
      [event("reply", "2026-11-22T10:00:00.000Z", "RECRUITER_REPLY"), event("interview", "2026-11-25T09:00:00.000Z", "INTERVIEW")],
      [email("mail", "2026-11-20T08:00:00.000Z")],
    );
    expect(merged.map((e) => e.id)).toEqual(["mail", "reply", "interview"]);
  });
  it("orders equal times by when they were recorded", () => {
    const merged = mergeTimeline([event("b", "2026-11-22T10:00:00.000Z", "NOTE", "2026-11-23T00:00:00.000Z"), event("a", "2026-11-22T10:00:00.000Z", "NOTE", "2026-11-22T11:00:00.000Z")], []);
    expect(merged.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("latestActivity", () => {
  it("picks the newer of an entry and an email, and never calls a failed email sent", () => {
    expect(latestActivity({ kind: "INTERVIEW", occurredAt: "2026-11-25T09:00:00Z", timeZone: "Europe/Brussels" }, { status: "ACCEPTED", sentAt: "2026-11-20T08:00:00Z", attemptedAt: "2026-11-20T08:00:00Z" })).toMatchObject({ kind: "INTERVIEW", timeZone: "Europe/Brussels" });
    expect(latestActivity(null, { status: "FAILED", sentAt: null, attemptedAt: "2026-11-20T08:00:00Z" })).toMatchObject({ kind: "EMAIL_NOT_SENT" });
    expect(latestActivity(null, null)).toBeNull();
  });
});
