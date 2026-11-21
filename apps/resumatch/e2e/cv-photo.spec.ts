import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  E2E_PLATFORM_USER_ID,
  expect,
  seedTailoredResume,
  signInWithPicture,
  test,
} from "./fixtures";

/**
 * Optional CV photo: add it on the profile (cropped in the browser), see it
 * on the CV preview, the printed PDF and the DOCX, turn it off for one CV,
 * and remove it. The stored file has no EXIF left in it.
 */

const CV_ID = "e2e-cv-photo";
const LETTER_ID = "e2e-cv-photo-letter";
const SOURCE = fileURLToPath(
  new URL("../fixtures/photo/portrait-source.jpg", import.meta.url)
);

test.beforeEach(async () => {
  await seedTailoredResume(CV_ID, LETTER_ID);
});

async function addPhoto(page: import("@playwright/test").Page) {
  await page.goto("/profile");
  const card = page.locator("#cv-photo");
  await expect(card.getByText("No photo yet.")).toBeVisible();
  await card.getByTestId("photo-file").setInputFiles(SOURCE);
  const stage = card.getByTestId("photo-crop-stage");
  await expect(stage).toBeVisible();
  // Keyboard cropping works: focus the crop area and nudge it.
  await stage.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("+");
  await card.getByRole("button", { name: "Save photo" }).click();
  await expect(card.getByText("Photo saved.")).toBeVisible();
  await expect(card.getByTestId("profile-photo")).toBeVisible();
}

