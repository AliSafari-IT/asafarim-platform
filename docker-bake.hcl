# Image build definitions for the "Deploy to VPS" workflow.
#
# Every production image is one target here; scripts/plan-image-builds.mjs
# decides which of them a given push actually has to rebuild, and the
# workflow builds each Dockerfile's targets together in one `bake` call so
# they share a single builder stage (one `pnpm install` + app build) instead
# of repeating it once per target on a separate runner.
#
# Local dry run:   docker buildx bake -f docker-bake.hcl --print
# Build one app:   docker buildx bake -f docker-bake.hcl hub
#
# Always pass -f: without it bake also merges docker-compose.yml into the
# definition.

variable "IMAGE_REPOSITORY" {
  default = "ghcr.io/alisafari-it/asafarim-platform"
}

variable "IMAGE_TAG" {
  default = "local"
}

variable "SOURCE_URL" {
  default = ""
}

# NEXT_PUBLIC_* values are baked into the client bundles at build time. The
# workflow exports them from .env.production.example into the environment,
# which overrides these variables. A null default leaves the build-arg unset,
# so a local `bake` falls back to each Dockerfile's own ARG default.
variable "NEXT_PUBLIC_COMPANY_NAME" { default = null }
variable "NEXT_PUBLIC_PLATFORM_NAME" { default = null }
variable "NEXT_PUBLIC_HUB_NAME" { default = null }
variable "NEXT_PUBLIC_WEB_URL" { default = null }
variable "NEXT_PUBLIC_HUB_URL" { default = null }
variable "NEXT_PUBLIC_SHOWCASE_URL" { default = null }
variable "NEXT_PUBLIC_ADMIN_URL" { default = null }
variable "NEXT_PUBLIC_VIONTO_URL" { default = null }
variable "NEXT_PUBLIC_EDUMATCH_URL" { default = null }
variable "NEXT_PUBLIC_TESTORA_URL" { default = null }
variable "NEXT_PUBLIC_APPBUILDER_URL" { default = null }
variable "NEXT_PUBLIC_TIMELINEAI_URL" { default = null }
variable "NEXT_PUBLIC_DEVTOOLS_URL" { default = null }
variable "NEXT_PUBLIC_LABS_URL" { default = null }
variable "NEXT_PUBLIC_RESUMATCH_URL" { default = null }
variable "NEXT_PUBLIC_TASKSAI_URL" { default = null }
variable "NEXT_PUBLIC_API_URL" { default = null }

function "tag" {
  params = [image]
  result = ["${IMAGE_REPOSITORY}:${image}-${IMAGE_TAG}"]
}

# Cache scopes keep the per-image names the workflow used before, so existing
# GitHub Actions cache entries stay usable. mode=min exports only the final
# image's layers: exporting the full builder stage (mode=max) took up to three
# minutes per image and was never reused, because every Dockerfile's
# `COPY . .` invalidates it on any commit.
function "cache_from" {
  params = [image]
  result = ["type=gha,scope=${image}"]
}

function "cache_to" {
  params = [image]
  result = ["type=gha,mode=min,scope=${image}"]
}

