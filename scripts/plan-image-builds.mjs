#!/usr/bin/env node
/**
 * Decides which production images a push to main has to rebuild. Used by the
 * "plan" job of .github/workflows/deploy.yml.
 *
 * Every image used to be rebuilt on every push (~20 builds, ~€1 of Actions
 * minutes), even for a README edit. This compares the new commit with the
 * last commit that was successfully deployed and rebuilds only the images
 * whose workspace package — or any workspace package it depends on — has
 * changed. Everything else keeps its previous image, re-tagged for the new
 * commit so the VPS still pulls one consistent `<image>-<sha>` set.
 *
 * It fails open: whenever it cannot prove an image is unaffected (no usable
 * base commit, a change to the lockfile or another root build input, a base
 * image missing from the registry) it rebuilds instead.
 *
 * Environment:
 *   HEAD_SHA        commit being deployed (default: HEAD)
 *   BASE_SHA        last successfully deployed commit (empty = rebuild all)
 *   FORCE_ALL       "true" to rebuild every image
 *   IMAGE_REPOSITORY  registry repository; with CHECK_REGISTRY=true, every
 *                     image planned for reuse must exist there at BASE_SHA
 *   CHECK_REGISTRY  "true" to verify base images with `docker buildx imagetools`
 *
 * Writes `build` (JSON [{group, targets}]) and `reuse` (space-separated image
 * names) to $GITHUB_OUTPUT, and a table to $GITHUB_STEP_SUMMARY.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One entry per target in docker-bake.hcl. `group` is the Dockerfile the
 * target is built from: the workflow builds a group's targets in one job so
 * they share the builder stage. `package` is the workspace package the image
 * is built from; `files` lists extra paths outside that package that feed it.
 */
export const IMAGES = [
  {
    image: "platform-migrate",
    group: "platform-migrate",
    package: "@asafarim/db",
  },
  { image: "web", group: "web", package: "@asafarim/web" },
  { image: "hub", group: "hub", package: "@asafarim/hub" },
  { image: "showcase", group: "showcase", package: "@asafarim/showcase" },
  { image: "admin", group: "admin", package: "@asafarim/admin" },
  { image: "vionto", group: "vionto", package: "vionto" },
  {
    image: "vionto-worker",
    group: "vionto-worker",
    package: "vionto",
    files: ["infra/docker/Dockerfile.vionto-worker"],
  },
  { image: "edumatch", group: "edumatch", package: "edumatch" },
  { image: "testora-migrator", group: "testora", package: "testora" },
  { image: "testora", group: "testora", package: "testora" },
  { image: "testora-runner", group: "testora", package: "testora" },
  {
    image: "appbuilder-migrate",
    group: "appbuilder",
    package: "@asafarim/appbuilder",
  },
  {
    image: "appbuilder-worker",
    group: "appbuilder",
    package: "@asafarim/appbuilder",
  },
  { image: "appbuilder", group: "appbuilder", package: "@asafarim/appbuilder" },
  { image: "timelineai", group: "timelineai", package: "timelineai" },
  { image: "labs", group: "labs", package: "@asafarim/labs" },
  {
    image: "resumatch-migrate",
    group: "resumatch",
    package: "@asafarim/resumatch",
  },
  { image: "resumatch", group: "resumatch", package: "@asafarim/resumatch" },
  { image: "tasksai-migrate", group: "tasksai", package: "@asafarim/tasks-ai" },
  { image: "tasksai-worker", group: "tasksai", package: "@asafarim/tasks-ai" },
  { image: "tasksai", group: "tasksai", package: "@asafarim/tasks-ai" },
];

/** Directories pnpm-workspace.yaml declares as workspace package roots. */
const WORKSPACE_ROOTS = ["apps", "packages", "benchmarks"];

/**
 * Paths outside every workspace package that cannot change an image: docs,
 * runtime-only deploy config (Compose, Caddy, the VPS scripts — they take
 * effect through the deploy job, which always runs), encrypted env files and
 * editor/repo metadata. Anything outside a package that is NOT listed here —
 * the lockfile, root package.json, tsconfig, .dockerignore, the deploy
 * workflow, docker-bake.hcl, .env.production.example (it supplies the
 * NEXT_PUBLIC_* build args) — rebuilds every image.
 */
