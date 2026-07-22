import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Badge, ButtonLink, EmptyState, PageHeader } from "@asafarim/ui";
import { renderPreview, type RenderError } from "@asafarim/appbuilder-runtime";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getPinnedPreview } from "@/lib/repositories/previewService";
import { NotFoundError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { PreviewSelectionBridge } from "./PreviewSelectionBridge";

export const metadata: Metadata = { title: "Preview" };

interface PreviewPageProps {
  /**
   * `[[...path]]` — an optional catch-all. `path` is `undefined` for the
   * base `/apps/{appId}/preview` request, and a segment array for any
   * internal preview navigation (`/apps/{appId}/preview/projects`, etc.).
   * `appId` is treated as a fully opaque identifier — never parsed,
   * decoded, or used for anything beyond the authorized lookups below.
   */
  params: Promise<{ appId: string; path?: string[] }>;
  /**
   * `embed=workspace&nonce=...` — set only by the M08 builder workspace's
   * `PreviewPane` when it embeds this route in an iframe for selection
   * support (see PreviewSelectionBridge.tsx). Absent for the standalone
   * preview route, whose behavior is completely unchanged by M08.
   */
  searchParams: Promise<{ embed?: string; nonce?: string }>;
}

/**
 * The M06 metadata-driven preview route. Resolves only the app's pinned,
 * successful preview build (never a version id supplied by the browser),
 * authorizes through the same M03 `app.viewPreview` capability the M01/M05
 * shell already enforced, and renders through
 * `@asafarim/appbuilder-runtime`'s approved registry.
 *
 * Archived apps intentionally still render their last successful preview
 * here — `app.viewPreview` is a read-only capability the M03 policy layer
 * already keeps allowed while archived (see lib/repositories/authz.ts's
 * `ALLOWED_WHILE_ARCHIVED`), so this is a deliberate, documented policy
 * choice, not stale leftover access — see docs/appbuilder-runtime.md.
 */
export default async function AppPreviewPage({ params, searchParams }: PreviewPageProps) {
  const { appId, path = [] } = await params;
  const { embed, nonce } = await searchParams;
  const actor = await requireActor({ callbackUrl: routes.appPreview(appId) });

  let pinned: Awaited<ReturnType<typeof getPinnedPreview>>;
  try {
    pinned = await getPinnedPreview(getDb(), actor, appId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  if (!pinned) {
    // No page-path-specific content exists yet either way — a deep link on
    // an app with no successful preview is the same "not ready yet" state
    // as the base route, not a 404.
    return (
      <>
        <PageHeader kicker="Preview" kickerIndex="04" title="No preview yet" />
        <EmptyState
          title="This app doesn't have a preview yet"
          description="A preview is generated from the app's current specification. Once one succeeds, it renders here."
        />
      </>
    );
  }

  const result = renderPreview({
    specification: pinned.specificationPayload,
    path,
    basePath: routes.appPreview(appId),
  });

  if (!result.ok) {
    // An unresolvable internal path is the generated app's own 404 — it
    // must look like a normal not-found page, never a builder diagnostic.
    if (result.errors.every((error) => error.code === "unknown_page")) {
      notFound();
    }
    return <PreviewDiagnostic appId={appId} errors={result.errors} />;
  }

  return (
    <>
      {embed === "workspace" && nonce ? (
        <PreviewSelectionBridge
          appId={appId}
          specificationVersionNumber={pinned.specificationVersionNumber}
          buildId={pinned.build.id}
          nonce={nonce}
        />
      ) : null}
      {result.element}
    </>
  );
}

/**
 * Shown only for a structural failure other than an unknown page — e.g. the
 * pinned version somehow fails to render fresh (registry downgrade,
 * corruption). Every field here is already a sanitized, structured
 * `RenderError` (code/message/path) from the runtime package — never a raw
 * exception, stack trace, or database value.
 */
function PreviewDiagnostic({ appId, errors }: { appId: string; errors: RenderError[] }) {
  return (
    <>
      <PageHeader kicker="Preview" kickerIndex="04" title="Preview unavailable" />
      <Alert tone="error">
        <strong>This preview couldn&apos;t be rendered.</strong>
        <ul>
          {errors.map((error, index) => (
            <li key={`${error.code}-${index}`}>
              <Badge tone="warning">{error.code}</Badge> {error.message}
            </li>
          ))}
        </ul>
      </Alert>
      <p className="ui-hint">
        This usually means the specification changed in a way the current preview build didn&apos;t
        account for. Requesting a new preview build from the app&apos;s overview page will re-validate it.
      </p>
      <ButtonLink href={routes.appDetail(appId)} variant="secondary">
        Back to app overview
      </ButtonLink>
    </>
  );
}
