import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeTestDb, getTestDb, migrateTestDb, resetTestDb } from "../db/testUtils";
import { createApp } from "./apps";
import { addCollaborator } from "./collaborators";
import { conversationReferences, operationalEvents, usageEvents } from "../db/schema";
import {
  deleteConversationReference,
  getReferenceImportHealth,
  importConversationReference,
  listConversationReferencesForActor,
  listReferenceEvidenceForConversation,
} from "./references";
import { NotFoundError } from "../errors";
import { ReferenceUrlNotAllowedError } from "../references/errors";
import { QuotaExceededError } from "../quotas/errors";
import { REFERENCE_LIMITS } from "../references/limits";

/**
 * M13 slice F — the reference-import lifecycle against a real database:
 * authorization, the URL policy as an audited security boundary, the cache
 * (one row per app+URL, refreshed in place), the outbound-fetch quota, and —
 * the behavior the slice is really about — what a caller is told when a
 * refresh fails over a copy we already have.
 */

const db = getTestDb();
const owner = { principalId: "ref-owner", roles: [] };
const editor = { principalId: "ref-editor", roles: [] };
const viewer = { principalId: "ref-viewer", roles: [] };
const unrelated = { principalId: "ref-unrelated", roles: [] };

const resolveHost = async () => ["93.184.216.34"];

/** A fetch that answers every call with the same HTML body. */
function constantFetch(body: string, status = 200) {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
  }) as unknown as typeof fetch;
  return { deps: { fetchImpl, resolveHost }, calls: () => calls };
}

function failingFetch(status: number, headers: Record<string, string> = {}) {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(null, { status, headers });
  }) as unknown as typeof fetch;
  return { deps: { fetchImpl, resolveHost }, calls: () => calls };
}

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  delete process.env.APPBUILDER_QUOTA_REFERENCE_FETCHES_PER_DAY_PER_APP;
  delete process.env.APPBUILDER_QUOTA_REFERENCES_PER_APP;
  // M13 slice G made URL import independently flagged, and OFF by default
  // (see lib/features/flags.ts). This file exercises the import path itself,
  // so it opts in explicitly; the flag's own OFF behavior is asserted in
  // lib/features/featureFlags.integration.test.ts.
  process.env.APPBUILDER_URL_IMPORTS_ENABLED = "true";
});

afterEach(() => {
  delete process.env.APPBUILDER_URL_IMPORTS_ENABLED;
});

afterAll(async () => {
  await closeTestDb();
});

async function makeApp(suffix: string) {
  return createApp(
    db,
    owner,
    { name: `Ref App ${suffix}`, slug: `ref-app-${suffix}-${Math.random().toString(36).slice(2, 8)}` },
    `ref-create-${suffix}`,
  );
}

