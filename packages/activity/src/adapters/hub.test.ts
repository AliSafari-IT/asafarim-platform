import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}));

import { prisma } from "@asafarim/db";
import { hubActivityAdapter } from "./hub";

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  auditLog: { findMany: ReturnType<typeof vi.fn> };
};

const now = new Date("2026-01-01T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.auditLog.findMany.mockResolvedValue([]);
});

describe("hubActivityAdapter", () => {
  it("is available even when the user has never signed in and somehow has no user row (defensive empty case)", async () => {
    const section = await hubActivityAdapter.getActivity({ userId: "u1" });
    expect(section).toMatchObject({ app: "hub", supported: true, available: true, entries: [] });
  });

  it("reads sign-in history from the AuditLog rows packages/auth writes, not a dedicated table", async () => {
    await hubActivityAdapter.getActivity({ userId: "u1" });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", entity: "auth", action: "sign_in" } })
    );
  });

  it("maps the user row to exactly one profile entry, explicitly labelled as a snapshot", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      name: "Ali Safari",
      email: "ali@example.com",
      username: "ali",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const section = await hubActivityAdapter.getActivity({ userId: "u1" });

    const profileEntries = section.entries.filter((e) => e.type === "profile");
    expect(profileEntries).toHaveLength(1);
    expect(profileEntries[0]).toMatchObject({
      title: "Ali Safari",
      status: "active",
      metadata: { snapshot: true },
    });
  });

  it("reports a deactivated account's status honestly", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      name: "Ali Safari",
      email: "ali@example.com",
      username: "ali",
      isActive: false,
      createdAt: now,
      updatedAt: now,
    });

    const section = await hubActivityAdapter.getActivity({ userId: "u1" });

    expect(section.entries[0]).toMatchObject({ status: "deactivated" });
  });

  it("maps each sign-in AuditLog row to its own entry, newest first as queried, with the provider in the title", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: "a2", changes: { provider: "google" }, createdAt: new Date("2026-01-02T00:00:00Z") },
      { id: "a1", changes: { provider: "credentials" }, createdAt: now },
    ]);

    const section = await hubActivityAdapter.getActivity({ userId: "u1" });

    const signIns = section.entries.filter((e) => e.type === "sign_in");
    expect(signIns).toHaveLength(2);
    expect(signIns[0]).toMatchObject({ title: "Signed in via google", metadata: { provider: "google" } });
    expect(signIns[1]).toMatchObject({ title: "Signed in via credentials", metadata: { provider: "credentials" } });
  });

  it("falls back to 'credentials' when a sign-in row has no recorded provider", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([{ id: "a1", changes: {}, createdAt: now }]);

    const section = await hubActivityAdapter.getActivity({ userId: "u1" });

    expect(section.entries[0]).toMatchObject({ metadata: { provider: "credentials" } });
  });

  it("never sets a summary — no storage-usage model exists for Hub", async () => {
    const section = await hubActivityAdapter.getActivity({ userId: "u1" });
    expect(section.summary).toBeUndefined();
  });
});
