import type { NextAuthConfig } from "next-auth";
import { prisma } from "@asafarim/db";
import {
  googleProvider,
  credentialsProvider,
  emailCodeProvider,
} from "./providers";
import { generateUniqueUsername } from "./username";
import "./types";

type AuthUserLike = {
  id?: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

type AuthAccountLike = {
  provider: string;
  providerAccountId: string;
  type?: string;
  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
} | null;

function getCookieDomain(): string | undefined {
  const domain = process.env.AUTH_COOKIE_DOMAIN;
  if (domain) return domain;
  if (process.env.NODE_ENV === "production") return ".asafarim.com";
  // In development, use localhost to share cookies across ports
  return "localhost";
}

/** Assigns a user their first role (the system default) if they have none yet. */
export async function ensureDefaultRole(userId: string) {
  const existingRole = await prisma.userRole.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (existingRole) return;

  const defaultRole = await prisma.role.findFirst({ where: { isDefault: true } });
  if (!defaultRole) return;

  await prisma.userRole.create({
    data: { userId, roleId: defaultRole.id },
  });
}

async function ensureAuthUser(user: AuthUserLike, account?: AuthAccountLike) {
  const accountUser = account
    ? await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
        select: { userId: true },
      })
    : null;

  let dbUser = accountUser
    ? await prisma.user.findUnique({
        where: { id: accountUser.userId },
        include: { userRoles: { select: { role: { select: { name: true } } } } },
      })
    : null;

  if (!dbUser && user.id) {
    dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { userRoles: { select: { role: { select: { name: true } } } } },
    });
  }

  if (!dbUser && user.email) {
    dbUser = await prisma.user.findUnique({
      where: { email: user.email },
      include: { userRoles: { select: { role: { select: { name: true } } } } },
    });
  }

  if (!dbUser && user.email) {
    dbUser = await prisma.user.create({
      data: {
        email: user.email,
        name: user.name ?? null,
        image: user.image ?? null,
        emailVerified: new Date(),
        username: await generateUniqueUsername(
          user.name || user.email.split("@")[0] || "user"
        ),
      },
      include: { userRoles: { select: { role: { select: { name: true } } } } },
    });
  }

  if (!dbUser) return null;

  if (!dbUser.isActive) return dbUser;

  const updates: Record<string, unknown> = {};
  if (!dbUser.username) {
    updates.username = await generateUniqueUsername(
      dbUser.name || dbUser.email?.split("@")[0] || "user"
    );
  }
  if (!dbUser.emailVerified) {
    updates.emailVerified = new Date();
  }
  if (user.name && user.name !== dbUser.name) {
    updates.name = user.name;
  }
  if (user.image && user.image !== dbUser.image) {
    updates.image = user.image;
  }

  if (Object.keys(updates).length > 0) {
    dbUser = await prisma.user.update({
      where: { id: dbUser.id },
      data: updates,
      include: { userRoles: { select: { role: { select: { name: true } } } } },
    });
  }

  if (account) {
    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        },
      },
      update: {
        userId: dbUser.id,
        type: account.type ?? "oauth",
        refresh_token: account.refresh_token ?? undefined,
        access_token: account.access_token ?? undefined,
        expires_at: account.expires_at ?? undefined,
        token_type: account.token_type ?? undefined,
        scope: account.scope ?? undefined,
        id_token: account.id_token ?? undefined,
        session_state: account.session_state ?? undefined,
      },
      create: {
        userId: dbUser.id,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        type: account.type ?? "oauth",
        refresh_token: account.refresh_token ?? undefined,
        access_token: account.access_token ?? undefined,
        expires_at: account.expires_at ?? undefined,
        token_type: account.token_type ?? undefined,
        scope: account.scope ?? undefined,
        id_token: account.id_token ?? undefined,
        session_state: account.session_state ?? undefined,
      },
    });
  }

  await ensureDefaultRole(dbUser.id);

  return prisma.user.findUnique({
    where: { id: dbUser.id },
    include: { userRoles: { select: { role: { select: { name: true } } } } },
  });
}

function applyDbUserToToken(
  token: Record<string, unknown>,
  dbUser: Awaited<ReturnType<typeof ensureAuthUser>>
) {
  if (!dbUser) return;
  token.sub = dbUser.id;
  token.roles = dbUser.userRoles.map(
    (ur: { role: { name: string } }) => ur.role.name
  );
  token.name = dbUser.name;
  token.picture = dbUser.image;
  token.username = dbUser.username;
  token.emailVerified = dbUser.emailVerified?.toISOString() ?? null;
  token.isActive = dbUser.isActive;
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  // `next build` collects page data with NODE_ENV=production but never
  // handles real requests, so a placeholder is safe there.
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return "build-time-placeholder-secret-not-used-at-runtime";
  }
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[auth] AUTH_SECRET not set, using dev-only fallback. Set AUTH_SECRET env var for production."
    );
    return "dev-secret-not-for-production-32-chars-min";
  }
  throw new Error("AUTH_SECRET environment variable is required in production");
}

