import { describe, expect, it } from "vitest";
import { createEventSchema, editSubmissionSchema, normalizeHttpUrl, parseWith, prefillApplicationUrl, recordSubmissionSchema, updateEventSchema } from "./contract";

const NOW = Date.parse("2026-11-25T12:00:00Z");
const base = {
  clientKey: "6f1d2c3a-1111-4222-8333-944455556666",
  appliedAt: { local: "2026-11-20T14:30", timeZone: "Europe/Brussels" },
  channel: "INDEED",
};

describe("recordSubmissionSchema", () => {
  it("accepts an Indeed application with no email, documents or optional fields", () => {
    const parsed = parseWith(recordSubmissionSchema(NOW), base);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.appliedAt.at.toISOString()).toBe("2026-11-20T13:30:00.000Z");
    expect(parsed.value.appliedAt.timeZone).toBe("Europe/Brussels");
    expect(parsed.value).toMatchObject({ applicationUrl: null, reference: null, notes: null, followUpDate: null, confirmationText: null, confirmationAt: null });
  });

  it("turns blank text into null and trims", () => {
    const parsed = parseWith(recordSubmissionSchema(NOW), { ...base, reference: "  ABC-1 ", notes: "   ", applicationUrl: "" });
    expect(parsed.ok && parsed.value).toMatchObject({ reference: "ABC-1", notes: null, applicationUrl: null });
  });

  it("refuses a time in the future, a bad zone, a script URL and unknown fields", () => {
    expect(parseWith(recordSubmissionSchema(NOW), { ...base, appliedAt: { local: "2026-11-26T10:00", timeZone: "UTC" } })).toMatchObject({ ok: false, fields: ["appliedAt"] });
    expect(parseWith(recordSubmissionSchema(NOW), { ...base, appliedAt: { local: "2026-11-20T10:00", timeZone: "Nowhere/City" } })).toMatchObject({ ok: false, fields: ["appliedAt"] });
    expect(parseWith(recordSubmissionSchema(NOW), { ...base, applicationUrl: "javascript:alert(1)" })).toMatchObject({ ok: false, fields: ["applicationUrl"] });
    expect(parseWith(recordSubmissionSchema(NOW), { ...base, status: "OFFER" })).toMatchObject({ ok: false, fields: ["status"] });
    expect(parseWith(recordSubmissionSchema(NOW), { ...base, clientKey: "x" })).toMatchObject({ ok: false, fields: ["clientKey"] });
  });

  it("keeps the confirmation time separate from the applied time", () => {
    const parsed = parseWith(recordSubmissionSchema(NOW), {
      ...base,
      confirmationText: "Thanks for applying",
      confirmationAt: { local: "2026-11-20T14:31", timeZone: "Europe/Brussels" },
    });
    expect(parsed.ok && parsed.value.confirmationAt?.at.toISOString()).toBe("2026-11-20T13:31:00.000Z");
  });

  it("does not let an edit carry a client key or follow-up", () => {
    expect(parseWith(editSubmissionSchema(NOW), base)).toMatchObject({ ok: false, fields: ["clientKey"] });
    const { clientKey: _k, ...edit } = base;
    expect(parseWith(editSubmissionSchema(NOW), edit).ok).toBe(true);
  });
});

describe("event schemas", () => {
  const event = { clientKey: base.clientKey, kind: "RECRUITER_REPLY", occurredAt: { local: "2026-12-02T09:00", timeZone: "UTC" } };
  it("defaults to no status change and allows a future interview", () => {
    const parsed = parseWith(createEventSchema, { ...event, kind: "INTERVIEW" });
    expect(parsed.ok && parsed.value.statusChange).toBeNull();
  });
  it("accepts an explicit status change on create only", () => {
    expect(parseWith(createEventSchema, { ...event, statusChange: "INTERVIEWING" })).toMatchObject({ ok: true });
    const { clientKey: _k, ...edit } = event;
    expect(parseWith(updateEventSchema, { ...edit, statusChange: "INTERVIEWING" })).toMatchObject({ ok: false, fields: ["statusChange"] });
  });
  it("refuses an unknown kind", () => {
    expect(parseWith(createEventSchema, { ...event, kind: "HIRED" })).toMatchObject({ ok: false, fields: ["kind"] });
  });
});

describe("URLs", () => {
  it("accepts only http(s) without credentials", () => {
    expect(normalizeHttpUrl("https://www.indeed.com/viewjob?jk=1")).toBe("https://www.indeed.com/viewjob?jk=1");
    expect(normalizeHttpUrl("data:text/html,hi")).toBeNull();
    expect(normalizeHttpUrl("https://user:pw@example.com")).toBeNull();
  });
  it("prefills only from a real web address", () => {
    expect(prefillApplicationUrl("https://jobs.example.com/1")).toBe("https://jobs.example.com/1");
    expect(prefillApplicationUrl("manual://job-entry")).toBeNull();
    expect(prefillApplicationUrl("upload://cv.pdf")).toBeNull();
  });
});
