import type { Metadata } from "next";
import { requireUser } from "@asafarim/auth";
import { WorkbenchImport } from "@/components/import/WorkbenchImport";

const hubUrl = process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || "http://localhost:3001";
const appUrl = process.env.NEXT_PUBLIC_TIMELINEAI_URL || "http://localhost:3010";

export const metadata: Metadata = { title: "Import from the AI Workbench", robots: { index: false, follow: false } };

export default async function WorkbenchImportPage() {
  // Signed-in only: an anonymous visitor is sent to Hub and back here. The
  // callback URL is fixed; nothing from the handoff file is ever in a URL.
  await requireUser({ signInUrl: `${hubUrl}/sign-in`, callbackUrl: `${appUrl}/import/workbench` });
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">Import a timeline from the AI Workbench</h1>
      <p className="mt-2 text-sm opacity-80">
        Choose the handoff file you downloaded from the Text → Cited Timeline tool. You&apos;ll see every event before anything is created, and
        nothing is saved until you confirm.
      </p>
      <WorkbenchImport />
    </div>
  );
}
