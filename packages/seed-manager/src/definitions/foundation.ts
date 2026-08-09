// Foundation seed definitions: RBAC permissions, system roles, the
// role→permission grid, and an optional first admin user.
//
// This file is the single source of truth. `packages/db/prisma/seed.ts` is a
// thin CLI wrapper over the same functions the Admin provider calls, so the
// two can never drift.

export interface PermissionDefinition {
  name: string;
  displayName: string;
  group: string;
  description: string;
}

export interface RoleDefinition {
  name: string;
  displayName: string;
  description: string;
  isSystem: boolean;
  isDefault: boolean;
  permissions: string[];
}

/**
 * Bump when the definitions below change in a way operators should notice.
 * The checksum catches every change; this string is what humans read.
 */
export const FOUNDATION_DEFINITION_VERSION = "2.0.0";

export const FOUNDATION_PERMISSIONS: PermissionDefinition[] = [
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
  // Seed data management (Admin Console → Seed Data)
  {
    name: "seeds.view",
    displayName: "View Seed Data",
    group: "seeds",
    description: "View seed providers, status, dry-run plans, validation results and operation history",
  },
  {
    name: "seeds.execute",
    displayName: "Run Seed Operations",
    group: "seeds",
    description: "Run seed and reconcile operations in permitted non-production environments",
  },
  {
    name: "seeds.remove",
    displayName: "Remove Seeded Data",
    group: "seeds",
    description: "Remove seed-owned records. Never applies to the protected platform foundation",
  },
  {
    name: "seeds.schedule",
    displayName: "Schedule Seed Validation",
    group: "seeds",
    description: "Create, pause, edit or delete scheduled (read-only) seed validation",
  },
];

/**
 * Permissions no role may lose through reconciliation and that removal can
 * never touch. Guarded structurally in the provider, not just by policy.
 */
export const SECURITY_CRITICAL_PERMISSIONS = new Set([
  "roles.edit",
  "roles.assign",
  "users.edit",
  "users.deactivate",
  "settings.edit",
  "seeds.remove",
]);

const ADMIN_PERMISSIONS = [
  "users.list", "users.view", "users.edit", "users.deactivate",
  "roles.list", "roles.view", "roles.edit", "roles.assign",
  "content.list", "content.view", "content.create", "content.edit", "content.delete", "content.publish",
  "settings.list", "settings.view", "settings.edit",
  "audit.view",
  "profile.edit",
  // Admins can look at seed data and run non-destructive work. Removing
  // seeded data and scheduling are granted deliberately, not by default.
  "seeds.view", "seeds.execute",
];

export const FOUNDATION_ROLES: RoleDefinition[] = [
  {
    name: "superadmin",
    displayName: "Super Admin",
    description: "Full system access. Bypasses all permission checks.",
    isSystem: true,
    isDefault: false,
    permissions: FOUNDATION_PERMISSIONS.map((p) => p.name),
  },
  {
    name: "admin",
    displayName: "Admin",
    description: "Administrative access with configurable permissions.",
    isSystem: true,
    isDefault: false,
    permissions: ADMIN_PERMISSIONS,
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

/** Everything that feeds the definition checksum for this provider. */
export const FOUNDATION_DEFINITIONS = {
  version: FOUNDATION_DEFINITION_VERSION,
  permissions: FOUNDATION_PERMISSIONS,
  roles: FOUNDATION_ROLES,
};
