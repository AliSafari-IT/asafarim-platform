// Foundation seed CLI: RBAC permissions, system roles, and an optional first
// admin user (from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD env vars).
//
// This is a thin wrapper. The definitions and the mutation logic live in
// @asafarim/seed-manager so the Admin Console's Seed Data page and this
// command can never drift apart. To change what gets seeded, edit
// packages/seed-manager/src/definitions/foundation.ts.
//
// Usage: pnpm --filter @asafarim/db db:seed

import {
  FOUNDATION_PERMISSIONS,
  FOUNDATION_ROLES,
  seedFoundation,
  validateFoundationDefinitions,
  withPrisma,
} from "@asafarim/seed-manager";

import { resolveCliDatabaseUrl } from "./seed-cli-env";

async function main() {
  const issues = validateFoundationDefinitions().filter((i) => i.severity === "error");
  if (issues.length > 0) {
    for (const issue of issues) console.error(`[${issue.code}] ${issue.message}`);
    throw new Error("Foundation seed definitions are invalid — refusing to seed.");
  }

  await withPrisma(resolveCliDatabaseUrl(), async (prisma) => {
    const result = await seedFoundation(prisma);

    console.log(
      `Permissions: ${FOUNDATION_PERMISSIONS.length} defined ` +
        `(${result.permissions.inserted} created, ${result.permissions.updated} updated).`
    );
    console.log(
      `Roles: ${FOUNDATION_ROLES.length} defined ` +
        `(${result.roles.inserted} created, ${result.roles.updated} updated, ` +
        `${result.roles.grantsInserted} permission grant(s) added).`
    );
    console.log(
      result.admin.skipped
        ? "SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin user."
        : result.admin.inserted > 0
          ? "Seeded admin user with the superadmin role."
          : "Admin user already existed — left untouched."
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
