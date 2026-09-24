export { prisma } from "./client";

// Alias matching the migration plan's `import { db } from "@asafarim/db"`
export { prisma as db } from "./client";

export { pingDb } from "./status";

export { encryptSecret, decryptSecret, isSecretEnvelope } from "./secret-cipher";

export {
  SETTING_DEFINITIONS,
  SETTING_SCOPES,
  SETTING_GROUPS,
  getSettingDefinition,
  isSensitiveSetting,
  isValidValue,
  getEffectiveSettings,
  getEffectiveSetting,
  getSettingOverrides,
  getSetting,
  getBooleanSetting,
  getNumberSetting,
  formatSettingValue,
} from "./settings";
export type {
  SettingValue,
  SettingJsonValue,
  SettingType,
  SettingGroup,
  SettingScope,
  SettingDefinition,
  EffectiveSetting,
} from "./settings";

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
  PlatformSetting,
  EduStudentProfile,
  EduTutorProfile,
  EduBooking,
  EduTransaction,
  Timeline,
  TimelineEvent,
  TimelineModerationEvent,
  TimelineAiProposal,
  TimelineAiEvent,
  TimelineSourceImport,
  TimelineImportedEvent,
} from "@prisma/client";
