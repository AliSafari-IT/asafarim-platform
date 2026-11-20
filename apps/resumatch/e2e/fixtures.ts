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

export interface BulkApplication {
  title: string;
  employer: string;
  status: SeedApplication["status"];
  followUpDate: Date | null;
}

/** Like seedApplications, for hundreds of rows: one createMany per table,
 *  and every application shares one createdAt, so pagination has to rely
 *  on its id tie-breaker (issue #897). */
export async function seedManyApplications(applications: BulkApplication[], createdAt = new Date("2026-11-01T10:00:00Z")) {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await prisma.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  const ids = applications.map((_, index) => `e2e-bulk-${String(index).padStart(4, "0")}`);
  await prisma.targetJob.createMany({
    data: applications.map((app, index) => ({
      id: ids[index],
      workspaceId: workspace.id,
      sourceUrl: `https://jobs.example.test/${ids[index]}`,
      title: app.title,
      employer: app.employer,
      status: "FETCHED" as const,
    })),
  });
  await prisma.application.createMany({
    data: applications.map((app, index) => ({
      id: ids[index],
      workspaceId: workspace.id,
      targetJobId: ids[index],
      status: app.status,
      followUpDate: app.followUpDate,
      createdAt,
    })),
  });
  return workspace;
}

export const E2E_LINKS = [
  { kind: "linkedin", label: null, url: "https://www.linkedin.com/in/jordan-example/" },
  { kind: "github", label: null, url: "https://github.com/jordan-example" },
  { kind: "website", label: null, url: "https://jordan.example.test" },
  { kind: "product", label: "Example Tracker", url: "https://tracker.example.test" },
];

/** A long, multi-page tailored CV (with links and languages) and the
 *  cover letter paired with it. */
export async function seedTailoredResume(id: string, letterId: string) {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await prisma.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  const profile = await prisma.candidateProfile.create({ data: { workspaceId: workspace.id } });
  const version = await prisma.candidateProfileVersion.create({
    data: {
      profileId: profile.id,
      origin: "MANUAL",
      versionNumber: 1,
      extractorName: "manual",
      extractorVersion: "1",
      content: {
        contractVersion: "1.0.0",
        fullName: "Jordan Example",
        email: "jordan@example.test",
        phone: "+32 470 00 00 00",
        baseLocation: "Genk, Belgium",
        links: E2E_LINKS,
      },
    },
  });
  const job = await prisma.targetJob.create({
    data: {
      workspaceId: workspace.id,
      sourceUrl: "https://jobs.example.test/software-developer",
      rawText: "job",
      title: "Software Developer",
      employer: "Example Audio",
      status: "FETCHED",
    },
  });
  const bullet =
    "Built and ran production web applications end to end, from the API and data layer to the deployment pipeline, and documented each system for the team.";
  await prisma.tailoredResume.create({
    data: {
      id,
      workspaceId: workspace.id,
      profileVersionId: version.id,
      targetJobId: job.id,
      templateKey: "classic",
      promptVersion: "e2e",
      modelVersion: "e2e",
      outputLanguage: "en",
      content: {
        contractVersion: "1.0.0",
        fullName: "Jordan Example",
        email: "jordan@example.test",
        phone: "+32 470 00 00 00",
        location: "Genk, Belgium",
        links: E2E_LINKS,
        headline: "Full-Stack Developer",
        summary: "Full-stack developer who builds and runs production web applications. ".repeat(4).trim(),
        skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker", "Playwright"],
        experience: Array.from({ length: 7 }, (_, index) => ({
          title: `Software Developer ${index + 1}`,
          employer: `Example Company ${index + 1}`,
          startedOn: `${2012 + index * 2}-01`,
          endedOn: `${2013 + index * 2}-12`,
          isCurrent: false,
          bullets: [bullet, bullet, bullet],
        })),
        education: [{ qualification: "MSc Computer Science", institution: "Example University", completedOn: "2011" }],
        certifications: [],
        languages: [
          { code: "en", label: "English", proficiency: "professional" },
          { code: "nl", label: "Dutch", proficiency: "native" },
        ],
      },
    },
  });
  await prisma.coverLetter.create({
    data: {
      id: letterId,
      workspaceId: workspace.id,
      profileVersionId: version.id,
      targetJobId: job.id,
      tailoredResumeId: id,
      promptVersion: "cover_letter@4",
      modelVersion: "e2e",
      outputLanguage: "en",
      createdAt: new Date("2026-11-20T10:00:00Z"),
      content: {
        contractVersion: "1.0.0",
        greeting: "Dear Hiring Manager,",
        paragraphs: ["I would like to apply for the Software Developer role."],
        signOff: "Sincerely,",
        fullName: "Jordan Example",
      },
    },
  });
}

/** One confirmed profile, one job typed in by hand (with a contact person)
 *  and one cover letter per entry of `letters`, keyed by id. */
export async function seedCoverLetters(letters: { id: string; paragraphs: string[] }[]) {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await prisma.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  const profile = await prisma.candidateProfile.create({ data: { workspaceId: workspace.id } });
  const version = await prisma.candidateProfileVersion.create({
    data: {
      profileId: profile.id,
      origin: "MANUAL",
      versionNumber: 1,
      extractorName: "manual",
      extractorVersion: "1",
      content: {
        contractVersion: "1.0.0",
        fullName: "Jordan Example",
        email: "jordan@example.test",
        phone: "+32 470 00 00 00",
        baseLocation: "Genk, Belgium",
      },
    },
  });
  const job = await prisma.targetJob.create({
    data: {
      workspaceId: workspace.id,
      sourceUrl: "https://jobs.example.test/solutions-engineer",
      rawText: "job",
      title: "Solutions Engineer",
      employer: "Example Audio",
      status: "FETCHED",
      structuredFields: { contactName: "Ms. Example", location: "Brussels, Belgium" },
    },
  });
  for (const letter of letters) {
    await prisma.coverLetter.create({
      data: {
        id: letter.id,
        workspaceId: workspace.id,
        profileVersionId: version.id,
        targetJobId: job.id,
        promptVersion: "cover_letter@4",
        modelVersion: "e2e",
        outputLanguage: "en",
        createdAt: new Date("2026-11-20T10:00:00Z"),
        content: {
          contractVersion: "1.0.0",
          greeting: "Dear Ms. Example,",
          paragraphs: letter.paragraphs,
          signOff: "Sincerely,",
          fullName: "Jordan Example",
        },
      },
    });
  }
}
