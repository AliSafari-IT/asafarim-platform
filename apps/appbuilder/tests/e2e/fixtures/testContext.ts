import fs from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext } from "@playwright/test";

const AUTH_DIR = path.join(__dirname, "..", ".auth");

export interface SeededFixtures {
  demoAppId: string;
  archivedAppId: string;
  noPreviewAppId: string;
  securityAppId: string;
  builderAppId: string;
  builderAppPriorityId: string;
  builderAppSelectionId: string;
  builderAppDestructiveId: string;
  builderAppHistoryId: string;
  builderAppAdversarialId: string;
  builderAppA11yDialogId: string;
  builderAppA11yMotionId: string;
  ownerId: string;
  editorId: string;
  viewerId: string;
  unrelatedId: string;
}

export function loadFixtures(): SeededFixtures {
  return JSON.parse(fs.readFileSync(path.join(AUTH_DIR, "fixtures.json"), "utf-8"));
}

export type Role = "owner" | "editor" | "viewer" | "unrelated";

/** A fresh browser context carrying the pre-minted session cookie for the given role — see fixtures/session.ts. */
export async function authedContext(browser: Browser, role: Role): Promise<BrowserContext> {
  const storageState = path.join(AUTH_DIR, `${role}.json`);
  return browser.newContext({ storageState });
}
