import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Badge, ButtonLink, EmptyState, PageHeader } from "@asafarim/ui";
import { renderPreview, resolveBranding, resolveHomePage, resolvePageByPath, type RenderError, type ResolvedNavItem } from "@asafarim/appbuilder-runtime";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getPinnedPreview } from "@/lib/repositories/previewService";
import { assertCapability } from "@/lib/repositories/authz";
import { NotFoundError } from "@/lib/errors";
import { resolveRuntimeContext, canViewPage, listPermittedPageIds, NotAMemberError, type RuntimeContext } from "@/lib/generated-data/runtimeAuth";
import { routes } from "@/lib/routes";
import { PreviewSelectionBridge } from "./PreviewSelectionBridge";
import { LiveShell } from "./live/LiveShell";
import { SeedDemoDataButton } from "./live/SeedDemoDataButton";

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
   * preview route.
   *
   * `mode=live` and `simulateRoleId=...` — M09 additions, see this file's
   * main docstring below for the full route-selection contract. Neither
   * affects the M06 demo path (`embed`'s existing behavior is unchanged).
   */
  searchParams: Promise<{ embed?: string; nonce?: string; mode?: string; simulateRoleId?: string }>;
}

/**
 * The generated-app preview route — serves THREE distinct audiences at the
 * exact same `/apps/{appId}/preview[/...path]` URL, since M09 requires
 * preserving this route unchanged rather than adding a separate one:
 *
 * 1. BUILDER DEMO MODE (default, unchanged from M06): an AppBuilder
 *    collaborator (`app.viewPreview`) sees `renderPreview`'s server-rendered,
 *    demo-data-only preview — forms permanently disabled, no persistence.
 * 2. BUILDER LIVE MODE (`?mode=live`, or automatically for a platform user
 *    who is a generated-app member but NOT a collaborator on this app):
 *    real fetched/mutated data through the M09 runtime API, rendered by the
 *    `live/` Client Component tree (LiveShell). A collaborator who is not
 *    yet a generated-app member sees a "seed demo data" affordance instead
 *    (see the `NotAMemberError` branch below) rather than a dead end.
 * 3. BUILDER ROLE SIMULATION (`?simulateRoleId=...`): only reachable by an
 *    actor who ALREADY holds real builder `app.viewPreview` capability
 *    (proven by `getPinnedPreview` succeeding below) — renders the SAME
 *    live tree under a fabricated role, clearly labelled "Viewing as: X
 *    (simulated)". Never touches real membership; every API call this mode
 *    makes carries `?simulateRoleId=`, which the server independently
 *    re-verifies builder capability for on every request (never trusted
 *    from a client-set flag alone) — see routeHelpers.ts.
 *
 * A genuine generated-app end user (a platform SSO principal with real
 * M09 membership but no M03 collaborator rank on this app at all) always
 * gets live mode automatically — they have no reason to see, and could not
 * meaningfully use, the demo/builder-only affordances.
 */
export default async function AppPreviewPage({ params, searchParams }: PreviewPageProps) {
  const { appId, path = [] } = await params;
  const { embed, nonce, mode, simulateRoleId } = await searchParams;
  const actor = await requireActor({ callbackUrl: routes.appPreview(appId) });
  const db = getDb();

  let pinned: Awaited<ReturnType<typeof getPinnedPreview>>;
  let isBuilder = true;
  try {
    pinned = await getPinnedPreview(db, actor, appId);
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
    isBuilder = false;
    pinned = null;
  }

  // ── Not a builder collaborator at all: this can only ever be a real
  // generated-app end user now. Any failure here (app doesn't exist, no
  // pinned preview yet, or genuinely not a member) renders the identical
  // not-found page — never distinguishing "you're not a member" from
  // "this app doesn't exist" to someone with zero relationship to it.
  if (!isBuilder) {
    let ctx: RuntimeContext;
    try {
      ctx = await resolveRuntimeContext(db, actor, appId);
    } catch (err) {
      if (err instanceof NotFoundError) notFound();
      throw err;
    }
    return renderLiveOrAccessDenied({ appId, ctx, path, isEndUser: true });
  }

  // ── Builder role simulation — already proven real app.viewPreview above.
  if (simulateRoleId) {
    if (!pinned) return <NoPreviewYetPanel />;
    const ctx = await resolveRuntimeContext(db, actor, appId, { simulateRoleId });
    return renderLiveOrAccessDenied({ appId, ctx, path, isEndUser: false });
  }

  // ── Builder-requested live mode.
  if (mode === "live") {
    if (!pinned) return <NoPreviewYetPanel />;
    try {
      const ctx = await resolveRuntimeContext(db, actor, appId);
      return renderLiveOrAccessDenied({ appId, ctx, path, isEndUser: false });
    } catch (err) {
      if (err instanceof NotAMemberError) {
        let canSeedDemoData = false;
        try {
          await assertCapability(db, actor, appId, "app.resetGeneratedData");
          canSeedDemoData = true;
        } catch {
          // Not editor-rank — no seed affordance, just the explanation below.
        }
        return <NotAMemberPanel appId={appId} canSeedDemoData={canSeedDemoData} />;
      }
      throw err;
    }
  }

  // ── Default: the unchanged M06 demo path.
  if (!pinned) {
    // No page-path-specific content exists yet either way — a deep link on
    // an app with no successful preview is the same "not ready yet" state
    // as the base route, not a 404.
    return <NoPreviewYetPanel />;
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
      ) : (
        <p className="ab-hint" style={{ padding: "0 1.5rem" }}>
          Viewing demo data.{" "}
          <a href={`${routes.appPreview(appId)}?mode=live`}>Switch to live data →</a>
        </p>
      )}
      {result.element}
    </>
  );
}