const ROOT_PATHS_WITHOUT_IMAGE_EFFECT = [
  /^docs\//,
  /^[^/]+\.md$/,
  /^\.github\/(?!workflows\/deploy\.yml$)/,
  /^\.claude\//,
  /^\.age\//,
  /^infra\/(caddy|scripts)\//,
  /^docker-compose(\.[\w-]+)?\.ya?ml$/,
  /^scripts\//,
  /^\.env(\.local|\.production)?\.age$/,
  /^\.env(\.local)?\.example$/,
  /^envage\.config\.json$/,
  /^\.(gitignore|gitattributes|gitleaksignore|prettierignore|prettierrc)$/,
  /^LICENSE$/,
  /^[^/]+\.code-workspace$/,
  /^(output|tmp)\//,
  /^repair-result\.txt$/,
];

/**
 * Files inside a workspace package that never reach its image: docs and
 * agent notes, .env files (excluded by .dockerignore) and tests. Paths are
 * relative to the package directory.
 */
const PACKAGE_PATHS_WITHOUT_IMAGE_EFFECT = [
  /(^|\/)(README|CHANGELOG|AGENTS|CLAUDE)\.md$/,
  /^docs\//,
  /(^|\/)\.env(\.[^/]*)?$/,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)__tests__\//,
  /(^|\/)e2e\//,
  // ASafarIM OS app manifests (#765): descriptive only, nothing in an image reads them.
  /(^|\/)platform\.app\.(ts|json)$/,
];

/** Reads every workspace package: its directory, name and workspace deps. */
export function readWorkspacePackages(repoRoot) {
  const packages = [];
  for (const root of WORKSPACE_ROOTS) {
    const rootDir = path.join(repoRoot, root);
    if (!existsSync(rootDir)) continue;
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(rootDir, entry.name, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      packages.push({
        name: manifest.name,
        dir: `${root}/${entry.name}`,
        deps: Object.keys({
          ...manifest.dependencies,
          ...manifest.devDependencies,
          ...manifest.peerDependencies,
          ...manifest.optionalDependencies,
        }),
      });
    }
  }
  return packages;
}

/**
 * Pure planning step: given the changed files and the workspace graph,
 * returns which images to build and why.
 */
export function planBuilds({ changedFiles, packages, images = IMAGES }) {
  const all = () => ({
    build: images.map((i) => i.image),
    reasons: [],
  });

  const packageByDir = [...packages].sort(
    (a, b) => b.dir.length - a.dir.length
  );
  const packageNames = new Set(packages.map((p) => p.name));
  const changedPackages = new Set();
  const reasons = [];
  const forcedImages = new Set();

  for (const file of changedFiles) {
    const extraFor = images.filter((i) => i.files?.includes(file));
    if (extraFor.length > 0) {
      for (const i of extraFor) forcedImages.add(i.image);
      reasons.push(`${file} → ${extraFor.map((i) => i.image).join(", ")}`);
      continue;
    }

    const owner = packageByDir.find((p) => file.startsWith(`${p.dir}/`));
    if (owner) {
      const relative = file.slice(owner.dir.length + 1);
      if (PACKAGE_PATHS_WITHOUT_IMAGE_EFFECT.some((re) => re.test(relative)))
        continue;
      if (!changedPackages.has(owner.name))
        reasons.push(`${file} → ${owner.name}`);
      changedPackages.add(owner.name);
      continue;
    }

    if (ROOT_PATHS_WITHOUT_IMAGE_EFFECT.some((re) => re.test(file))) continue;

    return {
      ...all(),
      reasons: [`${file} is a shared build input → every image`],
    };
  }

  // Everything that depends on a changed package, transitively.
  const dependents = new Map();
  for (const pkg of packages) {
    for (const dep of pkg.deps) {
      if (!packageNames.has(dep)) continue;
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep).push(pkg.name);
    }
  }
  const affected = new Set(changedPackages);
  const queue = [...changedPackages];
  while (queue.length > 0) {
    for (const dependent of dependents.get(queue.pop()) ?? []) {
      if (affected.has(dependent)) continue;
      affected.add(dependent);
      queue.push(dependent);
    }
  }

  return {
    build: images
      .filter((i) => forcedImages.has(i.image) || affected.has(i.package))
      .map((i) => i.image),
    reasons,
  };
}

