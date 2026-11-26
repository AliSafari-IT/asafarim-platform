import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";

/**
 * #964: claim warnings as an actionable review, on desktop and phone.
 * Only the unsupported words are highlighted; each opens a card with what
 * could not be traced, why, the profile evidence and what to do. The
 * summary counts what is left and jumps to it; an edit is checked again
 * before it counts as fixed; a confirmed claim is kept on this CV as the
 * candidate's own, apart from the profile, which is never changed.
 *
 * Fixture AI provider (no real AI call): it copies each role's sentences
 * as bullets citing that role. The profile summary denies Kubernetes while
 * a role mentions it, so those bullets claim a requirement in conflict,
 * which the check flags on the word "Kubernetes".
 */

const JOB_TEXT = `Senior Platform Engineer
We run web shops for small retailers.
Requirements:
- Experience with React and TypeScript
- Experience with Kubernetes in production
- Knowledge of GraphQL`;

const PROFILE = {
  fullName: "Jordan Example",
  headline: "Full-stack developer · React · TypeScript",
  // Denied here, claimed by a role below: a conflict the CV must not claim.
  summary: "Full-stack developer building web applications with React and TypeScript. No Kubernetes experience.",
  skills: ["React", "TypeScript", "Node.js", "Playwright"].map((name) => ({ name })),
  experience: [
    {
      title: "Full-stack developer",
      employer: "Example Software",
      summary:
        "Develops features in React and TypeScript. Deployed the web shops on Kubernetes with weekly releases. Ran Kubernetes upgrades for the shop clusters.",
    },
    { title: "Support engineer", employer: "Helpdesk Example", summary: "Answered customer tickets. Kept the internal FAQ up to date." },
  ],
};

let workspaceId = "";
test.beforeEach(async () => {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await prisma.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  const profile = await prisma.candidateProfile.create({ data: { workspaceId: workspace.id } });
  const version = await prisma.candidateProfileVersion.create({
    data: { profileId: profile.id, versionNumber: 1, origin: "MANUAL", extractorName: "manual", extractorVersion: "1", content: PROFILE },
  });
  await prisma.candidateProfile.update({ where: { id: profile.id }, data: { confirmedVersionId: version.id } });
  workspaceId = workspace.id;
});

