import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@asafarim/ui";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getAppOverviewForActor } from "@/lib/repositories/appOverview";
import { roleGrants } from "@/lib/repositories/authz";
import { NotFoundError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { OperationsView } from "./OperationsView";

export const metadata: Metadata = { title: "Launch readiness" };

interface OperationsPageProps {
  params: Promise<{ appId: string }>;
}

/**
 * M12 launch-readiness dashboard — a first-class, top-level page (not a
 * buried workspace tab), per the explicit feedback that M11's deployment UI
 * was too easy to miss. Server-side this route only does the same actor-
 * scoped, leak-safe existence check every other app page does (an unrelated
 * actor gets the identical 404 as a nonexistent app); all the real
 * readiness data is fetched client-side from `GET /api/apps/{appId}/operations`
 * (see OperationsView.tsx), which is itself backed entirely by
 * lib/observability/readiness.ts reading persisted rows — never an
 * optimistic or cached "all green" projection.
 */
export default async function OperationsPage({ params }: OperationsPageProps) {
  const { appId } = await params;
  const actor = await requireActor({
    callbackUrl: `/apps/${encodeURIComponent(appId)}/operations`,
  });

  let overview;
  try {
    overview = await getAppOverviewForActor(getDb(), actor, appId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const { app, role } = overview;
  const canManageCustomDomain = roleGrants(
    role,
    "app.manageCustomDomainRequest"
  );

  return (
    <div
      style={{
        padding: "var(--space-4)",
        display: "grid",
        gap: "var(--space-3)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--space-2)",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--text-lg)" }}>
            Launch readiness — {app.name}
          </h1>
          <p className="ui-hint" style={{ margin: 0 }}>
            Real, persisted operational status. Nothing here is optimistic —
            unknown or unconfigured shows as such.
          </p>
        </div>
        <ButtonLink href={routes.appDetail(appId)} variant="ghost" size="sm">
          Back to workspace
        </ButtonLink>
      </div>

      <OperationsView
        appId={appId}
        canManageCustomDomain={canManageCustomDomain}
      />
    </div>
  );
}
