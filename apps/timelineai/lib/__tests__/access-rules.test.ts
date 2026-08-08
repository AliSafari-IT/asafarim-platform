import { describe, expect, it } from "vitest";
import { canAccess, type ViewerContext, type AccessSubject } from "../access-rules";

const anon: ViewerContext = { userId: null, isAdmin: false, guestIdHash: null };
const guestA: ViewerContext = { userId: null, isAdmin: false, guestIdHash: "hash-a" };
const guestB: ViewerContext = { userId: null, isAdmin: false, guestIdHash: "hash-b" };
const owner: ViewerContext = { userId: "user-1", isAdmin: false, guestIdHash: null };
const otherUser: ViewerContext = { userId: "user-2", isAdmin: false, guestIdHash: null };
const admin: ViewerContext = { userId: "admin-1", isAdmin: true, guestIdHash: null };

function timeline(overrides: Partial<AccessSubject> = {}): AccessSubject {
  return {
    ownerUserId: "user-1",
    guestIdHash: null,
    visibility: "private",
    moderationStatus: "not_required",
    ...overrides,
  };
}

describe("canAccess — authenticated ownership", () => {
  it("lets the owner view/edit/delete their own private timeline", () => {
    const t = timeline();
    expect(canAccess(t, owner, "view")).toBe(true);
    expect(canAccess(t, owner, "edit")).toBe(true);
    expect(canAccess(t, owner, "delete")).toBe(true);
  });

  it("blocks a different signed-in user from a private timeline", () => {
    const t = timeline();
    expect(canAccess(t, otherUser, "view")).toBe(false);
    expect(canAccess(t, otherUser, "edit")).toBe(false);
  });

  it("blocks anonymous visitors from a private timeline", () => {
    expect(canAccess(timeline(), anon, "view")).toBe(false);
  });

  it("lets anyone view a published, self-published (not_required) public timeline", () => {
    const t = timeline({ visibility: "public", moderationStatus: "not_required" });
    expect(canAccess(t, anon, "view")).toBe(true);
    expect(canAccess(t, otherUser, "view")).toBe(true);
  });

  it("still blocks edit/delete for non-owners even when public", () => {
    const t = timeline({ visibility: "public", moderationStatus: "not_required" });
    expect(canAccess(t, otherUser, "edit")).toBe(false);
    expect(canAccess(t, otherUser, "delete")).toBe(false);
  });
});

describe("canAccess — guest ownership and moderation gate", () => {
  it("lets the originating guest view/edit/delete their own pending submission", () => {
    const t = timeline({ ownerUserId: null, guestIdHash: "hash-a", visibility: "public", moderationStatus: "pending" });
    expect(canAccess(t, guestA, "view")).toBe(true);
    expect(canAccess(t, guestA, "edit")).toBe(true);
    expect(canAccess(t, guestA, "delete")).toBe(true);
  });

  it("blocks a different guest from a pending submission even if marked public", () => {
    const t = timeline({ ownerUserId: null, guestIdHash: "hash-a", visibility: "public", moderationStatus: "pending" });
    expect(canAccess(t, guestB, "view")).toBe(false);
    expect(canAccess(t, anon, "view")).toBe(false);
  });

  it("blocks everyone but the guest and admins from a rejected submission", () => {
    const t = timeline({ ownerUserId: null, guestIdHash: "hash-a", visibility: "public", moderationStatus: "rejected" });
    expect(canAccess(t, guestB, "view")).toBe(false);
    expect(canAccess(t, guestA, "view")).toBe(true);
    expect(canAccess(t, admin, "view")).toBe(true);
  });

  it("opens up a guest submission to everyone once approved", () => {
    const t = timeline({ ownerUserId: null, guestIdHash: "hash-a", visibility: "public", moderationStatus: "approved" });
    expect(canAccess(t, anon, "view")).toBe(true);
    expect(canAccess(t, guestB, "view")).toBe(true);
  });
});

describe("canAccess — admin bypass", () => {
  it("lets admins view/edit/delete anything regardless of ownership or status", () => {
    const t = timeline({ ownerUserId: null, guestIdHash: "hash-a", visibility: "private", moderationStatus: "pending" });
    expect(canAccess(t, admin, "view")).toBe(true);
    expect(canAccess(t, admin, "edit")).toBe(true);
    expect(canAccess(t, admin, "delete")).toBe(true);
    expect(canAccess(t, admin, "moderate")).toBe(true);
  });

  it("blocks moderate for non-admins even when they own the timeline", () => {
    expect(canAccess(timeline(), owner, "moderate")).toBe(false);
  });
});

describe("canAccess — unlisted visibility", () => {
  it("is viewable by anyone who has the link (not gated further than public here)", () => {
    const t = timeline({ visibility: "unlisted", moderationStatus: "not_required" });
    expect(canAccess(t, anon, "view")).toBe(true);
  });
});
