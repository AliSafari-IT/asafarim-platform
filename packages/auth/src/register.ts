import { z } from "zod";
import { prisma } from "@asafarim/db";
import { hashPassword } from "./providers";
import { slugifyUsername } from "./username";
import { ensureDefaultRole } from "./config";
import { CreateLocationInputSchema, createUserLocation } from "./locations";

export const RegisterInputSchema = z.object({
  name: z.string().trim().max(120).optional(),
  username: z.string().trim().min(3).max(24),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(200),
  location: CreateLocationInputSchema.optional(),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export type RegisterResult =
  | {
      ok: true;
      user: { id: string; email: string; name: string | null; username: string | null };
    }
  | { ok: false; status: 400 | 409; error: string };

/**
 * Self-registration: validates input, enforces email/username uniqueness,
 * hashes the password (never stored in plaintext), assigns the default role,
 * and optionally creates a first UserLocation if address fields were given.
 * Mirrors the OAuth auto-provision path in config.ts (same username
 * generation, same default-role assignment) so both routes into the
 * platform produce equivalent accounts.
 */
export async function registerUser(rawInput: unknown): Promise<RegisterResult> {
  const parsed = RegisterInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const input = parsed.data;

  const normalizedEmail = input.email.toLowerCase().trim();
  const normalizedUsername = slugifyUsername(input.username);
  if (normalizedUsername.length < 3) {
    return { ok: false, status: 400, error: "Username must be at least 3 characters." };
  }

  const [existingEmail, existingUsername] = await Promise.all([
    prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } }),
    prisma.user.findUnique({ where: { username: normalizedUsername }, select: { id: true } }),
  ]);

  if (existingEmail) {
    return { ok: false, status: 409, error: "An account with this email already exists." };
  }
  if (existingUsername) {
    return { ok: false, status: 409, error: "This username is already taken." };
  }

  const hashedPassword = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      name: input.name?.trim() || null,
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
    },
    select: { id: true, email: true, name: true, username: true },
  });

  await ensureDefaultRole(user.id);

  // Only create a location if at least one actual address field was filled
  // in — `type`/`source`/`isPrimary` always carry zod defaults, so checking
  // those alone would create an empty row on every signup.
  const hasAddressContent = [
    input.location?.formatted,
    input.location?.street1,
    input.location?.city,
    input.location?.state,
    input.location?.postalCode,
    input.location?.country,
  ].some((v) => v !== undefined && v !== "");

  if (input.location && hasAddressContent) {
    try {
      await createUserLocation(user.id, { ...input.location, isPrimary: true });
    } catch (error) {
      // Don't fail registration if the address couldn't be saved — it can
      // always be added later from the profile page.
      console.error("[register] failed to create initial location:", error);
    }
  }

  return { ok: true, user };
}
