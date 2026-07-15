import { auth } from "@asafarim/auth";
import { prisma } from "@asafarim/db";
import { NextResponse } from "next/server";

export type AuthedUser = {
  email: string;
  id: string;
  roles: string[];
};

// ─── Permission Cache ────────────────────────────────────────────
// Simple in-memory cache to avoid repeated DB queries per request.
// In production with serverless, this is per-request; with long-running
// Node.js, consider TTL or Redis.
let _permissionCache: Map<string, string[]> = new Map();

/**
 * Load user permissions from DB by resolving all roles → permissions.
 * Superadmin bypasses this entirely.
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const cached = _permissionCache.get(userId);
  if (cached) return cached;

  const userWithRoles = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      userRoles: {
        select: {
          role: {
            select: {
              name: true,
              rolePermissions: {
                select: {
                  permission: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!userWithRoles) return [];

  const roleNames = userWithRoles.userRoles.map((ur) => ur.role.name);
  if (roleNames.includes("superadmin")) return ["*"];

  const permissions = new Set<string>();
  for (const ur of userWithRoles.userRoles) {
    for (const rp of ur.role.rolePermissions) {
      permissions.add(rp.permission.name);
    }
  }

  const result = Array.from(permissions);
  _permissionCache.set(userId, result);
  return result;
}

/**
 * Check if a user has a specific Vionto permission.
 * Superadmin (*) always passes.
 */
export function hasPermission(permissions: string[], permission: string): boolean {
  if (permissions.includes("*")) return true;
  return permissions.includes(permission);
}

/**
 * Server-side guard: require auth + specific Vionto permission.
 * Returns the user if authorized, throws otherwise.
 */
export async function requireViontoPermission(permission: string): Promise<AuthedUser> {
  const user = await getAuthedUser();
  if (!user) throw new Error("Unauthorized");

  const permissions = await getUserPermissions(user.id);
  if (!hasPermission(permissions, permission)) {
    throw new Error(`Forbidden: missing permission '${permission}'`);
  }

  return user;
}

/**
 * Convenience: check if user is a Vionto admin (has any admin permission).
 */
export async function isViontoAdmin(userId: string): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return hasPermission(permissions, "vionto.admin.system_settings");
}

export async function getAuthedUser(): Promise<AuthedUser | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const email = session.user.email ?? "";

  try {
    const existingById = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, userRoles: { select: { role: { select: { name: true } } } } },
    });
    if (existingById) {
      return {
        id: existingById.id,
        email: existingById.email,
        roles: existingById.userRoles.map((item) => item.role.name),
      };
    }

    if (email) {
      const existingByEmail = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, userRoles: { select: { role: { select: { name: true } } } } },
      });
      if (existingByEmail) {
        return {
          id: existingByEmail.id,
          email: existingByEmail.email,
          roles: existingByEmail.userRoles.map((item) => item.role.name),
        };
      }

      const created = await prisma.user.create({
        data: {
          id: userId,
          email,
          name: session.user.name ?? null,
          image: session.user.image ?? null,
          emailVerified: session.user.emailVerified ? new Date(session.user.emailVerified) : null,
        },
        select: { id: true, email: true },
      });
      return {
        id: created.id,
        email: created.email,
        roles: session.user.roles ?? [],
      };
    }
  } catch (error) {
    console.error("[vionto][auth] failed to resolve database user", error);
  }

  return {
    id: userId,
    email,
    roles: session.user.roles ?? [],
  };
}

export async function requireAuth(): Promise<AuthedUser> {
  const user = await getAuthedUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden(message = "Forbidden"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverError(scope: string, error: unknown): NextResponse {
  console.error(`[vionto][${scope}]`, error);
  const isDev = process.env.NODE_ENV !== "production";
  return NextResponse.json(
    {
      error: "Internal server error",
      ...(isDev
        ? { scope, message: error instanceof Error ? error.message : String(error) }
        : {}),
    },
    { status: 500 },
  );
}
