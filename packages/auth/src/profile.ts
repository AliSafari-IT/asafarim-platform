import { z } from "zod";
import { prisma } from "@asafarim/db";
import { hashPassword, verifyPassword } from "./providers";
import { slugifyUsername } from "./username";

export const UpdateProfileInputSchema = z.object({
  name: z.string().trim().max(120).nullable().optional(),
  username: z.string().trim().min(3).max(24).optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  company: z.string().trim().max(120).nullable().optional(),
  website: z.string().trim().url().max(300).nullable().or(z.literal("")).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  preferredLocale: z.string().trim().max(20).nullable().optional(),
  timezone: z.string().trim().max(50).nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; status: 400 | 409; error: string };

/** Updates the core profile fields for a user. Username changes are re-checked for uniqueness. */
export async function updateUserProfile(userId: string, rawInput: unknown): Promise<UpdateProfileResult> {
  const parsed = UpdateProfileInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const input = parsed.data;

  const data: Record<string, unknown> = { ...input };

  if (input.username !== undefined) {
    const normalized = slugifyUsername(input.username);
    if (normalized.length < 3) {
      return { ok: false, status: 400, error: "Username must be at least 3 characters." };
    }
    const existing = await prisma.user.findFirst({
      where: { username: normalized, NOT: { id: userId } },
      select: { id: true },
    });
    if (existing) {
      return { ok: false, status: 409, error: "This username is already taken." };
    }
    data.username = normalized;
  }

  if (input.website === "") {
    data.website = null;
  }

  await prisma.user.update({ where: { id: userId }, data });
  return { ok: true };
}

export const ChangePasswordInputSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(200),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;

export type ChangePasswordResult = { ok: true } | { ok: false; status: 400 | 401; error: string };

/**
 * Changes (or sets, for OAuth-only accounts) a user's password. If the user
 * already has a password, `currentPassword` must be supplied and correct.
 */
export async function changePassword(userId: string, rawInput: unknown): Promise<ChangePasswordResult> {
  const parsed = ChangePasswordInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const input = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user) {
    return { ok: false, status: 401, error: "Not signed in." };
  }

  if (user.password) {
    if (!input.currentPassword) {
      return { ok: false, status: 400, error: "Current password is required." };
    }
    const valid = await verifyPassword(input.currentPassword, user.password);
    if (!valid) {
      return { ok: false, status: 401, error: "Current password is incorrect." };
    }
  }

  const hashed = await hashPassword(input.newPassword);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  return { ok: true };
}
