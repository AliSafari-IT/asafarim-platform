import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";

/**
 * Issue #756: the AI budget on /tailor, and why tailoring fell back. The
 * line says this month's spend against the candidate's ceiling and when it
 * resets; with their own budget used up (a per-workspace override of 0),
 * the review says so, with the date, instead of "budget or provider issue".
 * Fixture AI provider: no real AI call. The service-wide ceiling is covered
 * by unit and integration tests, since it is a server env/admin setting.
 */

const PROFILE = {
  headline: "Full-stack developer · React · TypeScript",
  summary: "Full-stack developer building web applications with React, TypeScript and Node.js. Writes end-to-end tests with Playwright.",
  skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "Playwright", "Docker"].map((name) => ({ name })),
  experience: [
    {
      title: "Full-stack developer",
      employer: "Example Software",
      summary: "End-to-end testing of web platforms with Playwright; develops features in React and Node.js.",
    },
  ],
};

const REACT_JOB = `Senior Frontend Developer (React / TypeScript)
We are looking for a frontend developer to build our React applications.
You write TypeScript every day, use Node.js tooling, and test with Playwright.
Requirements: 4+ years React, TypeScript, REST APIs, Docker, CI/CD pipelines.
Nice to have: PostgreSQL. You develop new features for our web applications.`;

async function seed(budgetOverrideUsd: number | null) {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await prisma.workspace.create({
    data: { platformUserId: E2E_PLATFORM_USER_ID, aiMonthlyBudgetUsd: budgetOverrideUsd },
  });
  const profile = await prisma.candidateProfile.create({ data: { workspaceId: workspace.id } });
  const version = await prisma.candidateProfileVersion.create({
    data: { profileId: profile.id, versionNumber: 1, origin: "MANUAL", extractorName: "manual", extractorVersion: "1", content: PROFILE },
  });
  await prisma.candidateProfile.update({ where: { id: profile.id }, data: { confirmedVersionId: version.id } });
  return workspace.id;
}

function resetDate(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(next);
}

test("/tailor shows this month's AI spend, the ceiling and the reset date", async ({ page }) => {
  await seed(null);
  await page.goto("/tailor");
  const line = page.getByTestId("tailor-budget-line").filter({ visible: true });
  await expect(line).toContainText(`AI this month: $0.00 of $20.00. Resets on ${resetDate()}.`);
  await expect(line.getByRole("link", { name: "AI usage details" })).toHaveAttribute("href", "/ai-usage");
  await expect(line.getByRole("status")).toHaveCount(0);
});

test("with the candidate's own budget used up, the line and the review say so, with the reset date", async ({ page }) => {
  const workspaceId = await seed(0);
  await page.goto("/tailor");
  const line = page.getByTestId("tailor-budget-line").filter({ visible: true });
  await expect(line.getByRole("status")).toHaveText(`Your monthly AI budget is used up. AI steps pause until ${resetDate()}.`);

  await page.getByRole("button", { name: "Paste the description instead" }).filter({ visible: true }).click();
  await page.getByPlaceholder("Paste the full job description here…").filter({ visible: true }).fill(REACT_JOB);
  await page.getByRole("button", { name: "Use this text" }).filter({ visible: true }).click();
  const flow = page.locator("#tailor-flow");
  await flow.getByRole("checkbox", { name: /cover letter/i }).check();
  await flow.getByRole("button", { name: "Tailor my CV to this job" }).click();

  const review = flow.locator(".rm-review");
  await expect(review).toBeVisible({ timeout: 30_000 });
  await expect(review).toContainText(
    `Your monthly AI budget is used up, so this CV wasn't AI-tailored. It resets on ${resetDate()}.`,
  );
  await expect(review).toContainText(`No cover letter was drafted: your monthly AI budget is used up (it resets on ${resetDate()}).`);
  await expect(review).not.toContainText("budget or provider issue");

  // The outcome log says which ceiling refused.
  const outcomes = await e2eDb().aiCallOutcome.findMany({
    where: { workspaceId },
    select: { kind: true, outcome: true, errorCode: true },
  });
  expect(outcomes).toEqual(
    expect.arrayContaining([
      { kind: "tailor", outcome: "budget_refused", errorCode: "budget_workspace" },
      { kind: "cover_letter", outcome: "budget_refused", errorCode: "budget_workspace" },
    ]),
  );
});
