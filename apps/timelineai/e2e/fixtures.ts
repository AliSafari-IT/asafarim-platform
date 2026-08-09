import type { BrowserContext } from "@playwright/test";

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL || "http://localhost:3001";

/**
 * Signs in through Hub's real credentials provider (the actual SSO flow —
 * not a mock) and leaves the session cookie in `context`'s cookie jar, so
 * subsequent `page.goto()` calls against TimelineAI are authenticated.
 * Requires SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD-seeded user (see
 * packages/db/prisma/seed.ts) to exist in the target database — these
 * suites are meant to run against a locally seeded dev DB, same as every
 * other manual verification this app has been checked against.
 */
export async function signInViaHub(
  context: BrowserContext,
  email: string = process.env.SEED_ADMIN_EMAIL || "admin@asafarim.com",
  password: string = process.env.SEED_ADMIN_PASSWORD || ""
): Promise<void> {
  if (!password) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is not set — e2e tests that require sign-in need it (see .env.local)."
    );
  }

  const csrfRes = await context.request.get(`${HUB_URL}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  await context.request.post(`${HUB_URL}/api/auth/callback/credentials`, {
    form: {
      csrfToken,
      email,
      password,
      callbackUrl: `${HUB_URL}/`,
      json: "true",
    },
  });
}