/** Groups image names into one build job per Dockerfile, in IMAGES order. */
export function toBuildMatrix(imageNames, images = IMAGES) {
  const wanted = new Set(imageNames);
  const groups = new Map();
  for (const { image, group } of images) {
    if (!wanted.has(image)) continue;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(image);
  }
  return [...groups].map(([group, targets]) => ({
    group,
    targets: targets.join(","),
  }));
}

/**
 * The deploy workflow reads the NEXT_PUBLIC_* build args from this file.
 * Its other lines only document .env.production.age, so editing them must
 * not rebuild every image.
 */
const PUBLIC_BUILD_CONFIG = ".env.production.example";

function publicBuildConfigChanged(baseSha, headSha) {
  const publicLines = (sha) => {
    try {
      return git(["show", `${sha}:${PUBLIC_BUILD_CONFIG}`])
        .split("\n")
        .filter((line) => /^NEXT_PUBLIC_[A-Z_]+=/.test(line))
        .join("\n");
    } catch {
      return null; // missing at that commit: treat as changed
    }
  };
  const before = publicLines(baseSha);
  return before === null || before !== publicLines(headSha);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function succeeds(command, args) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const repoRoot = git(["rev-parse", "--show-toplevel"]);
  const headSha = process.env.HEAD_SHA || git(["rev-parse", "HEAD"]);
  const baseSha = (process.env.BASE_SHA ?? "").trim();
  const allImages = IMAGES.map((i) => i.image);

  let build;
  let reasons;
  if (process.env.FORCE_ALL === "true") {
    build = allImages;
    reasons = ["manual run with rebuild_all → every image"];
  } else if (!baseSha) {
    build = allImages;
    reasons = ["no previous successful deploy found → every image"];
  } else if (
    !succeeds("git", ["merge-base", "--is-ancestor", baseSha, headSha])
  ) {
    build = allImages;
    reasons = [`${baseSha} is not an ancestor of ${headSha} → every image`];
  } else {
    const changedFiles = git([
      "diff",
      "--name-only",
      "--no-renames",
      baseSha,
      headSha,
    ])
      .split("\n")
      .filter(Boolean)
      .filter(
        (file) =>
          file !== PUBLIC_BUILD_CONFIG ||
          publicBuildConfigChanged(baseSha, headSha)
      );
    ({ build, reasons } = planBuilds({
      changedFiles,
      packages: readWorkspacePackages(repoRoot),
    }));
    if (changedFiles.length === 0) reasons.push("no changed files");
  }

  // An image can only be reused if its base-commit tag still exists.
  if (process.env.CHECK_REGISTRY === "true") {
    const repository = process.env.IMAGE_REPOSITORY;
    for (const image of allImages) {
      if (build.includes(image)) continue;
      const ref = `${repository}:${image}-${baseSha}`;
      if (!succeeds("docker", ["buildx", "imagetools", "inspect", ref])) {
        build.push(image);
        reasons.push(`${ref} not found in the registry → rebuild ${image}`);
      }
    }
  }

  const matrix = toBuildMatrix(build);
  const reuse = allImages.filter((i) => !build.includes(i));

  const summary = [
    "### Image build plan",
    "",
    `Base: ${baseSha ? `\`${baseSha}\`` : "none"} → head \`${headSha}\``,
    "",
    `**Build (${build.length}):** ${build.join(", ") || "none"}`,
    "",
    `**Reuse (${reuse.length}):** ${reuse.join(", ") || "none"}`,
    "",
    ...(reasons.length ? ["Why:", "", ...reasons.map((r) => `- ${r}`)] : []),
  ].join("\n");
  console.log(summary);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `build=${JSON.stringify(matrix)}\nreuse=${reuse.join(" ")}\n`
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