/** Origins of the platform apps that may receive cross-origin auth callbacks. */
function getTrustedOrigins(): string[] {
  return [
    process.env.NEXT_PUBLIC_WEB_URL,
    process.env.NEXT_PUBLIC_HUB_URL,
    process.env.NEXT_PUBLIC_ADMIN_URL,
    process.env.NEXT_PUBLIC_SHOWCASE_URL,
    process.env.NEXT_PUBLIC_VIONTO_URL,
    process.env.NEXT_PUBLIC_TESTORA_URL,
    process.env.NEXT_PUBLIC_APPBUILDER_URL,
    process.env.NEXT_PUBLIC_API_URL,
  ]
    .filter((u): u is string => Boolean(u))
    .map((u) => new URL(u).origin);
}

export const authConfig: NextAuthConfig = {
  // JWT strategy: no database adapter needed; the jwt callback syncs the
  // token with the database via ensureAuthUser.
  // Getter so the secret is resolved on first request, not at import time
  // (next build imports this module without any env configured).
  get secret() {
    return getAuthSecret();
  },

  providers: [googleProvider, credentialsProvider, emailCodeProvider],

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },

  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        domain: getCookieDomain(),
      },
    },
    callbackUrl: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.callback-url"
          : "authjs.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        domain: getCookieDomain(),
      },
    },
    csrfToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Host-authjs.csrf-token"
          : "authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },

  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },

  callbacks: {
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      if (new URL(url).origin === baseUrl) return url;
      // Allow cross-origin callbacks for trusted platform apps
      try {
        const urlOrigin = new URL(url).origin;
        if (getTrustedOrigins().includes(urlOrigin)) return url;
      } catch {
        // ignore invalid URLs
      }

      return baseUrl;
    },

    async jwt({ token, user, account, trigger }) {
      if (user) {
        const dbUser = await ensureAuthUser(user, account);
        applyDbUserToToken(token, dbUser);
      }

      if (trigger === "update") {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub! },
          select: {
            name: true,
            image: true,
            username: true,
            emailVerified: true,
            isActive: true,
            userRoles: { select: { role: { select: { name: true } } } },
          },
        });

        if (dbUser) {
          token.roles = dbUser.userRoles.map(
            (ur: { role: { name: string } }) => ur.role.name
          );
          token.name = dbUser.name;
          token.picture = dbUser.image;
          token.username = dbUser.username;
          token.emailVerified = dbUser.emailVerified?.toISOString() ?? null;
          token.isActive = dbUser.isActive;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub!;
        session.user.roles = (token.roles as string[]) ?? [];
        session.user.username = (token.username as string | null) ?? null;
        session.user.emailVerified = (
          token.emailVerified ? new Date(token.emailVerified as string) : null
        ) as typeof session.user.emailVerified;
        session.user.isActive = token.isActive as boolean;
        if (typeof token.name === "string" || token.name === null) {
          session.user.name = (token.name as string | null) ?? null;
        }
        if (typeof token.picture === "string" || token.picture === null) {
          session.user.image = (token.picture as string | null) ?? null;
        }
      }
      return session;
    },

    async signIn({ user, account }) {
      // Credentials-type providers (email/password and email-code OTP) return
      // the user directly from authorize(); no need to call ensureAuthUser.
      // Non-credentials providers (Google OAuth, etc.) need account upsert.
      if (account?.type !== "credentials") {
        try {
          const dbUser = await ensureAuthUser(user, account);
          if (!dbUser) {
            console.error(
              "[auth] signIn denied: ensureAuthUser returned null for",
              user.email
            );
            return false;
          }
          user.id = dbUser.id;
          if (!dbUser.isActive) {
            console.error("[auth] signIn denied: user is inactive", user.email);
          }
          return dbUser.isActive;
        } catch (error) {
          console.error("[auth] signIn error in ensureAuthUser:", error);
          return false;
        }
      }

      if (!user) return false;

      // Block deactivated credential users (covers both password and OTP paths)
      if (user.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { isActive: true },
        });
        if (dbUser && !dbUser.isActive) return false;
      }

      return true;
    },
  },

  trustHost: true,

  debug: process.env.NODE_ENV === "development",
};
