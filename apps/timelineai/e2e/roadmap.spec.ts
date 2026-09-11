import { expect, test } from "@playwright/test";

test("public roadmap shows shipped history and the cited AI backlog without sign-in", async ({
  page,
}) => {
  await page.goto("/roadmap");

  await expect(page).toHaveURL(/\/roadmap$/);
  await expect(
    page.getByRole("heading", { name: "The TimelineAI journey" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Built so far" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Where the story goes next" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Governed AI foundation" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "#286", exact: true })
  ).toHaveAttribute(
    "href",
    "https://github.com/AliSafari-IT/asafarim-platform/issues/286"
  );
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});
