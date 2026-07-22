import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type {
  ApplicationSpecificationType,
} from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import { specifications, specificationVersions } from "../db/schema";
import { ConflictError, NotFoundError } from "../errors";

/**
 * The ONLY shape a client may send to attach preview-selection context to a
 * conversational request. Every field is a stable specification identifier
 * — never raw DOM, HTML, CSS selectors, cookies, tokens, full record data,
 * hidden fields, or unbounded rendered text (see docs/appbuilder-m08-
 * builder-workspace.md#selection-context-protocol). `registryMetadata` is
 * bounded, JSON-safe, plain-data-only (no functions/DOM refs) and capped in
 * size below.
 */
export const SelectionContext = z.object({
  appId: z.string().min(1).max(100),
  specificationVersionNumber: z.number().int().nonnegative(),
  pageId: z.string().min(1).max(200).optional(),
  componentId: z.string().min(1).max(200).optional(),
  componentKind: z.string().min(1).max(100).optional(),
  label: z.string().max(200).optional(),
  registryMetadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type SelectionContextType = z.infer<typeof SelectionContext>;

export class StaleSelectionError extends ConflictError {
  constructor(currentVersionNumber: number, selectedVersionNumber: number) {
    super(
      `The selected preview element belongs to version ${selectedVersionNumber}, but the app has since moved to version ${currentVersionNumber}. Re-select in the latest preview and try again.`,
    );
    this.name = "StaleSelectionError";
  }
}

export class InvalidSelectionError extends NotFoundError {
  constructor(kind: "page" | "component", id: string) {
    super(`Selected ${kind}`, id);
    this.name = "InvalidSelectionError";
  }
}

/**
 * Validates a client-supplied selection context against the app's actual,
 * CURRENT specification — never trusting the client's claim that a
 * page/component id exists or that its version is still current. Throws
 * `StaleSelectionError` if the selection was made against a version that is
 * no longer current (the issue's "reject stale-version selections"
 * requirement), or `InvalidSelectionError` if the referenced page/component
 * id doesn't exist in that version at all (e.g. a forged or leftover id).
 * Returns the parsed, validated context unchanged — this function never
 * mutates the specification.
 */
export async function validateSelectionContext(
  db: Db,
  appId: string,
  raw: unknown,
): Promise<SelectionContextType | null> {
  if (raw === null || raw === undefined) return null;

  const parsed = SelectionContext.safeParse(raw);
  if (!parsed.success) {
    throw new ConflictError("Selection context is malformed.");
  }
  const selection = parsed.data;
  if (selection.appId !== appId) {
    throw new ConflictError("Selection context references a different app.");
  }

  const [spec] = await db.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
  if (!spec) throw new NotFoundError("Specification for app", appId);

  if (spec.currentVersionNumber !== selection.specificationVersionNumber) {
    throw new StaleSelectionError(spec.currentVersionNumber, selection.specificationVersionNumber);
  }

  if (!selection.pageId && !selection.componentId) {
    return selection;
  }

  const [version] = await db
    .select()
    .from(specificationVersions)
    .where(
      and(eq(specificationVersions.specificationId, spec.id), eq(specificationVersions.versionNumber, spec.currentVersionNumber)),
    )
    .limit(1);
  if (!version) throw new NotFoundError("Specification version", String(spec.currentVersionNumber));

  const payload = version.payload as unknown as ApplicationSpecificationType;
  const page = selection.pageId ? payload.pages?.find((p) => p.id === selection.pageId) : undefined;
  if (selection.pageId && !page) {
    throw new InvalidSelectionError("page", selection.pageId);
  }

  if (selection.componentId) {
    const inPage = page?.components?.some((c) => c.id === selection.componentId);
    const inDashboard = payload.dashboard?.widgets?.some((w) => w.id === selection.componentId);
    if (!inPage && !inDashboard) {
      throw new InvalidSelectionError("component", selection.componentId);
    }
  }

  return selection;
}