target "_common" {
  context   = "."
  platforms = ["linux/amd64"]
  labels = {
    "org.opencontainers.image.source"   = SOURCE_URL
    "org.opencontainers.image.revision" = IMAGE_TAG
    "com.asafarim.platform"             = "true"
  }
  args = {
    NEXT_PUBLIC_COMPANY_NAME   = NEXT_PUBLIC_COMPANY_NAME
    NEXT_PUBLIC_PLATFORM_NAME  = NEXT_PUBLIC_PLATFORM_NAME
    NEXT_PUBLIC_HUB_NAME       = NEXT_PUBLIC_HUB_NAME
    NEXT_PUBLIC_WEB_URL        = NEXT_PUBLIC_WEB_URL
    NEXT_PUBLIC_HUB_URL        = NEXT_PUBLIC_HUB_URL
    NEXT_PUBLIC_SHOWCASE_URL   = NEXT_PUBLIC_SHOWCASE_URL
    NEXT_PUBLIC_ADMIN_URL      = NEXT_PUBLIC_ADMIN_URL
    NEXT_PUBLIC_VIONTO_URL     = NEXT_PUBLIC_VIONTO_URL
    NEXT_PUBLIC_EDUMATCH_URL   = NEXT_PUBLIC_EDUMATCH_URL
    NEXT_PUBLIC_TESTORA_URL    = NEXT_PUBLIC_TESTORA_URL
    NEXT_PUBLIC_APPBUILDER_URL = NEXT_PUBLIC_APPBUILDER_URL
    NEXT_PUBLIC_TIMELINEAI_URL = NEXT_PUBLIC_TIMELINEAI_URL
    NEXT_PUBLIC_DEVTOOLS_URL   = NEXT_PUBLIC_DEVTOOLS_URL
    NEXT_PUBLIC_LABS_URL       = NEXT_PUBLIC_LABS_URL
    NEXT_PUBLIC_RESUMATCH_URL  = NEXT_PUBLIC_RESUMATCH_URL
    NEXT_PUBLIC_TASKSAI_URL    = NEXT_PUBLIC_TASKSAI_URL
    NEXT_PUBLIC_API_URL        = NEXT_PUBLIC_API_URL
  }
}

group "default" {
  targets = [
    "platform-migrate",
    "web", "hub", "showcase", "admin",
    "vionto", "vionto-worker",
    "edumatch",
    "testora-migrator", "testora", "testora-runner",
    "appbuilder-migrate", "appbuilder-worker", "appbuilder",
    "timelineai", "labs",
    "resumatch-migrate", "resumatch",
    "tasksai-migrate", "tasksai-worker", "tasksai",
  ]
}

target "platform-migrate" {
  inherits   = ["_common"]
  dockerfile = "packages/db/Dockerfile"
  target     = "migrator"
  tags       = tag("platform-migrate")
  cache-from = cache_from("platform-migrate")
  cache-to   = cache_to("platform-migrate")
}

target "web" {
  inherits   = ["_common"]
  dockerfile = "apps/web/Dockerfile"
  target     = "runner"
  tags       = tag("web")
  cache-from = cache_from("web")
  cache-to   = cache_to("web")
}

target "hub" {
  inherits   = ["_common"]
  dockerfile = "apps/hub/Dockerfile"
  target     = "runner"
  tags       = tag("hub")
  cache-from = cache_from("hub")
  cache-to   = cache_to("hub")
}

target "showcase" {
  inherits   = ["_common"]
  dockerfile = "apps/showcase/Dockerfile"
  target     = "runner"
  tags       = tag("showcase")
  cache-from = cache_from("showcase")
  cache-to   = cache_to("showcase")
}

target "admin" {
  inherits   = ["_common"]
  dockerfile = "apps/admin/Dockerfile"
  target     = "runner"
  tags       = tag("admin")
  cache-from = cache_from("admin")
  cache-to   = cache_to("admin")
}

target "vionto" {
  inherits   = ["_common"]
  dockerfile = "apps/vionto/Dockerfile"
  target     = "runner"
  tags       = tag("vionto")
  cache-from = cache_from("vionto")
  cache-to   = cache_to("vionto")
}

target "vionto-worker" {
  inherits   = ["_common"]
  dockerfile = "infra/docker/Dockerfile.vionto-worker"
  target     = "runner"
  tags       = tag("vionto-worker")
  cache-from = cache_from("vionto-worker")
  cache-to   = cache_to("vionto-worker")
}

target "edumatch" {
  inherits   = ["_common"]
  dockerfile = "apps/edumatch/Dockerfile"
  target     = "runner"
  tags       = tag("edumatch")
  cache-from = cache_from("edumatch")
  cache-to   = cache_to("edumatch")
}

