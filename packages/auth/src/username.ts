import { prisma } from "@asafarim/db";

/** Lowercase, ASCII-only, underscore-separated, capped at 24 chars. */
export function slugifyUsername(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
}

/**
 * Derive a unique username from a seed (name or email local-part), appending
 * a numeric suffix on collision. Shared by OAuth auto-provisioning
 * (config.ts) and self-registration (register.ts) so both produce usernames
 * the same way.
 */
export async function generateUniqueUsername(seed: string): Promise<string> {
  const base = slugifyUsername(seed) || "user";
  let candidate = base;
  let counter = 1;

  while (true) {
    const existing = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    counter += 1;
    candidate = `${base.slice(0, Math.max(1, 24 - String(counter).length - 1))}_${counter}`;
  }
}
