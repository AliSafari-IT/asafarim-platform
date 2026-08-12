import { notFound } from "next/navigation";
import { getAuthedUser } from "@/lib/server/auth";

/**
 * Shared gate for every page under /admin/business-plan. The admin layout
 * above this route already requires isAdmin() (admin / superadmin /
 * edumatch_admin) — broader than we want here. This adds a stricter check on
 * top: strictly "superadmin", nothing else. A regular admin who guesses the
 * URL gets a 404, not a "forbidden" page that confirms the route exists.
 */
export async function requireSuperAdmin() {
  const user = await getAuthedUser();
  if (!user || !user.roles.includes("superadmin")) {
    notFound();
  }
  return user;
}
