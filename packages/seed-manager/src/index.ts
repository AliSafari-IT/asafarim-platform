// @asafarim/seed-manager — server-only.
//
// Typed, allowlisted seed-data management shared by the Admin Console and the
// CLI seed scripts. Nothing here is safe to import into a client component:
// providers open database connections and read server-only environment
// variables.

export * from "./contracts";
export * from "./checksums";
export * from "./environments";
export * from "./redaction";
export * from "./registry";
export * from "./safety";

export {
  createPrismaClient,
  withPrisma,
  type SeedPrismaClient,
} from "./prisma-client";

// Definitions — imported by the CLI wrappers in packages/db/prisma.
export * from "./definitions/foundation";
export * from "./definitions/edumatch";
export * from "./definitions/timelineai";

// Reusable seed functions. The CLI entry points are thin wrappers over these,
// so the console and the command line can never drift apart.
export {
  platformFoundationProvider,
  seedFoundation,
  applyPermissions,
  applyRoles,
  applyInitialAdmin,
  validateFoundationDefinitions,
} from "./providers/platform-foundation";

export {
  edumatchProvider,
  seedEdumatch,
  applyStudents,
  applyTutors,
  applyParents,
  applyAdmins,
  applyBookingChain,
  validateEdumatchDefinitions,
} from "./providers/edumatch";

export {
  timelineaiProvider,
  seedTimelineai,
  applyDemoAuthor,
  applyDemoTimeline,
  validateTimelineaiDefinitions,
} from "./providers/timelineai";

export { testoraProvider } from "./providers/testora";
export { appbuilderProvider } from "./providers/appbuilder";
export { createUnavailableProvider } from "./providers/unavailable";