test("add a photo, show it on the CV, the PDF and the DOCX, then remove it", async ({
  page,
}) => {
  await addPhoto(page);

  // Stored as a square JPEG with the source's EXIF (camera, GPS) removed.
  const stored = await page.request.get("/api/profile/photo");
  expect(stored.status()).toBe(200);
  expect(stored.headers()["content-type"]).toBe("image/jpeg");
  expect(stored.headers()["cache-control"]).toContain("no-store");
  const bytes = await stored.body();
  expect(bytes.toString("latin1")).not.toContain("Exif");
  expect(bytes.toString("latin1")).not.toContain("TestCam");

  await page.goto(`/tailor/${CV_ID}/preview`);
  const cv = page.getByTestId("cv").filter({ visible: true });
  const photo = cv.getByRole("img", { name: "Photo of Jordan Example" });
  await expect(photo).toBeVisible();
  await expect
    .poll(() =>
      photo.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth
      )
    )
    .toBe(600);
  await expect(photo).toHaveCSS("border-radius", "50%");

  // The PDF embeds the image and the CV still fits its usual pages.
  const pdf = await page.pdf({ format: "A4", displayHeaderFooter: true });
  expect(pdf.toString("latin1")).toMatch(/\/Subtype\s*\/Image/);
  const pages = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
  expect(pages.length).toBeLessThanOrEqual(3);

  const docx = await page.request.get(`/api/tailor/${CV_ID}/docx`);
  expect(docx.status()).toBe(200);
  expect((await docx.body()).toString("latin1")).toContain("word/media/");

  // Off for this CV only: the preview and the DOCX both drop it.
  const toggle = page.getByTestId("cv-photo-toggle");
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(cv.getByRole("img")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("cv-photo-toggle")).not.toBeChecked();
  await expect(
    page.getByTestId("cv").filter({ visible: true }).getByRole("img")
  ).toHaveCount(0);
  const docxWithout = await page.request.get(`/api/tailor/${CV_ID}/docx`);
  expect((await docxWithout.body()).toString("latin1")).not.toContain(
    "word/media/"
  );
  await page.getByTestId("cv-photo-toggle").check();
  await expect(
    page.getByTestId("cv").filter({ visible: true }).getByRole("img")
  ).toHaveCount(1);

  // Square instead of round.
  await page.goto("/profile");
  const card = page.locator("#cv-photo");
  await card.getByRole("radio", { name: "Square" }).check();
  await expect(card.getByTestId("profile-photo")).toHaveClass(/--square/);
  await page.goto(`/tailor/${CV_ID}/preview`);
  await expect(
    page.getByTestId("cv-photo").filter({ visible: true })
  ).toHaveClass(/--square/);

  // Remove: styled confirm dialog, then the photo is gone everywhere.
  await page.goto("/profile");
  await card.getByRole("button", { name: "Remove photo" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove photo" })
    .click();
  await expect(card.getByText("Photo removed.")).toBeVisible();
  expect((await page.request.get("/api/profile/photo")).status()).toBe(404);
  await page.goto(`/tailor/${CV_ID}/preview`);
  await expect(
    page.getByTestId("cv").filter({ visible: true }).getByRole("img")
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add a photo" })).toBeVisible();
});

test("a CV without a photo is unchanged", async ({ page }) => {
  await page.goto(`/tailor/${CV_ID}/preview`);
  const cv = page.getByTestId("cv").filter({ visible: true });
  await expect(cv).toBeVisible();
  await expect(cv.getByRole("img")).toHaveCount(0);
  await expect(cv.locator(".rm-resume__header")).toHaveCSS(
    "text-align",
    "center"
  );
});

test("the server refuses a file that is not a square JPEG", async ({
  page,
}) => {
  await page.goto("/profile");
  const png = await page.request.post("/api/profile/photo", {
    multipart: {
      photo: {
        name: "x.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from("<svg onload=alert(1)>"),
      },
    },
  });
  expect(png.status()).toBe(422);
  expect(await png.json()).toEqual({ error: "NOT_JPEG" });
});

test("deleting all data removes the photo and empties the card without a reload", async ({
  page,
}) => {
  await addPhoto(page);
  await page.getByRole("button", { name: "Delete my CV and profile" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete everything" })
    .click();
  const card = page.locator("#cv-photo");
  await expect(card.getByText("No photo yet.")).toBeVisible();
  await expect(card.getByTestId("profile-photo")).toHaveCount(0);
  expect((await page.request.get("/api/profile/photo")).status()).toBe(404);
});

test("use the account photo as the CV photo, cropped like an upload", async ({
  page,
  context,
  baseURL,
}) => {
  // No account photo on the session: no button.
  await page.goto("/profile");
  const card = page.locator("#cv-photo");
  await expect(card.getByText("No photo yet.")).toBeVisible();
  await expect(card.getByTestId("photo-use-avatar")).toHaveCount(0);

  // An avatar uploaded in Hub, as Hub's local storage would hold it
  // (the app runs `next dev` from this folder, in local storage mode).
  const key = `hub/avatars/${E2E_PLATFORM_USER_ID.slice(0, 8)}/4f9c1d2e-8a7b-4c3d-9e0f-112233445566.jpg`;
  const dir =
    process.env.STORAGE_LOCAL_DIR ?? join(process.cwd(), ".local-storage", "objects");
  const file = join(dir, key.replace(/[^a-zA-Z0-9._-]/g, "_"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, readFileSync(SOURCE));
  writeFileSync(`${file}.json`, JSON.stringify({ contentType: "image/jpeg" }));
  try {
    // Someone else's avatar is never offered.
    await signInWithPicture(
      context,
      baseURL,
      `/api/storage/local?key=${encodeURIComponent("hub/avatars/someone1/x.jpg")}`
    );
    await page.reload();
    await expect(card.getByTestId("photo-use-avatar")).toHaveCount(0);
    expect(
      (await page.request.get("/api/profile/photo/account-avatar")).status()
    ).toBe(404);

    await signInWithPicture(
      context,
      baseURL,
      `/api/storage/local?key=${encodeURIComponent(key)}`
    );
    await page.reload();
    const raw = await page.request.get("/api/profile/photo/account-avatar");
    expect(raw.status()).toBe(200);
    expect(raw.headers()["content-type"]).toBe("image/jpeg");
    expect(raw.headers()["cache-control"]).toContain("no-store");

    await card.getByRole("button", { name: "Use my account photo" }).click();
    await expect(card.getByTestId("photo-crop-stage")).toBeVisible();
    await card.getByRole("button", { name: "Save photo" }).click();
    await expect(card.getByText("Photo saved.")).toBeVisible();
    await expect(card.getByTestId("profile-photo")).toBeVisible();

    // Stored exactly like an upload: a 600 × 600 JPEG without the EXIF.
    const stored = await page.request.get("/api/profile/photo");
    expect(stored.status()).toBe(200);
    const bytes = await stored.body();
    expect(bytes.toString("latin1")).not.toContain("TestCam");

    await page.goto(`/tailor/${CV_ID}/preview`);
    const photo = page
      .getByTestId("cv")
      .filter({ visible: true })
      .getByRole("img", { name: "Photo of Jordan Example" });
    await expect
      .poll(() =>
        photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)
      )
      .toBe(600);
    const docx = await page.request.get(`/api/tailor/${CV_ID}/docx`);
    expect((await docx.body()).toString("latin1")).toContain("word/media/");
  } finally {
    rmSync(file, { force: true });
    rmSync(`${file}.json`, { force: true });
  }
});
