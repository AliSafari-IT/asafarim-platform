import assert from "node:assert/strict";
import { test } from "node:test";
import { SEED_BUNDLES } from "@/data/bundles";
import { PROJECTS, TASKSAI_PROJECT_ID, projectSeedTargets } from "@/data/projects";
import { TASKSAI_COVERAGE, TASKSAI_GROUPS } from "./tasksai-coverage";
import { tasksaiCases } from "./tasksai";

/** #742 slice 1: the coverage manifest and the TasksAI registration. */

test("every group of the #742 scenario table has at least one scenario", () => {
  const covered = new Set(TASKSAI_COVERAGE.map((e) => e.group));
  assert.deepEqual(TASKSAI_GROUPS.filter((g) => !covered.has(g)), []);
});

test("scenario and case ids are stable-shaped and unique, also across every other bundle", () => {
  const ids = TASKSAI_COVERAGE.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate scenario id");
  for (const e of TASKSAI_COVERAGE) {
    assert.match(e.id, /^tasksai\.[a-z0-9-]+\.[a-z0-9-]+$/, e.id);
    assert.ok(e.id.startsWith(`tasksai.${e.group}.`), `${e.id} is in group ${e.group}`);
    for (const caseId of e.caseIds) assert.match(caseId, /^tasksai-[a-z0-9-]+$/, caseId);
  }
  const caseIds = TASKSAI_COVERAGE.flatMap((e) => e.caseIds);
  assert.equal(new Set(caseIds).size, caseIds.length, "a case id is reserved twice");
  const otherCases = new Set(
    SEED_BUNDLES.filter((b) => b.projectId !== TASKSAI_PROJECT_ID).flatMap((b) => b.cases.map((c) => c.caseId)),
  );
  assert.deepEqual(caseIds.filter((id) => otherCases.has(id)), [], "collides with another app's case id");
});

test("mutating scenarios never run on the deployment (remote smoke)", () => {
  const unsafe = TASKSAI_COVERAGE.filter((e) => e.mutation === "mutates" && e.targets.includes("remote-smoke"));
  assert.deepEqual(unsafe.map((e) => e.id), []);
  for (const e of TASKSAI_COVERAGE) {
    assert.ok(e.targets.length > 0, `${e.id} has no eligible target`);
    assert.ok(e.targets.includes("local"), `${e.id} must run locally`);
  }
});

test("status rules: implemented cases exist, excluded entries say why", () => {
  const existing = new Set(tasksaiCases.map((c) => c.caseId));
  for (const e of TASKSAI_COVERAGE) {
    if (e.status === "implemented") {
      assert.ok(e.caseIds.length > 0, e.id);
      for (const caseId of e.caseIds) assert.ok(existing.has(caseId), `${e.id}: case ${caseId} is not in the bundle`);
    }
    if (e.status === "excluded") assert.ok(e.reason?.trim(), `${e.id} is excluded without a reason`);
  }
  // And the reverse: every executable TasksAI case is accounted for by an implemented scenario.
  const implementedCases = new Set(TASKSAI_COVERAGE.filter((e) => e.status === "implemented").flatMap((e) => e.caseIds));
  assert.deepEqual(tasksaiCases.map((c) => c.caseId).filter((id) => !implementedCases.has(id)), [], "case without an implemented scenario");
  assert.deepEqual(
    TASKSAI_COVERAGE.filter((e) => e.status === "implemented").map((e) => e.id),
    ["tasksai.auth.redirect-to-hub", "tasksai.auth.login-returns", "tasksai.auth.invalid-sign-in", "tasksai.auth.sign-out", "tasksai.daily-work.journey"],
  );
});

test("TasksAI is registered with Local and Remote smoke targets, and a separate seeded bundle", () => {
  const project = PROJECTS.find((p) => p.id === TASKSAI_PROJECT_ID);
  assert.ok(project, "registered");
  assert.equal(project.name, "ASafariM · TasksAI");
  const targets = projectSeedTargets(project);
  assert.deepEqual(targets.map((t) => t.slug).slice(0, 2), ["local", "remote-smoke"]);
  assert.match(targets[0]!.name, /local Testora only/, "the Local target says a hosted runner can't reach it");
  assert.equal(SEED_BUNDLES.filter((b) => b.projectId === TASKSAI_PROJECT_ID).length, 1);
  assert.equal(SEED_BUNDLES.find((b) => b.projectId === TASKSAI_PROJECT_ID)!.fr.projectId, TASKSAI_PROJECT_ID);
});

test("the Remote test environment is seeded only when configured, never defaulting to production", async () => {
  const keys = ["NEXT_PUBLIC_ASAFARIM_TASKSAI_TEST_URL", "NEXT_PUBLIC_ASAFARIM_TASKSAI_TEST_HUB_URL"] as const;
  const saved = keys.map((k) => process.env[k]);
  try {
    for (const k of keys) delete process.env[k];
    const unset = await import(`../projects.ts?unset=${Date.now()}`);
    const plain = unset.projectSeedTargets(unset.getProject(TASKSAI_PROJECT_ID));
    assert.equal(plain.find((t: { slug: string }) => t.slug === "remote-test"), undefined);

    process.env.NEXT_PUBLIC_ASAFARIM_TASKSAI_TEST_URL = "https://tasks-test.example.test";
    process.env.NEXT_PUBLIC_ASAFARIM_TASKSAI_TEST_HUB_URL = "https://hub-test.example.test";
    const set = await import(`../projects.ts?set=${Date.now()}`);
    const remoteTest = set
      .projectSeedTargets(set.getProject(TASKSAI_PROJECT_ID))
      .find((t: { slug: string }) => t.slug === "remote-test");
    assert.deepEqual(
      { baseUrl: remoteTest?.baseUrl, hubUrl: remoteTest?.hubUrl },
      { baseUrl: "https://tasks-test.example.test", hubUrl: "https://hub-test.example.test" },
    );
  } finally {
    keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
  }
});
