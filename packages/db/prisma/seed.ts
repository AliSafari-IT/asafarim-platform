// Foundation seed: RBAC permissions, system roles, and an optional first
// admin user (from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD env vars).
// Permission/role sets migrated from asafarim-digital, trimmed to the
// foundation groups; product-specific permissions arrive with their apps.

import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// When DATABASE_URL points at the docker-compose service name ("postgres")
// but this script runs on the host (not inside a container), that hostname
// does not resolve. Rewrite it to localhost, which works when the postgres
// port is published (see docker-compose.prod.yml).
function resolveDatabaseUrl(): string {
  const raw =
    process.env.DATABASE_URL ??
    "postgresql://asafarim:asafarim_dev@localhost:5432/asafarim";

  const insideContainer = existsSync("/.dockerenv");
  if (insideContainer) return raw;

  try {
    const url = new URL(raw);
    if (url.hostname === "postgres") {
      url.hostname = "localhost";
      console.log(
        "DATABASE_URL host 'postgres' is not resolvable outside Docker — using localhost instead."
      );
      return url.toString();
    }
  } catch {
    // Fall through with the raw value; Prisma will report a clearer error.
  }
  return raw;
}

const databaseUrl = resolveDatabaseUrl();

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

// ─── Default Permissions ─────────────────────────────────────

const defaultPermissions = [
  // Users
  { name: "users.list", displayName: "List Users", group: "users", description: "View the list of users" },
  { name: "users.view", displayName: "View User", group: "users", description: "View user details" },
  { name: "users.edit", displayName: "Edit User", group: "users", description: "Edit user fields" },
  { name: "users.deactivate", displayName: "Deactivate User", group: "users", description: "Activate or deactivate users" },
  // Roles
  { name: "roles.list", displayName: "List Roles", group: "roles", description: "View the list of roles" },
  { name: "roles.view", displayName: "View Role", group: "roles", description: "View role details and permissions" },
  { name: "roles.edit", displayName: "Edit Role", group: "roles", description: "Create, edit, or delete roles" },
  { name: "roles.assign", displayName: "Assign Role", group: "roles", description: "Assign or remove roles from users" },
  // Content
  { name: "content.list", displayName: "List Content", group: "content", description: "View the list of content sections" },
  { name: "content.view", displayName: "View Content", group: "content", description: "View content details" },
  { name: "content.create", displayName: "Create Content", group: "content", description: "Create new content sections" },
  { name: "content.edit", displayName: "Edit Content", group: "content", description: "Edit content sections" },
  { name: "content.delete", displayName: "Delete Content", group: "content", description: "Delete content sections" },
  { name: "content.publish", displayName: "Publish Content", group: "content", description: "Publish or unpublish content" },
  // Settings
  { name: "settings.list", displayName: "List Settings", group: "settings", description: "View site settings" },
  { name: "settings.view", displayName: "View Settings", group: "settings", description: "View setting details" },
  { name: "settings.edit", displayName: "Edit Settings", group: "settings", description: "Modify site settings" },
  // Audit
  { name: "audit.view", displayName: "View Audit Log", group: "audit", description: "View the audit log" },
  // Profile
  { name: "profile.edit", displayName: "Edit Own Profile", group: "profile", description: "Edit own profile details" },
];

// ─── Default Roles ───────────────────────────────────────────

const defaultRoles = [
  {
    name: "superadmin",
    displayName: "Super Admin",
    description: "Full system access. Bypasses all permission checks.",
    isSystem: true,
    isDefault: false,
    permissions: defaultPermissions.map((p) => p.name),
  },
  {
    name: "admin",
    displayName: "Admin",
    description: "Administrative access with configurable permissions.",
    isSystem: true,
    isDefault: false,
    permissions: [
      "users.list", "users.view", "users.edit", "users.deactivate",
      "roles.list", "roles.view", "roles.edit", "roles.assign",
      "content.list", "content.view", "content.create", "content.edit", "content.delete", "content.publish",
      "settings.list", "settings.view", "settings.edit",
      "audit.view",
      "profile.edit",
    ],
  },
  {
    name: "standard_user",
    displayName: "Standard User",
    description: "Authenticated user with profile editing and content viewing.",
    isSystem: true,
    isDefault: false,
    permissions: ["profile.edit", "content.view"],
  },
  {
    name: "guest",
    displayName: "Guest",
    description: "Default role for new users. Read-only access to public content.",
    isSystem: true,
    isDefault: true,
    permissions: ["content.view"],
  },
];

async function seedPermissions() {
  for (const permission of defaultPermissions) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: {
        displayName: permission.displayName,
        description: permission.description,
        group: permission.group,
      },
      create: permission,
    });
  }
  console.log(`Seeded ${defaultPermissions.length} permissions.`);
}

async function seedRoles() {
  for (const role of defaultRoles) {
    const { permissions, ...roleData } = role;

    const dbRole = await prisma.role.upsert({
      where: { name: role.name },
      update: {
        displayName: roleData.displayName,
        description: roleData.description,
        isSystem: roleData.isSystem,
        isDefault: roleData.isDefault,
      },
      create: roleData,
    });

    for (const permissionName of permissions) {
      const permission = await prisma.permission.findUnique({
        where: { name: permissionName },
      });
      if (!permission) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: dbRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: dbRole.id, permissionId: permission.id },
      });
    }
  }
  console.log(`Seeded ${defaultRoles.length} roles.`);
}

async function seedAdminUser() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      "SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin user."
    );
    return;
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Platform Admin",
      username: "admin",
      emailVerified: new Date(),
      password: await bcrypt.hash(password, 12),
    },
  });

  const superadmin = await prisma.role.findUnique({
    where: { name: "superadmin" },
  });
  if (superadmin) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: superadmin.id } },
      update: {},
      create: { userId: user.id, roleId: superadmin.id },
    });
  }

  console.log(`Seeded admin user ${email} with superadmin role.`);
}

async function main() {
  await seedPermissions();
  await seedRoles();
  await seedAdminUser();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
