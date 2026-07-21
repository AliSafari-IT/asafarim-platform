import type { Metadata } from "next";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from "@asafarim/ui";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listCatalogForActor, type CatalogResult } from "@/lib/repositories/apps";
import { listCatalogMetadata, type CatalogCardMetadata } from "@/lib/repositories/appOverview";
import { STARTER_FAMILY_LABELS, type StarterFamily } from "@/lib/validation/createApp";
import {
  CATALOG_PAGE_SIZE,
  catalogHref,
  normalizeCatalogQuery,
  type RawCatalogSearchParams,
} from "@/lib/validation/catalogQuery";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "Apps" };

interface AppsPageProps {
  searchParams: Promise<RawCatalogSearchParams>;
}

async function loadCatalog(
  actor: Awaited<ReturnType<typeof requireActor>>,
  query: ReturnType<typeof normalizeCatalogQuery>,
): Promise<{ result: CatalogResult; metadata: Map<string, CatalogCardMetadata> } | null> {
  try {
    const db = getDb();
    const result = await listCatalogForActor(db, actor, query);
    const metadata = await listCatalogMetadata(
      db,
      result.rows.map((row) => row.app.id),
    );
    return { result, metadata };
  } catch (err) {
    console.error("[appbuilder][apps]", err);
    return null;
  }
}

function formatDateTime(date: Date): string {
  return new Date(date).toISOString().slice(0, 16).replace("T", " ");
}

function roleLabel(role: "owner" | "editor" | "viewer"): string {
  return role === "owner" ? "Owner" : role === "editor" ? "Editor" : "Viewer";
}

function roleTone(role: "owner" | "editor" | "viewer"): "info" | "success" | "neutral" {
  return role === "owner" ? "success" : role === "editor" ? "info" : "neutral";
}

export default async function AppsPage({ searchParams }: AppsPageProps) {
  const actor = await requireActor({ callbackUrl: "/apps" });
  const rawParams = await searchParams;
  const query = normalizeCatalogQuery(rawParams);

  const loaded = await loadCatalog(actor, query);

  return (
    <>
      <PageHeader
        kicker="Catalog"
        kickerIndex="01"
        title="Your apps"
        description="Every application you own or collaborate on, with its current draft version and status."
      />

      {loaded === null ? (
        <EmptyState
          glyph="[db]"
          title="Database unreachable"
          description="The app catalog could not be loaded. Check the database connection and reload."
        />
      ) : (
        <CatalogBody
          query={query}
          result={loaded.result}
          metadata={loaded.metadata}
          isFirstTimeUser={
            query.status === "active" &&
            query.access === "all" &&
            !query.search &&
            loaded.result.totalCount === 0 &&
            query.page === 1
          }
        />
      )}
    </>
  );
}

