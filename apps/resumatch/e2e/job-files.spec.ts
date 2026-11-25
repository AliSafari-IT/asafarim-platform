import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * Tailor "Upload files": up to five files read together as one job
 * (lib/tailoring/jobFiles.ts, app/api/tailor/upload-job). The list adds to
 * itself, removes, refuses a sixth file and names the file the server
 * could not read; the job's card and its draft keep the file names.
 * Needs RESUMATCH_SCANNER=insecure-accept-all (set in the e2e workflow).
 * JOB_FILES_SHOTS=<dir> also saves light/dark screenshots.
 */

const shots = process.env.JOB_FILES_SHOTS;

const PROFILE = {
  fullName: "Jordan Example",
  headline: "Full-stack developer · React · TypeScript",
  summary: "Full-stack developer building web applications with React and TypeScript.",
  skills: ["React", "TypeScript", "Node.js", "Playwright"].map((name) => ({ name })),
  experience: [{ title: "Full-stack developer", employer: "Example Software", summary: "Develops features in React and TypeScript." }],
};

const text = (label: string) =>
  `${label}\nWe build web shops for small retailers and need a full-stack developer who loves React.\n` +
  "Requirements:\n- Experience with React and TypeScript\n- Writing end-to-end tests with Playwright\n- Clear written communication";

const file = (name: string, body: string, mimeType = "text/plain") => ({ name, mimeType, buffer: Buffer.from(body) });

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

const flowOf = (page: Page) => page.locator("#tailor-flow").filter({ visible: true });

async function openUpload(page: Page) {
  await page.goto("/tailor");
  const flow = flowOf(page);
  await flow.getByRole("button", { name: "Upload files" }).click();
  return flow;
}

/** A real text PDF, printed by the browser, so the parse worker runs. */
async function vacancyPdf(page: Page): Promise<Buffer> {
  const printer = await page.context().newPage();
  await printer.setContent(`<h1>Senior Full-Stack Developer</h1><p>${text("Vacancy at Example Shops").replace(/\n/g, "<br>")}</p>`);
  const pdf = await printer.pdf({ format: "A4" });
  await printer.close();
  return pdf;
}

test("several files become one job, and the draft keeps their names", async ({ page }) => {
  const flow = await openUpload(page);
  const input = flow.locator('input[type="file"]');
  await expect(input).toHaveAttribute("multiple", "");

  const pdf = await vacancyPdf(page);
  await input.setInputFiles([{ name: "vacancy.pdf", mimeType: "application/pdf", buffer: pdf }, file("company.md", `# Example Shops\n\n${text("About us")}`)]);
  // Picking again adds to the list; the same file twice is listed once.
  await input.setInputFiles([file("company.md", `# Example Shops\n\n${text("About us")}`), file("benefits.json", JSON.stringify({ benefits: text("Benefits") }), "application/json")]);
  const list = flow.getByRole("list", { name: "Files for this job" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(flow.getByTestId("job-files")).toContainText("3 of 5 files");

  await flow.getByRole("button", { name: "Remove benefits.json" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(2);

  await flow.getByRole("button", { name: "Use these 2 files" }).click();
  await expect(flow.getByLabel("Anything you want AI to keep in mind? (optional)")).toBeVisible({ timeout: 30_000 });
  await expect(flow.getByTestId("job-source-files")).toHaveText("Read from 2 files: vacancy.pdf, company.md");

  const job = await e2eDb().targetJob.findFirstOrThrow({ where: { workspaceId }, select: { rawText: true, sourceFiles: true, sourceUrl: true } });
  expect(job.rawText).toContain("=== File 1 of 2: vacancy.pdf ===");
  expect(job.rawText).toContain("Senior Full-Stack Developer");
  expect(job.rawText).toContain("=== File 2 of 2: company.md ===");
  expect(job.sourceUrl).toBe("upload://vacancy.pdf (+1 more)");
  expect((job.sourceFiles as { name: string }[]).map((f) => f.name)).toEqual(["vacancy.pdf", "company.md"]);

  await page.reload();
  await expect(flowOf(page).getByTestId("job-source-files")).toHaveText("Read from 2 files: vacancy.pdf, company.md");
});

test("a sixth file is refused until one is removed", async ({ page }) => {
  const flow = await openUpload(page);
  const input = flow.locator('input[type="file"]');
  await input.setInputFiles(Array.from({ length: 6 }, (_, i) => file(`part-${i + 1}.txt`, text(`Part ${i + 1}`))));
  await expect(flow.getByRole("alert")).toHaveText("That's more than 5 files for one job. Remove 1 to continue.");
  await expect(flow.getByTestId("job-files-submit")).toBeDisabled();

  await flow.getByRole("button", { name: "Remove part-6.txt" }).click();
  await expect(flow.getByRole("alert")).toHaveCount(0);
  await expect(flow.getByRole("button", { name: "Use these 5 files" })).toBeEnabled();
});

test("a file the server can't read is marked, and no job is made until it is removed", async ({ page }) => {
  const flow = await openUpload(page);
  const input = flow.locator('input[type="file"]');
  await input.setInputFiles([file("vacancy.txt", text("Vacancy")), file("note.txt", "See attached.")]);
  await flow.getByRole("button", { name: "Use these 2 files" }).click();

  const bad = flow.getByRole("listitem").filter({ hasText: "note.txt" });
  await expect(bad).toHaveAttribute("data-invalid", "true");
  await expect(bad.getByRole("alert")).toContainText("Too little text could be read");
  await expect(flow.getByRole("listitem").filter({ hasText: "vacancy.txt" })).not.toHaveAttribute("data-invalid", "true");
  expect(await e2eDb().targetJob.count({ where: { workspaceId } })).toBe(0);

  await flow.getByRole("button", { name: "Remove note.txt" }).click();
  await flow.getByRole("button", { name: "Use this file" }).click();
  await expect(flow.getByLabel("Anything you want AI to keep in mind? (optional)")).toBeVisible({ timeout: 30_000 });
  // One file: the card shows no file list, as before.
  await expect(flow.getByTestId("job-source-files")).toHaveCount(0);
});

test("screenshots of the file list", async ({ page }, testInfo) => {
  test.skip(!shots, "set JOB_FILES_SHOTS=<dir> to save screenshots");
  const project = testInfo.project.name.replace(/\s+/g, "-");
  const flow = await openUpload(page);
  await flow.locator('input[type="file"]').setInputFiles([
    file("Full_Stack_Developer_25_11.txt", text("Vacancy")),
    file("company-profile.md", text("About us")),
    file("note.txt", "See attached."),
  ]);
  await flow.getByRole("button", { name: "Use these 3 files" }).click();
  await expect(flow.getByRole("listitem").filter({ hasText: "note.txt" })).toHaveAttribute("data-invalid", "true");
  const panel = flow.locator(".rm-intake-panel");
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    await panel.screenshot({ path: `${shots}/list-${project}-${theme}.png` });
  }
});
