import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    eduStudentProfile: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@asafarim/db";
import {
  AvatarError,
  applyDefaultAvatarIfNeeded,
  DEFAULT_STUDENT_AVATAR_PATH,
  getAvatarState,
  isPresetAvatarPath,
  presetAvatarPath,
  setStudentAvatar,
} from "../avatars";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("presetAvatarPath / isPresetAvatarPath", () => {
  it("resolves a known preset id to its static path", () => {
    expect(presetAvatarPath("cosmo")).toBe("/avatars/students/cosmo.svg");
  });

  it("rejects an unknown preset id", () => {
    expect(presetAvatarPath("not-a-real-avatar")).toBeNull();
  });

  it("recognises a preset path but not an arbitrary URL", () => {
    expect(isPresetAvatarPath("/avatars/students/nova.svg")).toBe(true);
    expect(isPresetAvatarPath("https://example.com/photo.jpg")).toBe(false);
    expect(isPresetAvatarPath(null)).toBe(false);
  });
});

describe("setStudentAvatar", () => {
  it("allows a drawn avatar regardless of age", async () => {
    const result = await setStudentAvatar("u-10yo", { type: "preset", id: "rocket" });
    expect(result.image).toBe("/avatars/students/rocket.svg");
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-10yo" },
      data: { image: "/avatars/students/rocket.svg" },
    });
  });

  it("rejects an unknown preset id", async () => {
    await expect(
      setStudentAvatar("u-1", { type: "preset", id: "does-not-exist" }),
    ).rejects.toThrow(AvatarError);
  });

  it("rejects an uploaded photo for a 10-year-old", async () => {
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue({
      dateOfBirth: new Date(new Date().getFullYear() - 10, 0, 1),
    });

    await expect(
      setStudentAvatar("u-10yo", {
        type: "upload",
        key: "avatars/u-10yo/abc/photo.jpg",
        publicUrl: "https://cdn.example.com/avatars/u-10yo/abc/photo.jpg",
      }),
    ).rejects.toThrow(/13 or older/);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects an uploaded photo when no date of birth is on file", async () => {
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue({ dateOfBirth: null });

    await expect(
      setStudentAvatar("u-unknown-age", {
        type: "upload",
        key: "avatars/u-unknown-age/abc/photo.jpg",
        publicUrl: "https://cdn.example.com/x.jpg",
      }),
    ).rejects.toThrow(AvatarError);
  });

  it("accepts an uploaded photo for a 14-year-old with a valid key", async () => {
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue({
      dateOfBirth: new Date(new Date().getFullYear() - 14, 0, 1),
    });

    const result = await setStudentAvatar("u-14yo", {
      type: "upload",
      key: "avatars/u-14yo/abc/photo.jpg",
      publicUrl: "https://cdn.example.com/avatars/u-14yo/abc/photo.jpg",
    });

    expect(result.image).toBe("https://cdn.example.com/avatars/u-14yo/abc/photo.jpg");
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-14yo" },
      data: { image: "https://cdn.example.com/avatars/u-14yo/abc/photo.jpg" },
    });
  });

  it("rejects an upload key that belongs to a different user", async () => {
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue({
      dateOfBirth: new Date(new Date().getFullYear() - 20, 0, 1),
    });

    await expect(
      setStudentAvatar("u-14yo", {
        type: "upload",
        key: "avatars/someone-else/abc/photo.jpg",
        publicUrl: "https://cdn.example.com/x.jpg",
      }),
    ).rejects.toThrow(/does not belong to you/);
  });
});

describe("getAvatarState", () => {
  it("falls back to the default avatar and reports canUpload=false with no dateOfBirth", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ image: null });
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue({ dateOfBirth: null });

    const state = await getAvatarState("u-1");

    expect(state.current).toBe(DEFAULT_STUDENT_AVATAR_PATH);
    expect(state.ageVerified).toBe(false);
    expect(state.canUpload).toBe(false);
    expect(state.avatars.length).toBeGreaterThan(0);
  });

  it("reports canUpload=true for a verified 16-year-old", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ image: "/avatars/students/nova.svg" });
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue({
      dateOfBirth: new Date(new Date().getFullYear() - 16, 0, 1),
    });

    const state = await getAvatarState("u-16yo");

    expect(state.ageVerified).toBe(true);
    expect(state.canUpload).toBe(true);
    expect(state.isPreset).toBe(true);
  });
});

describe("applyDefaultAvatarIfNeeded", () => {
  it("sets the default avatar when the user has no image yet", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ image: null });

    await applyDefaultAvatarIfNeeded("u-1", null);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { image: DEFAULT_STUDENT_AVATAR_PATH },
    });
  });

  it("resets an under-13 student's non-preset image (e.g. OAuth photo) back to the default", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ image: "https://oauth.example.com/pic.jpg" });

    await applyDefaultAvatarIfNeeded("u-10yo", new Date(new Date().getFullYear() - 10, 0, 1));

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-10yo" },
      data: { image: DEFAULT_STUDENT_AVATAR_PATH },
    });
  });

  it("leaves a 13+ student's existing image untouched", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ image: "https://oauth.example.com/pic.jpg" });

    await applyDefaultAvatarIfNeeded("u-16yo", new Date(new Date().getFullYear() - 16, 0, 1));

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("leaves an already-preset avatar untouched for an under-13 student", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ image: "/avatars/students/bram.svg" });

    await applyDefaultAvatarIfNeeded("u-10yo", new Date(new Date().getFullYear() - 10, 0, 1));

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
