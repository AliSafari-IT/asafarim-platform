import { cookies } from "next/headers";
import { DEFAULT_PROJECT_ID } from "@/data/projects";

// The active app/project is kept in a cookie so BOTH server components (the
// Cases/Requirements/Results pages) and the client (the header app badge) read
// the same value — switch once, and every page reflects it.
export const ACTIVE_PROJECT_COOKIE = "e2e_active_project";

/** Read the active project on the server, falling back to the default app. */
export async function getActiveProjectId(): Promise<string> {
  const store = await cookies();
  return store.get(ACTIVE_PROJECT_COOKIE)?.value || DEFAULT_PROJECT_ID;
}