test("highlights the exact words, explains them, and resolves them by edit, confirmation and gap choices", async ({ page }, testInfo) => {
  await page.goto("/tailor");
  await page.getByRole("button", { name: "Paste the description instead" }).click();
  await page.getByPlaceholder("Paste the full job description here…").fill(JOB_TEXT);
  await page.getByRole("button", { name: "Use this text" }).click();
  const panel = page.getByTestId("fit-assessment");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Tailor my CV to this job" }).click();
  await expect(page.locator(".rm-review")).toBeVisible({ timeout: 30_000 });

  // A clickable summary instead of the generic banner.
  const summary = page.getByTestId("claims-summary");
  await expect(summary).toContainText("2 suggestion(s) need review");
  await expect(summary).toContainText("job requirement(s) not found in your profile");

  // Only "Kubernetes" is highlighted; the rest stays plain text.
  const marks = page.getByTestId("claim-mark");
  await expect(marks).toHaveCount(2);
  await expect(marks.first()).toHaveText("Kubernetes");
  const deployed = page.locator("[data-bullet-key]").filter({ hasText: "Deployed the web shops" });
  await expect(deployed.getByTestId("claim-text")).toHaveText("Deployed the web shops on Kubernetes with weekly releases.");
  // Left out by default, with a badge instead of a strike-through.
  await expect(deployed.getByTestId("bullet-excluded")).toHaveText("Excluded from CV");
  await expect(deployed.getByRole("checkbox")).not.toBeChecked();
  expect(await deployed.getByTestId("claim-text").evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe("none");

  // "Review next" focuses the first highlight and opens its card.
  await page.getByTestId("claims-review-next").click();
  await expect(marks.first()).toBeFocused();
  const card = page.getByTestId("claim-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Needs review · Experience at Example Software");
  await expect(card).toContainText("“Kubernetes”");
  await expect(card.getByTestId("claim-why")).toContainText("Your profile both mentions and denies “Experience with Kubernetes in production”");
  await testInfo.attach("card", { body: await page.locator(".rm-review").screenshot(), contentType: "image/png" });

  // Edit claim: the text box opens on the flagged words, the edit is
  // checked again, and the fixed bullet is ticked back in.
  await card.getByTestId("claim-edit").click();
  const box = deployed.locator("textarea");
  await expect(box).toBeFocused();
  expect(await box.evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd))).toBe("Kubernetes");
  await box.fill("Deployed the web shops with weekly releases.");
  await deployed.getByRole("button", { name: "Done editing" }).click();
  await expect(summary).toContainText("1 suggestion(s) need review");
  await expect(deployed.getByRole("checkbox")).toBeChecked();
  await expect(deployed.getByTestId("bullet-excluded")).toHaveCount(0);

  // "Show only items needing review" hides the rest.
  const faq = page.locator("[data-bullet-key]").filter({ hasText: "Kept the internal FAQ" });
  await expect(faq).toBeVisible();
  await page.getByTestId("claims-only-flagged").check();
  await expect(faq).toBeHidden();
  await expect(page.locator("[data-bullet-key]").filter({ hasText: "Ran Kubernetes upgrades" })).toBeVisible();
  await page.getByTestId("claims-only-flagged").uncheck();

  // Confirm with details: kept as the candidate's own, apart from the profile.
  await page.getByTestId("claims-review-next").click();
  await expect(card).toContainText("“Kubernetes”");
  await expect(card).toContainText("Do you have this: “Experience with Kubernetes in production”?");
  await card.getByTestId("claim-confirm").click();
  await card.getByLabel(/Add a detail in your own words/).fill("I ran the cluster upgrades before the team moved off Kubernetes.");
  await card.getByTestId("claim-confirm-save").click();
  await expect(card).toContainText("Confirmed by you · Experience at Example Software");
  await expect(card).toContainText("not as something your profile backs");
  await expect(page.locator("[data-bullet-key]").filter({ hasText: "Ran Kubernetes upgrades" }).getByRole("checkbox")).toBeChecked();
  await expect(summary).not.toContainText("suggestion(s) need review");

  // A missing requirement is a gap: left out, it stops counting.
  const gaps = page.getByTestId("claim-gap");
  const before = await gaps.count();
  await gaps.filter({ hasText: "GraphQL" }).getByTestId("claim-gap-leave").click();
  await expect(gaps.filter({ hasText: "GraphQL" })).toContainText("Left out of this CV.");
  await expect(summary).toContainText(`${before - 1} job requirement(s) not found in your profile`);

  // Before saving: what is kept as confirmed.
  await expect(page.getByTestId("claims-save-impact")).toContainText("1 claim(s) you confirmed are kept as your own.");
  await testInfo.attach("before-save", { body: await page.locator(".rm-review").screenshot(), contentType: "image/png" });

  await page.getByRole("button", { name: "Confirm & save" }).click();
  await page.waitForURL(/\/tailor\/[^/]+\/preview/, { timeout: 30_000 });
  const saved = await e2eDb().tailoredResume.findFirstOrThrow({ where: { workspaceId } });
  expect((saved.candidateEdits as { confirmedClaims: unknown[] }).confirmedClaims).toEqual([
    {
      where: "bullet",
      title: "Full-stack developer",
      employer: "Example Software",
      startedOn: null,
      claim: "Kubernetes",
      reason: "requirement_unmet",
      detail: "I ran the cluster upgrades before the team moved off Kubernetes.",
    },
  ]);
  const bullets = (saved.content as { experience: { bullets: string[] }[] }).experience[0]!.bullets;
  expect(bullets).toContain("Deployed the web shops with weekly releases.");
  expect(bullets).toContain("Ran Kubernetes upgrades for the shop clusters.");
  // The profile is never changed by a confirmation.
  expect(await e2eDb().candidateProfileVersion.count({ where: { profile: { workspaceId } } })).toBe(1);
});

