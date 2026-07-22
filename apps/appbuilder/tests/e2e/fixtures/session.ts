import { encode } from "next-auth/jwt";

export interface TestUser {
  id: string;
  username: string;
  name: string;
  email: string;
}

/**
 * Mints a real next-auth v5 JWT session — the exact same encrypted-JWT
 * format `packages/auth`'s JWT-strategy session issues — for a seeded
 * Prisma user, without ever driving Hub's real sign-in UI. This is
 * deliberately not a mock: `getActor()` (lib/auth/session.ts) decrypts this
 * cookie through the identical `@asafarim/auth` config AppBuilder already
 * runs in production, so a test using this cookie exercises the real
 * authorization path end to end — only the *login form* is skipped, the
 * same tradeoff Playwright's own "reuse authenticated state" pattern
 * recommends over UI-driven login in every test.
 *
 * `salt: "authjs.session-token"` matches the dev cookie name in
 * packages/auth/src/config.ts — Auth.js v5 derives the JWT encryption key
 * from `(secret, salt)`, and the running app decrypts using that same
 * cookie name as the salt.
 */
export async function mintSessionCookieValue(user: TestUser): Promise<string> {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET must be set to mint E2E session cookies — check .env.local");
  }

  return encode({
    secret,
    salt: "authjs.session-token",
    token: {
      sub: user.id,
      roles: [],
      username: user.username,
      emailVerified: new Date().toISOString(),
      isActive: true,
      name: user.name,
      picture: null,
    },
  });
}

export interface StorageStateCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax" | "Strict" | "None";
}

export async function buildStorageState(user: TestUser): Promise<{ cookies: StorageStateCookie[]; origins: [] }> {
  const value = await mintSessionCookieValue(user);
  return {
    cookies: [
      {
        name: "authjs.session-token",
        value,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ],
    origins: [],
  };
}
