import type { RoadmapItem } from "@asafarim/ui";

const REPO = "https://github.com/AliSafari-IT/asafarim-platform/blob/main";
const DOC = (label: string, file: string, anchor?: string) => ({
  label,
  href: `${REPO}/apps/vionto/docs/${file}${anchor ? `#${anchor}` : ""}`,
});
const ARCHITECTURE = {
  label: "Architecture",
  href: `${REPO}/docs/vionto-architecture.md`,
};
const ISSUE_SPEC = (id: string) =>
  DOC("Issue spec", "roadmap.md", id.toLowerCase());

/**
 * Evidence-led status from docs/vionto-architecture.md and the checked-in
 * routes, worker, schema, and UI. "Shipped" means the end-to-end capability
 * exists; known gaps stay visible as in-progress milestones or issue cards.
 */
export const roadmapItems: RoadmapItem[] = [
  {
    id: "M0",
    title: "Platform foundation & shared identity",
    status: "shipped",
    timeframe: "Foundation",
    summary:
      "Vionto runs as a Next.js application and separate BullMQ/FFmpeg worker inside the ASafarIM monorepo, with shared Hub SSO, PostgreSQL, Redis, object storage, health endpoints, and production container wiring.",
    tags: ["platform", "infra"],
    links: [ARCHITECTURE],
  },
  {
    id: "M1",
    title: "Projects, albums & non-destructive organization",
    status: "shipped",
    summary:
      "Projects own source media; base and derived albums provide independent selection, order, lifecycle, metadata, favorites, and date/location organization without duplicating image objects.",
    tags: ["media", "data model"],
    links: [ARCHITECTURE],
  },
  {
    id: "M2",
    title: "AI-assisted story & narration workflow",
    status: "shipped",
    summary:
      "Vision captions, structured story generation, editable narration and subtitles, multiple TTS providers, BYOK credential encryption, and provider fallbacks form a working album-to-story path.",
    highlights: [
      "Provider-neutral interfaces are in place; deeper album analysis and scene planning remain future phases",
    ],
    tags: ["ai", "audio"],
    links: [DOC("AI architecture", "ai-architecture.md")],
  },
  {
    id: "M3",
    title: "Deterministic video render & export",
    status: "shipped",
    summary:
      "Server-built render manifests, a Redis queue, an isolated worker, FFmpeg motion/effects, subtitle burn-in, progress events, private downloads, export metadata, and retry classification deliver narrated MP4 output.",
    tags: ["render", "worker"],
    links: [ARCHITECTURE],
  },
  {
    id: "M4",
    title: "Creator library, versions & integrations",
    status: "in-progress",
    timeframe: "Beta hardening",
    summary:
      "The album dashboard, organizer, templates, video versions, Google Photos Picker, music library, sharing, and optional AI motion clips are present. Shared-editor traversal and several deployment integrations still need production completion.",
    tags: ["ux", "integrations"],
    links: [DOC("Google Photos design", "google-photos-import.md")],
  },
  {
    id: "M5",
    title: "Operational safety & production controls",
    status: "in-progress",
    timeframe: "Current gap",
    summary:
      "Vionto has support lookup and retention endpoints plus audit, usage, and quota tables, but primary workflows do not yet meter quotas or populate the domain audit trail. Admin checks are duplicated and inconsistent, and there is no protected operations UI.",
    highlights: [
      "Current retention/support endpoints accept admin but accidentally reject superadmin",
      "The in-process permission cache has no TTL or invalidation",
    ],
    tags: ["security", "operations"],
    links: [DOC("Review findings", "roadmap.md", "review-findings")],
  },

  // Superadmin workstream. Stable VSA ids map one-to-one to the issue-ready
  // specifications in docs/roadmap.md until tracker numbers are assigned.
  {
    id: "VSA-000",
    title: "Epic — reusable Vionto superadmin area",
    status: "planned",
    timeframe: "Tracking epic",
    summary:
      "Deliver a least-privilege Vionto operations console, validate it against the real media pipeline, then extract only the proven authorization, navigation, audit, and safety contracts for future ASafarIM apps.",
    tags: ["epic", "admin", "shared"],
    links: [ISSUE_SPEC("VSA-000")],
  },
  {
    id: "VSA-001",
    title: "Approve the Vionto privileged-access policy",
    status: "planned",
    timeframe: "Gate 0",
    summary:
      "Record the threat model and exact allow rule: a platform superadmin, or an admin whose normalized verified account email is asafarim@gmail.com. Email alone never grants access; inactive users fail closed.",
    tags: ["security", "decision"],
    links: [ISSUE_SPEC("VSA-001")],
  },
  {
    id: "VSA-002",
    title: "Build a reusable app-admin authorization guard",
    status: "planned",
    timeframe: "Gate 0",
    summary:
      "Add one server-only policy primitive in the shared auth package for page, route-handler, and server-action use, with typed denial results and configurable allowlisted admin emails for future apps.",
    tags: ["auth", "shared"],
    links: [ISSUE_SPEC("VSA-002")],
  },
  {
    id: "VSA-003",
    title: "Seed Vionto permissions and remove stale local auth logic",
    status: "planned",
    summary:
      "Define view, support, render, retention, usage, provider, settings, and audit permissions in the foundation seed; replace Vionto's unbounded process cache and duplicated role queries with the shared policy.",
    tags: ["rbac", "data"],
    links: [ISSUE_SPEC("VSA-003")],
  },
  {
    id: "VSA-004",
    title: "Create the protected superadmin shell",
    status: "planned",
    timeframe: "UI foundation",
    summary:
      "Add a route-group layout, denied state, responsive side navigation, role-aware entry points, and direct-route protection. The shell advertises modules, but every page and API remains independently guarded.",
    tags: ["admin", "ux"],
    links: [ISSUE_SPEC("VSA-004")],
  },
  {
    id: "VSA-005",
    title: "Operations overview & service health",
    status: "planned",
    summary:
      "Surface safe aggregates for users, projects, storage, exports, render states, queue depth, worker freshness, and provider availability without exposing credentials, object keys, raw prompts, or customer media.",
    tags: ["operations", "observability"],
    links: [ISSUE_SPEC("VSA-005")],
  },
  {
    id: "VSA-006",
    title: "User and project support explorer",
    status: "planned",
    summary:
      "Turn the lookup endpoint into a paginated, privacy-minimized support surface with exact account lookup, project/render/export summaries, permission-scoped detail, reason capture, and audited access.",
    tags: ["support", "privacy"],
    links: [ISSUE_SPEC("VSA-006")],
  },
  {
    id: "VSA-007",
    title: "Render queue operations & safe retry",
    status: "planned",
    summary:
      "Provide failed/stalled job inspection, cancellation, and idempotent retry from a persisted trusted manifest. Replace the current retry route's empty-assets placeholder and reconcile queue state with database state.",
    tags: ["render", "reliability"],
    links: [ISSUE_SPEC("VSA-007")],
  },
  {
    id: "VSA-008",
    title: "Usage, quota & provider controls",
    status: "planned",
    summary:
      "Meter upload, storage, AI, TTS, generated-video, render, and export usage; reserve costly capacity before work starts; expose plan usage; and provide audited provider kill switches and routing controls.",
    tags: ["cost", "ai", "quota"],
    links: [ISSUE_SPEC("VSA-008")],
  },
  {
    id: "VSA-009",
    title: "Retention and object-storage reconciliation",
    status: "planned",
    summary:
      "Replace manual age-only deletion with previewable policy evaluation, complete relational cleanup, object-store deletion, orphan detection, resumable batches, legal holds, and an auditable result report.",
    tags: ["storage", "privacy"],
    links: [ISSUE_SPEC("VSA-009")],
  },
  {
    id: "VSA-010",
    title: "Domain audit trail and review console",
    status: "planned",
    summary:
      "Write redacted Vionto audit events for privileged reads and mutations plus project, media, AI, render, export, and worker transitions; add filters and a permission-gated export.",
    tags: ["audit", "security"],
    links: [ISSUE_SPEC("VSA-010")],
  },
  {
    id: "VSA-011",
    title: "Authorization, privacy & recovery verification",
    status: "planned",
    timeframe: "Release gate",
    summary:
      "Prove the complete role/email matrix at page and API boundaries, cover IDOR and CSRF cases, redact logs, exercise destructive confirmations, and rehearse rollback and last-operator recovery.",
    tags: ["tests", "security"],
    links: [ISSUE_SPEC("VSA-011")],
  },
  {
    id: "VSA-012",
    title: "Extract the reusable application-admin kit",
    status: "exploring",
    timeframe: "After Vionto validation",
    summary:
      "Package the proven guard, shell contracts, module registry, audit helpers, destructive-action patterns, and adoption guide so another ASafarIM app can add a least-privilege admin area without copying Vionto code.",
    tags: ["shared", "developer experience"],
    links: [ISSUE_SPEC("VSA-012")],
  },
];
