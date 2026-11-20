import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";

/**
 * The off-scope warning on /tailor: a job the fit check rates low shows a
 * warning with what matches and what doesn't, and the tailoring options stay
 * hidden until the candidate says "yes". A matching job shows no warning.
 * Uses the paste intake and the fixture AI provider: no real AI call.
 */

const PROFILE = {
  headline: "Full-stack developer · React · TypeScript · ASP.NET Core",
  summary:
    "Full-stack developer building web applications with React, TypeScript, Node.js and ASP.NET Core. Background in engineering hydrology and scientific software. Writes end-to-end tests with Playwright.",
  skills: ["React", "TypeScript", "Node.js", "ASP.NET Core", "PostgreSQL", "Playwright", "Docker"].map((name) => ({ name })),
  experience: [
    {
      title: "Full-stack developer",
      employer: "Example Software",
      summary: "End-to-end testing of web platforms with Playwright; develops features in React and Node.js.",
    },
    {
      title: "Scientific software developer",
      employer: "Example University",
      summary: "Built hydrological models and data pipelines; analysed rainfall and river discharge data.",
    },
  ],
};

const NURSE_JOB = `Verpleegkundige ziekenhuis – afdeling geriatrie
Als verpleegkundige sta je in voor de zorg van patiënten op de afdeling geriatrie.
Je dient medicatie toe, volgt de patiënten op, verzorgt wonden en werkt nauw samen met artsen.
Vereisten: bachelor verpleegkunde, erkenning als verpleegkundige, ervaring in de zorg voor ouderen.
Je werkt in een ploegensysteem, ook in het weekend en 's nachts. Patiëntenzorg en empathie staan centraal.`;

const REACT_JOB = `Senior Frontend Developer (React / TypeScript)
We are looking for a frontend developer to build our React applications.
You write TypeScript every day, use Node.js tooling, and test with Playwright.
Requirements: 4+ years React, TypeScript, REST APIs, Docker, CI/CD pipelines.
Nice to have: PostgreSQL, ASP.NET Core. You develop new features for our web applications.`;

async function seedConfirmedProfile() {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await prisma.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  const profile = await prisma.candidateProfile.create({ data: { workspaceId: workspace.id } });
  const version = await prisma.candidateProfileVersion.create({
    data: {
      profileId: profile.id,
      versionNumber: 1,
      origin: "MANUAL",
      extractorName: "manual",
      extractorVersion: "1",
      content: PROFILE,
    },
  });
  await prisma.candidateProfile.update({ where: { id: profile.id }, data: { confirmedVersionId: version.id } });
}

async function pasteJob(page: import("@playwright/test").Page, text: string) {
  await page.goto("/tailor");
  await page.getByRole("button", { name: "Paste the description instead" }).filter({ visible: true }).click();
  await page.getByPlaceholder("Paste the full job description here…").filter({ visible: true }).fill(text);
  await page.getByRole("button", { name: "Use this text" }).filter({ visible: true }).click();
}

test.beforeEach(async () => {
  await seedConfirmedProfile();
});

test("an off-scope job asks first, and only yes reveals the tailoring options", async ({ page }) => {
  await pasteJob(page, NURSE_JOB);

  const warning = page.locator(".rm-fit--low").filter({ visible: true });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("This job looks outside your scope");
  await expect(warning).toContainText("Do you really want to apply for this job?");
  await expect(warning.locator(".rx-pill--warm").first()).toBeVisible();
  const start = page.getByRole("button", { name: "Tailor my CV to this job" }).filter({ visible: true });
  await expect(start).toHaveCount(0);

  await warning.getByRole("button", { name: "Yes, tailor my CV anyway" }).click();
  await expect(page.locator(".rm-fit").filter({ visible: true })).toContainText("You chose to apply");
  await expect(start).toBeVisible();

  await start.click();
  await expect(page.locator(".rm-review").filter({ visible: true })).toBeVisible({ timeout: 30_000 });
});

test("no takes the candidate back to picking a job", async ({ page }) => {
  await pasteJob(page, NURSE_JOB);
  const warning = page.locator(".rm-fit--low").filter({ visible: true });
  await warning.getByRole("button", { name: "No, pick another job" }).click();
  await expect(warning).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tailor my CV to this job" }).filter({ visible: true })).toHaveCount(0);
});

test("a matching job shows no warning", async ({ page }) => {
  await pasteJob(page, REACT_JOB);
  await expect(page.getByRole("button", { name: "Tailor my CV to this job" }).filter({ visible: true })).toBeVisible();
  await expect(page.locator(".rm-fit--quiet").filter({ visible: true })).toContainText("fit:");
  await expect(page.locator(".rm-fit--low")).toHaveCount(0);
});
