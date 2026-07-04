import type { DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

/**
 * Extend Auth.js types to include RBAC roles and platform user fields.
 * Importing "@asafarim/auth" anywhere in an app pulls these augmentations in.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: string[];
      username: string | null;
      emailVerified: string | null;
      isActive: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    roles?: string[];
    username?: string | null;
    emailVerified?: Date | null;
    isActive?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    roles?: string[];
    username?: string | null;
    emailVerified?: string | null;
    isActive?: boolean;
  }
}