target "testora-migrator" {
  inherits   = ["_common"]
  dockerfile = "apps/testora/Dockerfile"
  target     = "migrator"
  tags       = tag("testora-migrator")
  cache-from = cache_from("testora-migrator")
  cache-to   = cache_to("testora-migrator")
}

target "testora" {
  inherits   = ["_common"]
  dockerfile = "apps/testora/Dockerfile"
  target     = "runner"
  tags       = tag("testora")
  cache-from = cache_from("testora")
  cache-to   = cache_to("testora")
}

# Isolated test runner (#718, ADR 0004 §5): Node, Chromium, fonts and the
# esbuild runner bundle only — no Next.js build, no workspace node_modules.
target "testora-runner" {
  inherits   = ["_common"]
  dockerfile = "apps/testora/Dockerfile"
  target     = "runner-worker"
  tags       = tag("testora-runner")
  cache-from = cache_from("testora-runner")
  cache-to   = cache_to("testora-runner")
}

target "appbuilder-migrate" {
  inherits   = ["_common"]
  dockerfile = "apps/appbuilder/Dockerfile"
  target     = "migrator"
  tags       = tag("appbuilder-migrate")
  cache-from = cache_from("appbuilder-migrate")
  cache-to   = cache_to("appbuilder-migrate")
}

target "appbuilder-worker" {
  inherits   = ["_common"]
  dockerfile = "apps/appbuilder/Dockerfile"
  target     = "worker"
  tags       = tag("appbuilder-worker")
  cache-from = cache_from("appbuilder-worker")
  cache-to   = cache_to("appbuilder-worker")
}

target "appbuilder" {
  inherits   = ["_common"]
  dockerfile = "apps/appbuilder/Dockerfile"
  target     = "runner"
  tags       = tag("appbuilder")
  cache-from = cache_from("appbuilder")
  cache-to   = cache_to("appbuilder")
}

target "timelineai" {
  inherits   = ["_common"]
  dockerfile = "apps/timelineai/Dockerfile"
  target     = "runner"
  tags       = tag("timelineai")
  cache-from = cache_from("timelineai")
  cache-to   = cache_to("timelineai")
}

target "labs" {
  inherits   = ["_common"]
  dockerfile = "apps/labs/Dockerfile"
  target     = "runner"
  tags       = tag("labs")
  cache-from = cache_from("labs")
  cache-to   = cache_to("labs")
}

target "resumatch-migrate" {
  inherits   = ["_common"]
  dockerfile = "apps/resumatch/Dockerfile"
  target     = "migrator"
  tags       = tag("resumatch-migrate")
  cache-from = cache_from("resumatch-migrate")
  cache-to   = cache_to("resumatch-migrate")
}

target "resumatch" {
  inherits   = ["_common"]
  dockerfile = "apps/resumatch/Dockerfile"
  target     = "runner"
  tags       = tag("resumatch")
  cache-from = cache_from("resumatch")
  cache-to   = cache_to("resumatch")
}

target "tasksai-migrate" {
  inherits   = ["_common"]
  dockerfile = "apps/tasks-ai/Dockerfile"
  target     = "migrator"
  tags       = tag("tasksai-migrate")
  cache-from = cache_from("tasksai-migrate")
  cache-to   = cache_to("tasksai-migrate")
}

target "tasksai-worker" {
  inherits   = ["_common"]
  dockerfile = "apps/tasks-ai/Dockerfile"
  target     = "worker"
  tags       = tag("tasksai-worker")
  cache-from = cache_from("tasksai-worker")
  cache-to   = cache_to("tasksai-worker")
}

target "tasksai" {
  inherits   = ["_common"]
  dockerfile = "apps/tasks-ai/Dockerfile"
  target     = "runner"
  tags       = tag("tasksai")
  cache-from = cache_from("tasksai")
  cache-to   = cache_to("tasksai")
}
