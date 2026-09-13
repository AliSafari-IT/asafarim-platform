import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));

import { prisma } from "@asafarim/db";
import bcrypt from "bcryptjs";
import { authorizeCredentials } from "./providers";

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
};
const mockBcrypt = bcrypt as unknown as { compare: ReturnType<typeof vi.fn> };

const authorize = authorizeCredentials;

const activeUser = {
  id: "u1",
  email: "ali@example.com",
  username: "ali_safari",
  name: "Ali Safari",
  image: null,
  password: "hashed-password",
  isActive: true,
};

describe("credentialsProvider.authorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockBcrypt.compare.mockResolvedValue(false);
  });

  it("authenticates by email", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(activeUser);
    mockBcrypt.compare.mockResolvedValue(true);

    const result = await authorize({ identifier: "ali@example.com", password: "correct" });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "ali@example.com" } });
    expect(result).toMatchObject({ id: "u1", email: "ali@example.com" });
  });

  it("authenticates by username", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(activeUser);
    mockBcrypt.compare.mockResolvedValue(true);

    const result = await authorize({ identifier: "ali_safari", password: "correct" });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { username: "ali_safari" } });
    expect(result).toMatchObject({ id: "u1", email: "ali@example.com" });
  });

  it("returns the same identity regardless of whether email or username was supplied", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(activeUser);
    mockBcrypt.compare.mockResolvedValue(true);

    const byEmail = await authorize({ identifier: "ali@example.com", password: "correct" });
    const byUsername = await authorize({ identifier: "ali_safari", password: "correct" });

    expect(byEmail).toEqual(byUsername);
  });

  it("normalizes a username by lowercasing — matches the canonical lowercase form every username is stored in", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(activeUser);
    mockBcrypt.compare.mockResolvedValue(true);

    await authorize({ identifier: "Ali_Safari", password: "correct" });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { username: "ali_safari" } });
  });

  it("normalizes an email by lowercasing and trimming surrounding whitespace", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(activeUser);
    mockBcrypt.compare.mockResolvedValue(true);

    await authorize({ identifier: "  Ali@Example.com  ", password: "correct" });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "ali@example.com" } });
  });

  it("trims whitespace around a username too", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(activeUser);
    mockBcrypt.compare.mockResolvedValue(true);

    await authorize({ identifier: "  ali_safari  ", password: "correct" });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { username: "ali_safari" } });
  });

  it("rejects wrong password for an email identifier", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(activeUser);
    mockBcrypt.compare.mockResolvedValue(false);

    const result = await authorize({ identifier: "ali@example.com", password: "wrong" });

    expect(result).toBeNull();
  });

  it("rejects wrong password for a username identifier", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(activeUser);
    mockBcrypt.compare.mockResolvedValue(false);

    const result = await authorize({ identifier: "ali_safari", password: "wrong" });

    expect(result).toBeNull();
  });

  it("rejects an unknown identifier", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await authorize({ identifier: "nobody@example.com", password: "whatever" });

    expect(result).toBeNull();
    expect(mockBcrypt.compare).not.toHaveBeenCalled();
  });

  it("rejects a user with no stored password (OAuth-only account)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...activeUser, password: null });

    const result = await authorize({ identifier: "ali@example.com", password: "whatever" });

    expect(result).toBeNull();
    expect(mockBcrypt.compare).not.toHaveBeenCalled();
  });

  it("rejects a deactivated account even with the correct password", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...activeUser, isActive: false });

    const result = await authorize({ identifier: "ali@example.com", password: "correct" });

    expect(result).toBeNull();
    // Never even reaches the password check for a deactivated account.
    expect(mockBcrypt.compare).not.toHaveBeenCalled();
  });

  it("rejects an empty identifier or password without querying the database", async () => {
    expect(await authorize({ identifier: "", password: "x" })).toBeNull();
    expect(await authorize({ identifier: "ali@example.com", password: "" })).toBeNull();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("treats an identifier containing '@' as an email lookup even if it matches no account", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await authorize({ identifier: "not-an-account@example.com", password: "x" });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "not-an-account@example.com" },
    });
    expect(result).toBeNull();
  });
});