/** Shared resolution for both live-mode builder branches and the automatic end-user branch — resolves the requested page, enforces `canViewPage` (page-level RBAC), and hands off to the live Client Component tree. */
function renderLiveOrAccessDenied({ appId, ctx, path, isEndUser }: { appId: string; ctx: RuntimeContext; path: string[]; isEndUser: boolean }) {
  const page = resolvePageByPath(ctx.spec, path);
  if (!page) notFound();
  if (!canViewPage(ctx, page.id)) {
    return (
      <>
        <PageHeader kicker="Preview" kickerIndex="04" title="Not permitted" />
        <Alert tone="error">You don&apos;t have access to this page with your current role.</Alert>
      </>
    );
  }

  const branding = resolveBranding(ctx.spec.branding, ctx.spec.app.name);
  const isHomePage = page.id === resolveHomePage(ctx.spec)?.id;
  const navItems = buildPermittedNavItems(ctx, routes.appPreview(appId), page.id);

  return (
    <LiveShell
      appId={appId}
      spec={ctx.spec}
      roleIds={ctx.roleIds}
      simulated={ctx.simulated}
      simulateRoleId={ctx.simulated ? ctx.roleIds[0] : undefined}
      isEndUser={isEndUser}
      branding={branding}
      navItems={navItems}
      page={page}
      isHomePage={isHomePage}
    />
  );
}

/** Role-aware nav — unlike `@asafarim/appbuilder-runtime`'s `buildNavItems` (M06, deliberately not role-gated — see its docstring), this drops any item whose target page isn't in `listPermittedPageIds(ctx)`, since live mode has a real generated-app role to gate against. */
function buildPermittedNavItems(ctx: RuntimeContext, basePath: string, activePageId: string): ResolvedNavItem[] {
  const permitted = new Set(listPermittedPageIds(ctx));
  return [...ctx.spec.navigation]
    .sort((a, b) => a.order - b.order)
    .flatMap((item) => {
      const page = ctx.spec.pages.find((candidate) => candidate.id === item.targetPageId && !candidate.archived);
      if (!page || !permitted.has(page.id)) return [];
      return [
        {
          id: item.id,
          label: item.label,
          path: page.path.length > 0 ? `${basePath}/${page.path}` : basePath,
          active: page.id === activePageId,
        },
      ];
    });
}

function NoPreviewYetPanel() {
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

function NotAMemberPanel({ appId, canSeedDemoData }: { appId: string; canSeedDemoData: boolean }) {
  return (
    <>
      <PageHeader kicker="Preview" kickerIndex="04" title="No generated-app data yet" />
      <EmptyState
        title="You're not a member of this generated app yet"
        description={
          canSeedDemoData
            ? "Seed deterministic demo data to bootstrap yourself as the first administrator and try the app with real records."
            : "Ask this app's owner to seed demo data or add you as a generated-app member."
        }
      />
      {canSeedDemoData ? <SeedDemoDataButton appId={appId} /> : null}
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
