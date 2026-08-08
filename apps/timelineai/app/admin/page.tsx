import { requireRole, ROLES } from "@asafarim/auth";
import { AdminView } from "@/components/admin/AdminView";

const hubUrl = process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || "http://localhost:3001";
const appUrl = process.env.NEXT_PUBLIC_TIMELINEAI_URL || "http://localhost:3010";

export default async function AdminPage() {
  // requireRole redirects to Hub sign-in if signed out, and to /denied if
  // signed in without the admin role — the same server-side gate the
  // proxy's roleRoutes config (coarse) is backed up by (fine-grained, here
  // and in every moderation service function).
  await requireRole(ROLES.ADMIN, {
    signInUrl: `${hubUrl}/sign-in`,
    callbackUrl: `${appUrl}/admin`,
    deniedUrl: "/denied",
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-bold">TimelineAI admin</h1>
      <AdminView />
    </div>
  );
}
