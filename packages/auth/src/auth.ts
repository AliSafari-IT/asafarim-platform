import NextAuth from "next-auth";
import { headers } from "next/headers";
import { authConfig } from "./config";

const { handlers, auth, signIn, signOut: nextAuthSignOut } = NextAuth(authConfig);

async function signOut(options: { redirectTo?: string } = {}) {
  const headersList = await headers();
  const host = headersList.get("host") || headersList.get("x-forwarded-host") || "localhost:3001";
  const protocol =
    process.env.NODE_ENV === "production" || headersList.get("x-forwarded-proto") === "https"
      ? "https"
      : "http";
  const currentOrigin = `${protocol}://${host}`;
  const redirectTo = options.redirectTo
    ? options.redirectTo.startsWith("/")
      ? `${currentOrigin}${options.redirectTo}`
      : options.redirectTo
    : currentOrigin;

  return nextAuthSignOut({ redirectTo });
}

export { handlers, auth, signIn, signOut };
