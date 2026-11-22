import { E2E_PLATFORM_USER_ID, e2eDb, expect, seedTailoredResume, test } from "./fixtures";

/**
 * The profile form only saves a new version when something really changed
 * (lib/profile/changes.ts). Seeds one unconfirmed version (v1).
 */

test.beforeEach(async () => {
  await seedTailoredResume("e2e-save-changes-cv", "e2e-save-changes-letter");
});

async function storedVersions() {
  const profile = await e2eDb().candidateProfile.findFirstOrThrow({
    where: { workspace: { platformUserId: E2E_PLATFORM_USER_ID } },
    include: { versions: { orderBy: { versionNumber: "asc" } } },
  });
  return { count: profile.versions.length, confirmedVersionId: profile.confirmedVersionId, versions: profile.versions };
}

test("an unchanged profile can be confirmed but never saved as a copy", async ({ page }) => {
  await page.goto("/profile");
  const draft = page.getByRole("button", { name: "Save without confirming" });
  const confirm = page.getByRole("button", { name: "Save and confirm" });
  const headline = page.getByRole("textbox", { name: "Headline" });

  // Nothing changed yet: no draft to save, but v1 still needs confirming.
  await expect(draft).toBeDisabled();
  await expect(confirm).toBeEnabled();

  // An edit enables saving; undoing it makes the form clean again.
  await headline.fill("Software developer");
  await expect(page.getByRole("status").filter({ hasText: "Unsaved changes" })).toBeVisible();
  await expect(draft).toBeEnabled();
  await headline.fill("");
  await expect(draft).toBeDisabled();
  // Spacing alone is not a change.
  await page.getByRole("textbox", { name: "Full name" }).fill("  Jordan   Example ");
  await expect(draft).toBeDisabled();

  // Confirming the untouched v1 writes no v2.
  await confirm.click();
  await expect(page.getByText("Confirmed. Nothing had changed, so no new version was saved.")).toBeVisible();
  let stored = await storedVersions();
  expect(stored.count).toBe(1);
  expect(stored.confirmedVersionId).toBe(stored.versions[0].id);
  await expect(confirm).toBeDisabled();

  await page.reload();
  await expect(draft).toBeDisabled();
  await expect(confirm).toBeDisabled();

  // A real change saves v2 and confirms it; then the form is clean again.
  await headline.fill("Software developer");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText("Saved and confirmed. This is now the version")).toBeVisible();
  await expect.poll(async () => (await storedVersions()).count).toBe(2);
  stored = await storedVersions();
  expect(stored.confirmedVersionId).toBe(stored.versions[1].id);
  await expect(confirm).toBeDisabled();
  await expect(draft).toBeDisabled();
});

test("the API writes no version for an unchanged profile", async ({ page }) => {
  await page.goto("/profile");
  const before = await storedVersions();
  const response = await page.request.post("/api/profile", {
    data: { content: before.versions[0].content, parentVersionId: before.versions[0].id, confirm: false },
  });
  expect(await response.json()).toMatchObject({ versionId: before.versions[0].id, unchanged: true });
  expect((await storedVersions()).count).toBe(1);
});
