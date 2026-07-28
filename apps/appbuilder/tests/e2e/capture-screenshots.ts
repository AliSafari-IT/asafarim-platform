// One-off script (not part of the CI test suite) used to capture real,
// rendered screenshots of the M12 launch-readiness UI for the PR
// description — run manually against already-running dev servers seeded by
// a prior `playwright test` invocation's global-setup.
// Usage: npx tsx tests/e2e/capture-screenshots.ts
import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const AUTH_DIR = path.join(__dirname, ".auth");
const OUT_DIR = path.join(__dirname, "../../../../docs/screenshots");
const fixtures = JSON.parse(
  fs.readFileSync(path.join(AUTH_DIR, "fixtures.json"), "utf-8")
);

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  const ownerContext = await browser.newContext({
    storageState: path.join(AUTH_DIR, "owner.json"),
    viewport: { width: 1280, height: 900 },
  });
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto(
    `http://localhost:3006/apps/${fixtures.m11DeployedAppId}/operations`
  );
  await ownerPage
    .getByText("Launch-blocking issues")
    .waitFor({ timeout: 15_000 });
  await ownerPage.waitForTimeout(300);
  await ownerPage.screenshot({
    path: path.join(OUT_DIR, "m12-operations-owner-deployed-app.png"),
    fullPage: true,
  });
  console.log("captured owner/deployed-app screenshot");

  const ownerPage2 = await ownerContext.newPage();
  await ownerPage2.goto(
    `http://localhost:3006/apps/${fixtures.demoAppId}/operations`
  );
  await ownerPage2
    .getByText("Launch-blocking issues")
    .waitFor({ timeout: 15_000 });
  await ownerPage2.waitForTimeout(300);
  await ownerPage2.screenshot({
    path: path.join(OUT_DIR, "m12-operations-owner-never-deployed-app.png"),
    fullPage: true,
  });
  console.log("captured owner/never-deployed screenshot");

  const viewerContext = await browser.newContext({
    storageState: path.join(AUTH_DIR, "viewer.json"),
    viewport: { width: 1280, height: 900 },
  });
  const viewerPage = await viewerContext.newPage();
  await viewerPage.goto(
    `http://localhost:3006/apps/${fixtures.demoAppId}/operations`
  );
  await viewerPage.getByText(/restricted summary/).waitFor({ timeout: 15_000 });
  await viewerPage.waitForTimeout(300);
  await viewerPage.screenshot({
    path: path.join(OUT_DIR, "m12-operations-viewer-restricted.png"),
    fullPage: true,
  });
  console.log("captured viewer/restricted screenshot");

  const unrelatedContext = await browser.newContext({
    storageState: path.join(AUTH_DIR, "unrelated.json"),
    viewport: { width: 1280, height: 900 },
  });
  const unrelatedPage = await unrelatedContext.newPage();
  await unrelatedPage.goto(
    `http://localhost:3006/apps/${fixtures.demoAppId}/operations`
  );
  await unrelatedPage.getByText("Page not found").waitFor();
  await unrelatedPage.waitForTimeout(300);
  await unrelatedPage.screenshot({
    path: path.join(OUT_DIR, "m12-operations-unrelated-404.png"),
    fullPage: true,
  });
  console.log("captured unrelated/404 screenshot");

  const ownerPage3 = await ownerContext.newPage();
  await ownerPage3.goto(
    `http://localhost:3006/apps/${fixtures.m11DeployedAppId}`
  );
  await ownerPage3.getByRole("link", { name: "Launch readiness" }).waitFor();
  await ownerPage3.waitForTimeout(300);
  await ownerPage3.screenshot({
    path: path.join(OUT_DIR, "m12-workspace-topbar-link.png"),
    fullPage: false,
  });
  console.log("captured workspace top-bar link screenshot");

  await browser.close();
}

main();
