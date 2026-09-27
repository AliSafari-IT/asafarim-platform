export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { auth, isAdmin } from "@asafarim/auth";
import { db } from "@/db/client";
import { getActiveProjectId } from "@/lib/active-project";
import { WorkbenchImport } from "@/components/import/workbench-import";

export const metadata: Metadata = { title: "Import from the AI Workbench", robots: { index: false, follow: false } };

/**
 * Landing page for the AI Workbench's "Continue in Testora" (#678). The
 * proxy sends signed-out visitors to Hub first. Nothing from the handoff
 * file is ever in a URL.
 */
export default async function WorkbenchImportPage() {
  const [session, activeProjectId, apps] = await Promise.all([
    auth(),
    getActiveProjectId(),
    db.query.projects.findMany({ columns: { id: true, name: true } }),
  ]);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Import a test plan from the AI Workbench</h1>
        <p className="text-muted-foreground">
          Choose the handoff file from the Requirements → Test Plan tool. Each scenario becomes a <strong>pending</strong> scaffold: it runs and fails
          until someone automates it, so nothing here claims a test passed. You&apos;ll see everything before it&apos;s created.
        </p>
      </div>
      <WorkbenchImport apps={apps} defaultAppId={apps.some((a) => a.id === activeProjectId) ? activeProjectId : apps[0]?.id ?? ""} canConfirm={isAdmin(session)} />
    </div>
  );
}
