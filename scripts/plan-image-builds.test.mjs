// Run with: node --test scripts/plan-image-builds.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  IMAGES,
  planBuilds,
  readWorkspacePackages,
  toBuildMatrix,
} from "./plan-image-builds.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const packages = readWorkspacePackages(repoRoot);
const everyImage = IMAGES.map((i) => i.image);
const plan = (...changedFiles) => planBuilds({ changedFiles, packages }).build;

test("IMAGES matches the targets in docker-bake.hcl", () => {
  const hcl = readFileSync(path.join(repoRoot, "docker-bake.hcl"), "utf8");
  const targets = [...hcl.matchAll(/^target "([^"]+)"/gm)]
    .map((m) => m[1])
    .filter((name) => !name.startsWith("_"));
  assert.deepEqual([...targets].sort(), [...everyImage].sort());
});

test("every image's package exists in the workspace", () => {
  const names = new Set(packages.map((p) => p.name));
  for (const { image, package: pkg } of IMAGES) {
    assert.ok(names.has(pkg), `${image} → ${pkg} is not a workspace package`);
  }
});

test("a change inside one app rebuilds only that app", () => {
  assert.deepEqual(plan("apps/hub/app/page.tsx"), ["hub"]);
});

test("a change to an app with several targets rebuilds all of them", () => {
  assert.deepEqual(plan("apps/appbuilder/lib/x.ts"), [
    "appbuilder-migrate",
    "appbuilder-worker",
    "appbuilder",
  ]);
});

test("a shared package change rebuilds every app that depends on it", () => {
  const build = plan("packages/ui/src/button.tsx");
  assert.ok(
    build.includes("web") && build.includes("admin") && build.includes("hub")
  );
  assert.ok(
    !build.includes("platform-migrate"),
    "the migrator does not use @asafarim/ui"
  );
});

test("a platform schema change rebuilds the migrator and its dependents", () => {
  const build = plan("packages/db/prisma/schema.prisma");
  assert.ok(build.includes("platform-migrate") && build.includes("hub"));
});

test("the vionto worker Dockerfile rebuilds only the worker", () => {
  assert.deepEqual(plan("infra/docker/Dockerfile.vionto-worker"), [
    "vionto-worker",
  ]);
});

test("docs, READMEs, tests and deploy scripts rebuild nothing", () => {
  assert.deepEqual(
    plan(
      "docs/architecture.md",
      "README.md",
      "apps/admin/README.md",
      "apps/resumatch/AGENTS.md",
      "apps/tasks-ai/docs/adr/0001-dedicated-database.md",
      "apps/hub/lib/auth.test.ts",
      "packages/auth/src/__fixtures__/platform-apps.snapshot.json",
      "apps/edumatch/e2e/intake.spec.ts",
      "apps/testora/platform.app.ts",
      "apps/tasks-ai/platform.app.json",
      "apps/appbuilder/.env.production.age",
      "infra/scripts/vps-deploy.sh",
      "infra/caddy/Caddyfile",
      "docker-compose.prod.yml",
      ".github/workflows/ci-status.yml",
      "benchmarks/testora/src/run.ts"
    ),
    []
  );
});

test("the generated launcher registry rebuilds what @asafarim/auth rebuilds", () => {
  assert.deepEqual(
    plan("generated/platform/launcher-registry.json"),
    plan("packages/auth/src/apps.ts")
  );
  assert.ok(plan("generated/platform/launcher-registry.json").includes("hub"));
  assert.notDeepEqual(
    plan("generated/platform/launcher-registry.json"),
    everyImage,
    "a registry change is not a root build input"
  );
});

test("root build inputs rebuild every image", () => {
  for (const file of [
    "pnpm-lock.yaml",
    "package.json",
    ".dockerignore",
    ".env.production.example",
    ".github/workflows/deploy.yml",
    "docker-bake.hcl",
    "some-new-root-file.json",
  ]) {
    assert.deepEqual(plan(file), everyImage, file);
  }
});

test("targets built from one Dockerfile share a single job", () => {
  assert.deepEqual(toBuildMatrix(["hub", "tasksai", "tasksai-migrate"]), [
    { group: "hub", targets: "hub" },
    { group: "tasksai", targets: "tasksai-migrate,tasksai" },
  ]);
});
