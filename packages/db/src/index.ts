export { prisma } from "./client";

// Alias matching the migration plan's `import { db } from "@asafarim/db"`
export { prisma as db } from "./client";

// Re-export types for convenience
export { PrismaClient, Prisma } from "@prisma/client";
export type {
  User,
  Account,
  Session,
  VerificationToken,
  EmailLoginCode,
  Role,
  Permission,
  UserRole,
  RolePermission,
  AuditLog,
} from "@prisma/client";