describe("importConversationReference — authorization", () => {
  it("owner and editor may import; the conversation is created on first use", async () => {
    const app = await makeApp("authz-ok");
    await addCollaborator(db, owner, app.id, editor.principalId, "editor");

    const first = await importConversationReference(
      db,
      owner,
      app.id,
      { url: "https://example.com/a" },
      constantFetch("<title>A</title><body><p>Alpha</p></body>").deps,
    );
    expect(first.fetched).toBe(true);
    expect(first.freshness).toBe("live");
    expect(first.reference.conversationId).toBeTruthy();

    const second = await importConversationReference(
      db,
      editor,
      app.id,
      { url: "https://example.com/b" },
      constantFetch("<body><p>Beta</p></body>").deps,
    );
    expect(second.reference.importedByPrincipalId).toBe(editor.principalId);
  });

  it("a viewer may not make this platform fetch anything", async () => {
    const app = await makeApp("authz-viewer");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");
    const fetcher = constantFetch("<body><p>x</p></body>");
    await expect(
      importConversationReference(db, viewer, app.id, { url: "https://example.com/a" }, fetcher.deps),
    ).rejects.toThrow();
    // Authorization is checked before anything outbound happens.
    expect(fetcher.calls()).toBe(0);
  });

  it("an unrelated actor gets an indistinguishable NotFoundError", async () => {
    const app = await makeApp("authz-cross");
    await expect(
      importConversationReference(db, unrelated, app.id, { url: "https://example.com/a" }, constantFetch("<p>x</p>").deps),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("importConversationReference — URL policy", () => {
  it("refuses a private target, records a security event, and never fetches", async () => {
    const app = await makeApp("policy-private");
    const fetcher = constantFetch("<p>secret</p>");

    await expect(
      importConversationReference(db, owner, app.id, { url: "https://169.254.169.254/latest/meta-data/" }, fetcher.deps),
    ).rejects.toBeInstanceOf(ReferenceUrlNotAllowedError);
    expect(fetcher.calls()).toBe(0);

    const events = await db
      .select()
      .from(operationalEvents)
      .where(and(eq(operationalEvents.appId, app.id), eq(operationalEvents.kind, "reference.blocked")));
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("security");
    expect(events[0].detail).toMatchObject({ reason: "link_local", host: "169.254.169.254" });
    // No row is created for a URL we refused to fetch.
    expect(await db.select().from(conversationReferences).where(eq(conversationReferences.appId, app.id))).toHaveLength(0);
  });

  it("refuses a non-https URL", async () => {
    const app = await makeApp("policy-http");
    await expect(
      importConversationReference(db, owner, app.id, { url: "http://example.com/a" }, constantFetch("<p>x</p>").deps),
    ).rejects.toMatchObject({ reason: "http" });
  });
});

describe("importConversationReference — caching", () => {
  it("serves a second import from cache without any outbound request", async () => {
    const app = await makeApp("cache-hit");
    const fetcher = constantFetch("<body><p>Cached body</p></body>");

    const first = await importConversationReference(db, owner, app.id, { url: "https://example.com/a" }, fetcher.deps);
    const second = await importConversationReference(db, owner, app.id, { url: "https://example.com/a" }, fetcher.deps);

    expect(fetcher.calls()).toBe(1);
    expect(second.fetched).toBe(false);
    expect(second.freshness).toBe("cached");
    expect(second.reference.id).toBe(first.reference.id);
    // One row per (app, URL) — the cache IS the reference.
    expect(await db.select().from(conversationReferences).where(eq(conversationReferences.appId, app.id))).toHaveLength(1);
  });

  it("normalizes the URL so trivially different spellings share one row", async () => {
    const app = await makeApp("cache-normalize");
    const fetcher = constantFetch("<body><p>x</p></body>");
    await importConversationReference(db, owner, app.id, { url: "https://example.com/a" }, fetcher.deps);
    await importConversationReference(db, owner, app.id, { url: "  https://Example.com:443/a  " }, fetcher.deps);
    expect(fetcher.calls()).toBe(1);
  });

  it("refresh:true re-fetches, bumps refreshCount, and reports whether content changed", async () => {
    const app = await makeApp("cache-refresh");
    await importConversationReference(db, owner, app.id, { url: "https://example.com/a" }, constantFetch("<p>One</p>").deps);

    const same = await importConversationReference(
      db,
      owner,
      app.id,
      { url: "https://example.com/a", refresh: true },
      constantFetch("<p>One</p>").deps,
    );
    expect(same.fetched).toBe(true);
    expect(same.freshness).toBe("live");
    expect(same.unchanged).toBe(true);
    expect(same.reference.refreshCount).toBe(1);

    const changed = await importConversationReference(
      db,
      owner,
      app.id,
      { url: "https://example.com/a", refresh: true },
      constantFetch("<p>Two</p>").deps,
    );
    expect(changed.unchanged).toBe(false);
    expect(changed.reference.refreshCount).toBe(2);
  });

  it("records provenance: source URL, adapter/version, fetch time, and cache expiry", async () => {
    const app = await makeApp("cache-provenance");
    const result = await importConversationReference(
      db,
      owner,
      app.id,
      { url: "https://example.com/about" },
      constantFetch("<title>About us</title><body><p>Body</p></body>").deps,
    );

    expect(result.reference.sourceUrl).toBe("https://example.com/about");
    expect(result.reference.host).toBe("example.com");
    expect(result.reference.adapter).toBe("generic_https");
    expect(result.reference.adapterVersion).toBe("m13-slice-f-v1");
    expect(result.reference.title).toBe("About us");
    expect(result.reference.fetchedAt).toBeInstanceOf(Date);
    expect(result.reference.cacheExpiresAt!.getTime() - result.reference.fetchedAt!.getTime()).toBe(
      REFERENCE_LIMITS.CACHE_TTL_SECONDS * 1000,
    );
    // The imported remote text stays server-side.
    expect((result.reference as unknown as { extractedText?: string }).extractedText).toBeUndefined();
    expect(result.reference.extractedChars).toBeGreaterThan(0);
  });
});

describe("importConversationReference — failure states", () => {
  it("keeps the older copy and labels it stale when a refresh fails", async () => {
    const app = await makeApp("fail-stale");
    const ok = await importConversationReference(
      db,
      owner,
      app.id,
      { url: "https://example.com/a" },
      constantFetch("<p>Original</p>").deps,
    );
    expect(ok.freshness).toBe("live");

    const failed = await importConversationReference(
      db,
      owner,
      app.id,
      { url: "https://example.com/a", refresh: true },
      failingFetch(500).deps,
    );

    // The three things that must all be true at once: the old content is
    // still there, it is NOT called cached or live, and the failure is stated.
    expect(failed.reference.extractedChars).toBe(ok.reference.extractedChars);
    expect(failed.freshness).toBe("stale");
    expect(failed.fetched).toBe(false);
    expect(failed.failure).toMatchObject({ code: "fetch_failed" });
    expect(failed.reference.failureMessage).toBeTruthy();
  });

  it("clears the failure and returns to live once a later refresh succeeds", async () => {
    const app = await makeApp("fail-recover");
    await importConversationReference(db, owner, app.id, { url: "https://example.com/a" }, constantFetch("<p>One</p>").deps);
    await importConversationReference(db, owner, app.id, { url: "https://example.com/a", refresh: true }, failingFetch(503).deps);

    const recovered = await importConversationReference(
      db,
      owner,
      app.id,
      { url: "https://example.com/a", refresh: true },
      constantFetch("<p>Three</p>").deps,
    );
    expect(recovered.freshness).toBe("live");
    expect(recovered.reference.failureCode).toBeNull();
    expect(recovered.failure).toBeNull();
  });

  it("throws when the very first import fails, since there is nothing to fall back on", async () => {
    const app = await makeApp("fail-first");
    await expect(
      importConversationReference(db, owner, app.id, { url: "https://example.com/gone" }, failingFetch(404).deps),
    ).rejects.toMatchObject({ name: "ReferenceFetchFailedError" });
    expect(await db.select().from(conversationReferences).where(eq(conversationReferences.appId, app.id))).toHaveLength(0);
  });

  it("records a rate-limited upstream distinctly from a generic failure", async () => {
    const app = await makeApp("fail-ratelimit");
    await expect(
      importConversationReference(
        db,
        owner,
        app.id,
        { url: "https://api.example.com/x" },
        failingFetch(429, { "retry-after": "60" }).deps,
      ),
    ).rejects.toMatchObject({ name: "ReferenceRateLimitedError" });

    const events = await db
      .select()
      .from(operationalEvents)
      .where(and(eq(operationalEvents.appId, app.id), eq(operationalEvents.kind, "reference.rate_limited")));
    expect(events).toHaveLength(1);
  });
});

describe("importConversationReference — quotas", () => {
  it("meters every outbound fetch on the usage ledger, but not a cache hit", async () => {
    const app = await makeApp("quota-ledger");
    const fetcher = constantFetch("<p>x</p>");
    await importConversationReference(db, owner, app.id, { url: "https://example.com/a" }, fetcher.deps);
    await importConversationReference(db, owner, app.id, { url: "https://example.com/a" }, fetcher.deps);

    const events = await db
      .select()
      .from(usageEvents)
      .where(and(eq(usageEvents.appId, app.id), eq(usageEvents.kind, "public_reference_fetch")));
    expect(events).toHaveLength(1);
  });

  it("enforces the daily outbound-fetch cap", async () => {
    const app = await makeApp("quota-fetches");
    process.env.APPBUILDER_QUOTA_REFERENCE_FETCHES_PER_DAY_PER_APP = "1";
    try {
      const fetcher = constantFetch("<p>x</p>");
      await importConversationReference(db, owner, app.id, { url: "https://example.com/a" }, fetcher.deps);
      await expect(
        importConversationReference(db, owner, app.id, { url: "https://example.com/b" }, fetcher.deps),
      ).rejects.toBeInstanceOf(QuotaExceededError);
      // Rejected before the second request went out.
      expect(fetcher.calls()).toBe(1);
    } finally {
      delete process.env.APPBUILDER_QUOTA_REFERENCE_FETCHES_PER_DAY_PER_APP;
    }
  });

  it("enforces the per-app reference-count cap", async () => {
    const app = await makeApp("quota-count");
    process.env.APPBUILDER_QUOTA_REFERENCES_PER_APP = "1";
    try {
      const fetcher = constantFetch("<p>x</p>");
      await importConversationReference(db, owner, app.id, { url: "https://example.com/a" }, fetcher.deps);
      await expect(
        importConversationReference(db, owner, app.id, { url: "https://example.com/b" }, fetcher.deps),
      ).rejects.toBeInstanceOf(QuotaExceededError);
      // A refresh of an EXISTING reference is unaffected by the row cap.
      const refreshed = await importConversationReference(
        db,
        owner,
        app.id,
        { url: "https://example.com/a", refresh: true },
        fetcher.deps,
      );
      expect(refreshed.fetched).toBe(true);
    } finally {
      delete process.env.APPBUILDER_QUOTA_REFERENCES_PER_APP;
    }
  });
});

describe("listing, evidence, and deletion", () => {
  it("lists references for a viewer with freshness, and never the imported text", async () => {
    const app = await makeApp("list-viewer");
    await addCollaborator(db, owner, app.id, viewer.principalId, "viewer");
    await importConversationReference(db, owner, app.id, { url: "https://example.com/a" }, constantFetch("<p>x</p>").deps);

    const list = await listConversationReferencesForActor(db, viewer, app.id);
    expect(list).toHaveLength(1);
    expect(list[0].freshness).toBe("cached");
    expect((list[0] as unknown as { extractedText?: string }).extractedText).toBeUndefined();
  });

  it("exposes stored text only through the worker-side evidence reader", async () => {
    const app = await makeApp("list-evidence");
    const imported = await importConversationReference(
      db,
      owner,
      app.id,
      { url: "https://example.com/a" },
      constantFetch("<body><p>Grounding text</p></body>").deps,
    );
    const evidence = await listReferenceEvidenceForConversation(db, app.id, imported.reference.conversationId);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].extractedText).toContain("Grounding text");
  });

  it("deleting a reference clears the imported text and hides it from listings", async () => {
    const app = await makeApp("delete-ref");
    const imported = await importConversationReference(
      db,
      owner,
      app.id,
      { url: "https://example.com/a" },
      constantFetch("<p>Sensitive third-party text</p>").deps,
    );

    const deleted = await deleteConversationReference(db, owner, app.id, imported.reference.id);
    expect(deleted.status).toBe("deleted");
    expect(deleted.extractedChars).toBe(0);
    expect(await listConversationReferencesForActor(db, owner, app.id)).toHaveLength(0);
    expect(await listReferenceEvidenceForConversation(db, app.id, imported.reference.conversationId)).toHaveLength(0);

    // Idempotent, and the provenance tombstone survives for audit.
    await expect(deleteConversationReference(db, owner, app.id, imported.reference.id)).resolves.toMatchObject({
      status: "deleted",
    });
    const [row] = await db.select().from(conversationReferences).where(eq(conversationReferences.id, imported.reference.id));
    expect(row.sourceUrl).toBe("https://example.com/a");
    expect(row.extractedText).toBeNull();
  });

  it("re-importing a deleted reference revives it as a fresh import", async () => {
    const app = await makeApp("delete-revive");
    const imported = await importConversationReference(db, owner, app.id, { url: "https://example.com/a" }, constantFetch("<p>x</p>").deps);
    await deleteConversationReference(db, owner, app.id, imported.reference.id);

    const revived = await importConversationReference(db, owner, app.id, { url: "https://example.com/a" }, constantFetch("<p>y</p>").deps);
    expect(revived.fetched).toBe(true);
    expect(revived.reference.status).toBe("ready");
    expect(revived.reference.refreshCount).toBe(0);
  });

  it("reports import health from rows without probing anything", async () => {
    const app = await makeApp("health");
    expect(await getReferenceImportHealth(db, app.id)).toMatchObject({ cached: 0, stale: 0, unavailable: 0 });

    await importConversationReference(db, owner, app.id, { url: "https://example.com/a" }, constantFetch("<p>x</p>").deps);
    await importConversationReference(db, owner, app.id, { url: "https://example.com/a", refresh: true }, failingFetch(500).deps);

    const health = await getReferenceImportHealth(db, app.id);
    expect(health).toMatchObject({ cached: 0, stale: 1, unavailable: 0, lastFailureCode: "fetch_failed" });
    expect(health.lastFetchedAt).toBeInstanceOf(Date);
  });
});
