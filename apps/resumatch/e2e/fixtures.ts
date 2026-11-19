import { test as base, expect, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/db/generated/index.js";

/**
 * Synthetic data and a session for the browser suite. Everything here is
 * made up: one workspace for a fake platform user, a handful of target
 * jobs typed in by hand, no CV, no AI call.
 */

export const E2E_PLATFORM_USER_ID = "e2e-resumatch-user";
const COOKIE_NAME = "authjs.session-token";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set for the ResuMatch e2e suite (see playwright.config.ts).`);
  return value;
}

let db: PrismaClient | null = null;
export function e2eDb(): PrismaClient {
  db ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: requireEnv("RESUMATCH_DATABASE_URL") }) });
  return db;
}

export interface SeedApplication {
  id: string;
  title: string;
  status: "SAVED" | "APPLIED" | "INTERVIEWING" | "OFFER" | "REJECTED";
  /** Stored value, as the column holds it. */
  followUpDate: Date | null;
}

/** Deletes the suite's workspace (cascading to its rows) and creates it
 *  again with exactly these applications, newest first in the list. */
export async function seedApplications(applications: SeedApplication[]) {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await prisma.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  const now = Date.now();
  for (const [index, app] of applications.entries()) {
    const job = await prisma.targetJob.create({
      data: {
        workspaceId: workspace.id,
        sourceUrl: `https://jobs.example.test/${app.id}`,
        title: app.title,
        employer: "Example Employer",
        status: "FETCHED",
      },
    });
    await prisma.application.create({
      data: {
        id: app.id,
        workspaceId: workspace.id,
        targetJobId: job.id,
        status: app.status,
        followUpDate: app.followUpDate,
        // Oldest first in the input = bottom of the list.
        createdAt: new Date(now - (applications.length - index) * 60_000),
      },
    });
  }
  return workspace;
}

export async function storedFollowUp(id: string): Promise<string | null> {
  const row = await e2eDb().application.findUniqueOrThrow({ where: { id } });
  return row.followUpDate ? row.followUpDate.toISOString() : null;
}

async function sessionCookie(): Promise<string> {
  return encode({
    token: { sub: E2E_PLATFORM_USER_ID, isActive: true, roles: [] },
    secret: requireEnv("AUTH_SECRET"),
    salt: COOKIE_NAME,
  });
}

/** The card for one application, by its job title. Ignores the hidden
 *  second copy Next can keep in the DOM during development streaming. */
export function applicationCard(page: Page, title: string) {
  return page.locator(".ui-card").filter({ hasText: title }).filter({ visible: true }).first();
}

export const test = base.extend<{ signedIn: void }>({
  signedIn: [
    async ({ context, baseURL }, use) => {
      const url = new URL(baseURL ?? "http://localhost:3012");
      await context.addCookies([{ name: COOKIE_NAME, value: await sessionCookie(), domain: url.hostname, path: "/" }]);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