function CatalogBody({
  query,
  result,
  metadata,
  isFirstTimeUser,
}: {
  query: ReturnType<typeof normalizeCatalogQuery>;
  result: CatalogResult;
  metadata: Map<string, CatalogCardMetadata>;
  isFirstTimeUser: boolean;
}) {
  const hasFiltersApplied =
    !!query.search || query.status !== "active" || query.access !== "all";

  if (isFirstTimeUser) {
    return (
      <EmptyState
        glyph="[ + ]"
        title="No applications yet"
        description="Start one from a plain-language description. It creates a draft you can continue configuring."
        action={<ButtonLink href={routes.newApp()}>Start a new app</ButtonLink>}
      />
    );
  }

  return (
    <>
      <form
        method="GET"
        action="/apps"
        style={{
          display: "flex",
          gap: "var(--space-3)",
          flexWrap: "wrap",
          alignItems: "flex-end",
          marginBottom: "var(--space-4)",
        }}
      >
        <div style={{ flex: "1 1 16rem", maxWidth: "26rem" }}>
          <label htmlFor="catalog-search" className="ui-label">
            Search
          </label>
          <Input
            id="catalog-search"
            type="search"
            name="q"
            defaultValue={query.search ?? ""}
            placeholder="Search name or description…"
          />
        </div>
        <div>
          <label htmlFor="catalog-status" className="ui-label">
            Status
          </label>
          <Select
            id="catalog-status"
            name="status"
            defaultValue={query.status}
            options={[
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
              { value: "all", label: "All" },
            ]}
          />
        </div>
        <div>
          <label htmlFor="catalog-access" className="ui-label">
            Access
          </label>
          <Select
            id="catalog-access"
            name="access"
            defaultValue={query.access}
            options={[
              { value: "all", label: "Owned + shared" },
              { value: "owned", label: "Owned by me" },
              { value: "shared", label: "Shared with me" },
            ]}
          />
        </div>
        <div>
          <label htmlFor="catalog-sort" className="ui-label">
            Sort by
          </label>
          <Select
            id="catalog-sort"
            name="sort"
            defaultValue={query.sort}
            options={[
              { value: "updated", label: "Recently updated" },
              { value: "created", label: "Created date" },
              { value: "name", label: "Name" },
            ]}
          />
        </div>
        <Button type="submit" variant="console" size="sm">
          Apply
        </Button>
        {hasFiltersApplied ? (
          <ButtonLink href="/apps" variant="ghost" size="sm">
            Reset
          </ButtonLink>
        ) : null}
      </form>

      {result.rows.length === 0 ? (
        <EmptyState
          glyph="[ ? ]"
          title="No matching apps"
          description="Nothing matches this search/filter combination. Try broadening your filters or clearing the search."
          action={
            <ButtonLink href="/apps" variant="secondary">
              Clear filters
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div
            className="ui-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))",
              gap: "var(--space-4)",
              marginBottom: "var(--space-5)",
            }}
          >
            {result.rows.map(({ app, role }) => {
              const meta = metadata.get(app.id) ?? null;
              const hasPreview = meta?.previewStatus === "succeeded";
              return (
                <Card key={app.id} variant="elevated">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", alignItems: "flex-start" }}>
                    <h3 style={{ margin: 0 }}>
                      <a href={routes.appDetail(app.id)}>{app.name}</a>
                    </h3>
                    <Badge tone={roleTone(role)}>{roleLabel(role)}</Badge>
                  </div>
                  {app.description ? <p>{app.description}</p> : <p className="u-muted">No description yet.</p>}
                  <div className="ui-chips" style={{ marginBottom: "var(--space-3)" }}>
                    <Badge tone={app.status === "active" ? "success" : "warning"}>
                      {app.status === "active" ? "Active" : "Archived"}
                    </Badge>
                    {meta && meta.currentVersionNumber > 0 ? (
                      <Badge tone="neutral">Draft v{meta.currentVersionNumber}</Badge>
                    ) : null}
                    {meta?.starterFamily ? (
                      <Badge tone="neutral">{STARTER_FAMILY_LABELS[meta.starterFamily as StarterFamily]}</Badge>
                    ) : null}
                    {meta?.previewStatus ? (
                      <Badge tone={hasPreview ? "success" : "neutral"}>Preview: {meta.previewStatus}</Badge>
                    ) : null}
                    {meta?.releaseStatus ? (
                      <Badge tone={meta.releaseStatus === "published" ? "success" : "neutral"}>
                        Release: {meta.releaseStatus}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="ui-hint" style={{ margin: "0 0 var(--space-3)" }}>
                    Last edited {formatDateTime(app.updatedAt)}
                  </p>
                  <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                    <ButtonLink href={routes.appDetail(app.id)} size="sm">
                      Continue
                    </ButtonLink>
                    {hasPreview ? (
                      <ButtonLink href={routes.appPreview(app.id)} variant="secondary" size="sm">
                        Preview
                      </ButtonLink>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-3)",
              flexWrap: "wrap",
            }}
          >
            <span className="u-mono">
              {result.totalCount} app{result.totalCount === 1 ? "" : "s"} · page {result.page} of{" "}
              {Math.max(1, Math.ceil(result.totalCount / CATALOG_PAGE_SIZE))}
            </span>
            <span className="ui-chips">
              {result.page > 1 ? (
                <a href={catalogHref(query, result.page - 1)} className="ui-btn ui-btn--console ui-btn--sm">
                  ← prev
                </a>
              ) : null}
              {result.page * CATALOG_PAGE_SIZE < result.totalCount ? (
                <a href={catalogHref(query, result.page + 1)} className="ui-btn ui-btn--console ui-btn--sm">
                  next →
                </a>
              ) : null}
            </span>
          </div>
        </>
      )}
    </>
  );
}
