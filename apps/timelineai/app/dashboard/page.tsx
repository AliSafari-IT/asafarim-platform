import { requireUser } from "@asafarim/auth";
import { DashboardView } from "@/components/dashboard/DashboardView";

const hubUrl = process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || "http://localhost:3001";
const appUrl = process.env.NEXT_PUBLIC_TIMELINEAI_URL || "http://localhost:3007";

export default async function DashboardPage() {
  await requireUser({
    signInUrl: `${hubUrl}/sign-in`,
    callbackUrl: `${appUrl}/dashboard`,
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your timelines</h1>
        <a
          href="/create"
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 font-medium text-white"
        >
          + New timeline
        </a>
      </div>
      <DashboardView />
    </div>
  );
}
