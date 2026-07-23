import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";

/**
 * Shared shapes for the M09 "live" generated-app rendering layer — a
 * parallel, entirely separate client-rendered path from M06's
 * `renderPreview` (server-rendered, demo-data-only, forms permanently
 * disabled). See app/apps/[appId]/preview/[[...path]]/page.tsx for how the
 * two are selected; nothing here is imported by the M06 demo path.
 */

export interface LiveRuntimeInfo {
  appId: string;
  basePath: string;
  spec: ApplicationSpecificationType;
  roleIds: string[];
  principalId: string;
  /** True only for builder role-simulation — see routeHelpers.ts#resolveContextForRequest. Every API call in this mode carries `?simulateRoleId=`. */
  simulated: boolean;
  simulateRoleId?: string;
  /** True when the viewer reached this route with no generated-app membership at all but DOES hold a real builder capability (`app.resetGeneratedData`) — enables the "seed demo data" affordance instead of a dead end. */
  canSeedDemoData: boolean;
}

export interface GeneratedRecord {
  id: string;
  appId: string;
  entityId: string;
  specVersionNumber: number;
  revision: number;
  data: Record<string, unknown>;
  status: "active" | "archived";
  createdByPrincipalId: string;
  updatedByPrincipalId: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ApiErrorPayload {
  error: string;
  code?: string;
  errors?: Array<{ field: string; code: string; message: string }>;
  currentRevision?: number;
  baseRevision?: number;
}

export class LiveApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: ApiErrorPayload,
  ) {
    super(payload.error);
    this.name = "LiveApiError";
  }
}
