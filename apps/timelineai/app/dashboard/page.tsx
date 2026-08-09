import { requireUser } from "@asafarim/auth";
import { ButtonLink } from "@asafarim/ui";
import { DashboardView } from "@/components/dashboard/DashboardView";

const hubUrl = process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || "http://localhost:3001";
const appUrl = process.env.NEXT_PUBLIC_TIMELINEAI_URL || "http://localhost:3010";

export default async function DashboardPage() {
  await requireUser({
    signInUrl: `${hubUrl}/sign-in`,
    callbackUrl: `${appUrl}/dashboard`,
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your timelines</h1>
        {/* ButtonLink, not a raw Tailwind-styled <a> — see app/page.tsx for
            why text-white on an <a> silently loses to @asafarim/ui's
            unlayered `a { color }` base rule. */}
        <ButtonLink href="/create" variant="primary" size="sm">
          + New timeline
        </ButtonLink>
      </div>
      <DashboardView />
    </div>
  );
}
