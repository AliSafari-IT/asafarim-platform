import { describe, expect, it } from "vitest";
import {
  applicationEntry,
  parseStatusChange,
  statusChangeApplicationIds,
  statusChangeEntry,
  type JobLabel,
} from "./applicationEntries";

const base = "https://resumatch.example";

describe("applicationEntry", () => {
  it("shows the application with its current status and job", () => {
    const entry = applicationEntry(
      {
        id: "app_1",
        status: "INTERVIEWING",
        createdAt: new Date("2026-09-20T10:00:00Z"),
        updatedAt: new Date("2026-09-26T14:00:00Z"),
        followUpDate: null,
        tailoredResumeId: "tr_1",
        targetJob: { title: "Business Developer", employer: "LARAMNO" },
      },
      base,
    );
    expect(entry).toMatchObject({
      id: "app_1",
      type: "application",
      title: "Business Developer · LARAMNO",
      status: "interviewing",
      createdAt: "2026-09-20T10:00:00.000Z",
      updatedAt: "2026-09-26T14:00:00.000Z",
      href: `${base}/applications`,
    });
  });
});

describe("statusChangeEntry", () => {
  const jobs = new Map<string, JobLabel>([["app_1", { title: "Business Developer", employer: "LARAMNO" }]]);
  const event = {
    id: "ev_1",
    createdAt: new Date("2026-09-26T14:48:06Z"),
    metadata: { applicationId: "app_1", targetJobId: "job_1", fromStatus: "INTERVIEWING", toStatus: "OFFER" },
  };

  it("stamps the entry with the time of the change", () => {
    expect(statusChangeEntry(event, jobs, base)).toMatchObject({
      id: "ev_1",
      type: "application_status_change",
      title: "Business Developer · LARAMNO: interviewing → offer",
      status: "offer",
      createdAt: "2026-09-26T14:48:06.000Z",
      metadata: { applicationId: "app_1", fromStatus: "INTERVIEWING", toStatus: "OFFER" },
    });
  });

  it("still shows a change whose application is gone, just untitled", () => {
    expect(statusChangeEntry(event, new Map(), base)?.title).toBe("Application: interviewing → offer");
  });

  it("skips events from before from/to were recorded", () => {
    expect(statusChangeEntry({ ...event, metadata: { jobId: "app_1" } }, jobs, base)).toBeNull();
    expect(parseStatusChange(null)).toBeNull();
  });

  it("collects each referenced application once", () => {
    expect(statusChangeApplicationIds([event, event, { ...event, metadata: {} }])).toEqual(["app_1"]);
  });
});
