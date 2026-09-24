/**
 * Client-safe constants split out of service.ts (which has `import
 * "server-only"` at its top, and therefore cannot be imported — even for
 * just a value like this — from any Client Component). ApplicationRow.tsx
 * needs this enum to render the status <select>; it must not also pull in
 * service.ts's Prisma-backed functions.
 */
export const APPLICATION_STATUSES = ["SAVED", "APPLIED", "INTERVIEWING", "OFFER", "REJECTED"] as const;
export type ApplicationStatusName = (typeof APPLICATION_STATUSES)[number];