test("an unresolved flagged bullet is listed as left out before saving, and stays off the CV", async ({ page }) => {
  await page.goto("/tailor");
  await page.getByRole("button", { name: "Paste the description instead" }).click();
  await page.getByPlaceholder("Paste the full job description here…").fill(JOB_TEXT);
  await page.getByRole("button", { name: "Use this text" }).click();
  const panel = page.getByTestId("fit-assessment");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Tailor my CV to this job" }).click();
  await expect(page.locator(".rm-review")).toBeVisible({ timeout: 30_000 });

  const impact = page.getByTestId("claims-save-impact");
  await expect(impact).toContainText("Left out of the CV:");
  await expect(impact).toContainText("Deployed the web shops on Kubernetes with weekly releases.");
  await expect(impact).toContainText("Ran Kubernetes upgrades for the shop clusters.");

  // Exclude claim from the card: resolved, still off the CV.
  await page.getByTestId("claim-mark").first().click();
  await page.getByTestId("claim-card").getByTestId("claim-exclude").click();
  await expect(page.getByTestId("claims-summary")).toContainText("1 suggestion(s) need review");

  await page.getByRole("button", { name: "Confirm & save" }).click();
  await page.waitForURL(/\/tailor\/[^/]+\/preview/, { timeout: 30_000 });
  const saved = await e2eDb().tailoredResume.findFirstOrThrow({ where: { workspaceId } });
  const bullets = (saved.content as { experience: { bullets: string[] }[] }).experience[0]!.bullets;
  expect(bullets.join(" ")).not.toContain("Kubernetes");
});

const shots = process.env.CLAIM_REVIEW_SHOTS;
const axePath = process.env.AXE_CORE_PATH;

test("screenshots and contrast of the claim review", async ({ page }, testInfo) => {
  test.skip(!shots && !axePath, "set CLAIM_REVIEW_SHOTS=<dir> and/or AXE_CORE_PATH=<axe.min.js>");
  await page.goto("/tailor");
  await page.getByRole("button", { name: "Paste the description instead" }).click();
  await page.getByPlaceholder("Paste the full job description here…").fill(JOB_TEXT);
  await page.getByRole("button", { name: "Use this text" }).click();
  await expect(page.getByTestId("fit-assessment")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Tailor my CV to this job" }).click();
  await expect(page.locator(".rm-review")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("claims-review-next").click();
  await expect(page.getByTestId("claim-card")).toBeVisible();
  const project = testInfo.project.name.replace(/\s+/g, "-");
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    await page.mouse.move(0, 0);
    if (shots) {
      await page.getByTestId("claims-summary").screenshot({ path: `${shots}/summary-${project}-${theme}.png` });
      const entry = page.locator(".rm-entry").first();
      await entry.screenshot({ path: `${shots}/card-${project}-${theme}.png` });
      await page.getByTestId("claim-gaps").screenshot({ path: `${shots}/gaps-${project}-${theme}.png` });
      await page.getByTestId("claims-save-impact").screenshot({ path: `${shots}/before-save-${project}-${theme}.png` });
    }
    if (axePath) {
      await page.addScriptTag({ path: axePath });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
        const result = await axe.run(
          { include: [".rm-claim-summary", ".rm-claim-card", ".rm-claim-text", ".rm-claim-gaps", ".rm-claim-impact", ".rm-claim-badge"] },
          { runOnly: ["wcag2a", "wcag2aa"] },
        );
        return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
      });
      expect(violations, theme).toEqual([]);
    }
  }
});
