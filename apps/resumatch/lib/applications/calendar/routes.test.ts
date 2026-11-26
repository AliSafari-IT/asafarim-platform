import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two .ics download routes (#969): owner-only, read-only, and nothing
 * private is selected or written into the file.
 */

const applicationFindFirst = vi.fn();
const eventFindFirst = vi.fn();
const getCurrentWorkspace = vi.fn();

vi.mock("../../db/client", () => ({
  getJobmatchDb: () => ({
    application: { findFirst: (...a: unknown[]) => applicationFindFirst(...a) },
    applicationEvent: { findFirst: (...a: unknown[]) => eventFindFirst(...a) },
  }),
}));
vi.mock("../../workspace", () => ({ getCurrentWorkspace: () => getCurrentWorkspace() }));
vi.mock("../../env", () => ({ getEnv: () => ({ appUrl: "https://resumatch.asafarim.com" }) }));
vi.mock("../../i18n-server", async () => {
  const { getServerTranslator } = await import("@asafarim/shared-i18n/server");
  const { default: dictionaries } = await import("../../i18n-dictionaries");
  return { getTranslator: async () => ({ locale: "en", t: getServerTranslator("en", dictionaries) }) };
});

import { GET as followUpGet } from "../../../app/api/applications/[id]/follow-up/calendar/route";
import { GET as interviewGet } from "../../../app/api/applications/[id]/events/[eventId]/calendar/route";

const followUp = (id = "app-1") =>
  followUpGet(new Request(`http://localhost/api/applications/${id}/follow-up/calendar`), { params: Promise.resolve({ id }) });
const interview = (id = "app-1", eventId = "evt-1") =>
  interviewGet(new Request(`http://localhost/api/applications/${id}/events/${eventId}/calendar`), {
    params: Promise.resolve({ id, eventId }),
  });

const targetJob = { title: "Data Engineer", employer: "Acme, Inc." };

beforeEach(() => {
  applicationFindFirst.mockReset().mockResolvedValue({ id: "app-1", followUpDate: new Date("2026-12-03T00:00:00Z"), targetJob });
  eventFindFirst.mockReset().mockResolvedValue({
    id: "evt-1",
    kind: "INTERVIEW",
    occurredAt: new Date("2026-11-24T09:00:00Z"),
    timeZone: "Europe/Brussels",
    application: { id: "app-1", targetJob },
  });
  getCurrentWorkspace.mockReset().mockResolvedValue({ id: "ws-1" });
});

describe("follow-up download", () => {
  it("401s without a session and reads nothing", async () => {
    getCurrentWorkspace.mockResolvedValue(null);
    expect((await followUp()).status).toBe(401);
    expect(applicationFindFirst).not.toHaveBeenCalled();
  });

  it("looks the application up only inside the session's workspace", async () => {
    await followUp("app-1");
    const query = applicationFindFirst.mock.calls[0][0];
    expect(query.where).toEqual({ id: "app-1", workspaceId: "ws-1" });
    // Only what goes in the file: no notes, messages or attachments.
    expect(Object.keys(query.select).sort()).toEqual(["followUpDate", "id", "targetJob"]);
  });

  it("404s for another workspace's application", async () => {
    applicationFindFirst.mockResolvedValue(null);
    const res = await followUp("someone-elses");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found", code: "NOT_FOUND" });
  });

  it("409s, with no file, when no follow-up date is saved", async () => {
    applicationFindFirst.mockResolvedValue({ id: "app-1", followUpDate: null, targetJob });
    const res = await followUp();
    expect(res.status).toBe(409);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("downloads an all-day calendar file with a calendar content type and filename", async () => {
    const res = await followUp();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("content-disposition")).toContain("filename*=UTF-8''Follow-up%20%E2%80%93%20Data%20Engineer%20%E2%80%93%20Acme%2C%20Inc..ics");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.text();
    expect(body).toContain("DTSTART;VALUE=DATE:20261203\r\n");
    expect(body).toContain("SUMMARY:Follow up: Data Engineer at Acme\\, Inc.\r\n");
    expect(body).toContain("URL:https://resumatch.asafarim.com/applications/app-1/timeline");
  });
});

describe("interview download", () => {
  it("401s without a session", async () => {
    getCurrentWorkspace.mockResolvedValue(null);
    expect((await interview()).status).toBe(401);
    expect(eventFindFirst).not.toHaveBeenCalled();
  });

  it("scopes the entry to the application and the workspace, selecting no private fields", async () => {
    await interview("app-1", "evt-1");
    const query = eventFindFirst.mock.calls[0][0];
    expect(query.where).toEqual({ id: "evt-1", applicationId: "app-1", workspaceId: "ws-1" });
    expect(query.select).not.toHaveProperty("summary");
    expect(query.select).not.toHaveProperty("sender");
    expect(query.select).not.toHaveProperty("recipient");
    expect(query.select).not.toHaveProperty("attachments");
  });

  it("404s for another workspace's entry", async () => {
    eventFindFirst.mockResolvedValue(null);
    expect((await interview("app-1", "theirs")).status).toBe(404);
  });

  it("does not export an entry that is not an interview", async () => {
    eventFindFirst.mockResolvedValue({ id: "evt-2", kind: "RECRUITER_REPLY", occurredAt: new Date(), timeZone: "UTC", application: { id: "app-1", targetJob } });
    expect((await interview("app-1", "evt-2")).status).toBe(409);
  });

  it("downloads the saved instant in UTC with the saved zone named", async () => {
    const res = await interview();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    const body = (await res.text()).replace(/\r\n /g, "");
    expect(body).toContain("DTSTART:20261124T090000Z\r\n");
    expect(body).not.toContain("DTEND");
    expect(body).toContain("SUMMARY:Interview: Data Engineer at Acme\\, Inc.");
    expect(body).toContain("(Europe/Brussels)");
  });
});
