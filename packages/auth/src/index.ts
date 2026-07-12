import "./types";

export { handlers, auth, signIn, signOut } from "./auth";
export { authConfig, ensureDefaultRole } from "./config";
export { hashPassword, verifyPassword } from "./providers";
export { ROLES, hasRole, isAdmin, type RoleName } from "./roles";
export { hasPermission, getUserPermissions } from "./permissions";
export { getSession, requireUser, requireRole } from "./session";
export { generateUniqueUsername, slugifyUsername } from "./username";
export { requestEmailLoginCode, type RequestCodeResult } from "./email-code";
export {
  registerUser,
  RegisterInputSchema,
  type RegisterInput,
  type RegisterResult,
} from "./register";
export {
  listUserLocations,
  createUserLocation,
  updateUserLocation,
  deleteUserLocation,
  CreateLocationInputSchema,
  UpdateLocationInputSchema,
  type CreateLocationInput,
  type UpdateLocationInput,
} from "./locations";
export {
  updateUserProfile,
  changePassword,
  UpdateProfileInputSchema,
  ChangePasswordInputSchema,
  type UpdateProfileInput,
  type ChangePasswordInput,
} from "./profile";
