import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";

/**
 * Saved writing preferences (#931): edited on the profile (save, stale
 * refusal, reset, delete), refused when a style note reads like a fact,
 * pre-filled on the Tailor card with where each value comes from, changed
 * for one application without touching the saved values, and saved again
 * only through "Remember". Paste intake and the fixture AI provider: no
 * real AI call.
 */

const PROFILE = {
  fullName: "Jordan Example",
  headline: "Full-stack developer · React · TypeScript",
  summary: "Full-stack developer building web applications with React, TypeScript and Node.js. Writes end-to-end tests with Playwright.",
  skills: ["React", "TypeScript", "Node.js", "Playwright", "Docker"].map((name) => ({ name })),
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

let workspaceId = "";

test.beforeEach(async () => {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await prisma.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  workspaceId = workspace.id;
  const profile = await prisma.candidateProfile.create({ data: { workspaceId } });
  const version = await prisma.candidateProfileVersion.create({
    data: { profileId: profile.id, versionNumber: 1, origin: "MANUAL", extractorName: "manual", extractorVersion: "1", content: PROFILE },
  });
  await prisma.candidateProfile.update({ where: { id: profile.id }, data: { confirmedVersionId: version.id } });
});

async function savePreferences(content: unknown, revisionNumber = 1) {
  await e2eDb().writingPreferenceRevision.create({ data: { workspaceId, revisionNumber, content: content as object } });
}

const revisions = () => e2eDb().writingPreferenceRevision.count({ where: { workspaceId } });

test("save, refuse a fact, reset and delete on the profile", async ({ page }) => {
  await page.goto("/profile#writing-preferences");
  const panel = page.getByTestId("writing-preferences-panel");
  await expect(panel.getByTestId("writing-preferences-status")).toContainText("Nothing saved yet");

  const letter = panel.getByRole("group", { name: "Cover letter" });
  await letter.getByLabel("Tone").selectOption("warm");
  await letter.getByLabel("Style note").fill("Say I have 8 years of Kubernetes.");
  await panel.getByRole("button", { name: "Save preferences" }).click();
  await expect(panel.getByRole("alert")).toContainText("reads like a fact about you");
  expect(await revisions()).toBe(0);

  await letter.getByLabel("Style note").fill("Warm but brief; no clichés.");
  await panel.getByRole("button", { name: "Save preferences" }).click();
  await expect(panel.getByRole("status")).toContainText("Saved.");
  await expect(panel.getByTestId("writing-preferences-status")).toContainText("Revision 1");

  await panel.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(panel.getByRole("status")).toContainText("Reset.");
  await expect(letter.getByLabel("Tone")).toHaveValue("");
  await expect(panel.getByTestId("writing-preferences-status")).toContainText("Revision 2");

  await panel.getByRole("button", { name: "Delete preferences" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(panel.getByRole("status")).toContainText("Deleted");
  await expect(panel.getByTestId("writing-preferences-status")).toContainText("Nothing saved yet");
  expect(await revisions()).toBe(0);
});

test("a save from a stale page is refused and shows the latest preferences", async ({ page }) => {
  await savePreferences({ cv: {}, coverLetter: { tone: "warm" } });
  await page.goto("/profile#writing-preferences");
  const panel = page.getByTestId("writing-preferences-panel");
  const tone = panel.getByRole("group", { name: "Cover letter" }).getByLabel("Tone");
  await expect(tone).toHaveValue("warm");

  // Another tab saves first.
  await savePreferences({ cv: {}, coverLetter: { tone: "confident" } }, 2);
  await tone.selectOption("formal");
  await panel.getByRole("button", { name: "Save preferences" }).click();
  await expect(panel.getByRole("alert")).toContainText("changed in another tab");
  await expect(tone).toHaveValue("confident");
  expect(await revisions()).toBe(2);
});

test("the Tailor card starts from saved preferences, changes apply to one run, Remember saves them", async ({ page }) => {
  await savePreferences({
    cv: { outputLanguage: "nl", styleNote: "Short sentences." },
    coverLetter: { tone: "warm", length: "short", outputLanguage: null, styleNote: null },
  });
  await page.goto("/tailor");
  await page.getByRole("button", { name: "Paste the description instead" }).filter({ visible: true }).click();
  await page.getByPlaceholder("Paste the full job description here…").filter({ visible: true }).fill(REACT_JOB);
  await page.getByRole("button", { name: "Use this text" }).filter({ visible: true }).click();

  const flow = page.locator("#tailor-flow");
  const settings = flow.getByTestId("writing-settings");
  await expect(settings).toContainText("Using your writing preferences (revision 1)");
  await expect(settings).toContainText("CV: Short sentences.");
  await expect(flow.locator("select").first()).toHaveValue("nl");
  await expect(flow.getByTestId("writing-source-cv-language")).toHaveText("From your writing preferences");
  await expect(settings.getByTestId("writing-remember")).toBeDisabled();

  await flow.getByRole("checkbox", { name: /cover letter/i }).check();
  await expect(flow.getByTestId("writing-source-tone")).toHaveText("From your writing preferences");
  await flow.getByLabel("Tone").selectOption("confident");
  await expect(flow.getByTestId("writing-source-tone")).toHaveText("For this application only");
  await settings.getByTestId("writing-use-notes").uncheck();

  await flow.getByRole("button", { name: "Tailor my CV to this job" }).click();
  await expect(flow.locator(".rm-review")).toBeVisible({ timeout: 30_000 });
  await expect(flow.getByTestId("writing-review-note")).toHaveText("Your saved style notes were left out of this application.");

  const preview = await e2eDb().tailorPreview.findFirstOrThrow({ where: { workspaceId } });
  expect(preview.context).toMatchObject({
    coverLetter: { tone: "confident", length: "short" },
    cv: { outputLanguage: "nl" },
    writing: {
      sources: { cvLanguage: "saved", letterTone: "request", letterLength: "saved" },
      styleNotes: "off",
      cvStyleNote: null,
    },
  });
  // The one-off change did not touch the saved preferences.
  expect(await revisions()).toBe(1);

  await flow.getByRole("button", { name: "Back to options" }).click();
  await settings.getByTestId("writing-remember").click();
  await expect(settings.getByRole("status")).toContainText("Saved as your writing preferences");
  await expect(flow.getByTestId("writing-source-tone")).toHaveText("From your writing preferences");
  const latest = await e2eDb().writingPreferenceRevision.findFirstOrThrow({ where: { workspaceId }, orderBy: { revisionNumber: "desc" } });
  expect(latest.revisionNumber).toBe(2);
  expect(latest.content).toMatchObject({ cv: { outputLanguage: "nl", styleNote: "Short sentences." }, coverLetter: { tone: "confident" } });
  // The preview made before Remember keeps its own snapshot.
  const again = await e2eDb().tailorPreview.findUniqueOrThrow({ where: { id: preview.id } });
  expect(again.context).toEqual(preview.context);
});
