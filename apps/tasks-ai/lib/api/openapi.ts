/**
 * OpenAPI 3.1 description of /api/v1. Hand-maintained in M02 alongside the
 * routes; the served document and the checked-in docs/api/openapi.json are
 * asserted equal in CI so a route change without a spec change fails.
 */
export const openapiDocument = {
  openapi: "3.1.0",
  info: {
    title: "TasksAI API",
    version: "1.0.0",
    description:
      "Versioned REST contract for TasksAI. Cursor pagination, stable error codes, " +
      "optimistic concurrency via If-Match, and Idempotency-Key on POST.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      session: { type: "apiKey", in: "cookie", name: "authjs.session-token" },
    },
    parameters: {
      cursor: { name: "cursor", in: "query", schema: { type: "string" } },
      limit: {
        name: "limit",
        in: "query",
        schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
      IfMatch: {
        name: "If-Match",
        in: "header",
        schema: { type: "string" },
        description: "Optimistic concurrency: the resource version last read.",
      },
      IdempotencyKey: {
        name: "Idempotency-Key",
        in: "header",
        schema: { type: "string" },
        description: "Dedupe token for safe POST retries.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: {
                type: "string",
                enum: [
                  "validation_failed",
                  "unauthenticated",
                  "forbidden",
                  "not_found",
                  "conflict_version",
                  "conflict_unique",
                  "idempotency_mismatch",
                  "rate_limited",
                  "workspace_required",
                  "internal",
                ],
              },
              message: { type: "string" },
              details: {},
            },
          },
        },
      },
      Workspace: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          slug: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Project: {
        type: "object",
        properties: {
          id: { type: "string" },
          key: { type: "string" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          visibility: { type: "string", enum: ["workspace", "private"] },
          archivedAt: { type: ["string", "null"], format: "date-time" },
          version: { type: "integer" },
        },
      },
      Task: {
        type: "object",
        properties: {
          id: { type: "string" },
          projectId: { type: "string" },
          parentId: { type: ["string", "null"] },
          title: { type: "string" },
          description: { type: ["string", "null"] },
          assigneeId: { type: ["string", "null"] },
          statusId: { type: ["string", "null"] },
          estimate: { type: ["number", "null"] },
          startDate: { type: ["string", "null"], format: "date-time" },
          dueDate: { type: ["string", "null"], format: "date-time" },
          completedAt: { type: ["string", "null"], format: "date-time" },
          source: { type: "string", enum: ["manual", "quick_capture", "import", "proposal"] },
          version: { type: "integer" },
        },
      },
    },
  },
  security: [{ session: [] }],
  paths: {
    "/workspaces": {
      get: {
        summary: "List workspaces the caller belongs to",
        responses: { "200": jsonList("Workspace") },
      },
      post: {
        summary: "Create a workspace (caller becomes owner)",
        requestBody: jsonBody({
          type: "object",
          required: ["name", "slug"],
          properties: { name: { type: "string" }, slug: { type: "string" } },
        }),
        responses: { "201": jsonOne("Workspace"), "409": errorRef() },
      },
    },
    "/workspaces/{slug}/projects": {
      parameters: [pathParam("slug")],
      get: {
        summary: "List projects",
        parameters: [{ $ref: "#/components/parameters/cursor" }, { $ref: "#/components/parameters/limit" }],
        responses: { "200": jsonPage("Project") },
      },
      post: {
        summary: "Create a project",
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: jsonBody({
          type: "object",
          required: ["name", "key"],
          properties: {
            name: { type: "string" },
            key: { type: "string" },
            description: { type: "string" },
            visibility: { type: "string", enum: ["workspace", "private"] },
          },
        }),
        responses: { "201": jsonOne("Project"), "403": errorRef(), "409": errorRef() },
      },
    },
    "/workspaces/{slug}/projects/{id}": {
      parameters: [pathParam("slug"), pathParam("id")],
      get: { summary: "Get a project", responses: { "200": jsonOne("Project"), "404": errorRef() } },
      patch: {
        summary: "Update a project",
        parameters: [{ $ref: "#/components/parameters/IfMatch" }],
        requestBody: jsonBody({ type: "object" }),
        responses: { "200": jsonOne("Project"), "409": errorRef() },
      },
      delete: {
        summary: "Archive a project (soft)",
        parameters: [{ $ref: "#/components/parameters/IfMatch" }],
        responses: { "200": jsonOne("Project"), "409": errorRef() },
      },
    },
    "/workspaces/{slug}/tasks": {
      parameters: [pathParam("slug")],
      get: {
        summary: "List tasks",
        parameters: [
          { $ref: "#/components/parameters/cursor" },
          { $ref: "#/components/parameters/limit" },
          { name: "projectId", in: "query", schema: { type: "string" } },
          { name: "assigneeId", in: "query", schema: { type: "string" } },
          { name: "statusId", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": jsonPage("Task") },
      },
      post: {
        summary: "Create a task",
        parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
        requestBody: jsonBody({
          type: "object",
          required: ["projectId", "title"],
          properties: {
            projectId: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            parentId: { type: "string" },
            assigneeId: { type: "string" },
            dueDate: { type: "string", format: "date-time" },
          },
        }),
        responses: { "201": jsonOne("Task"), "403": errorRef() },
      },
    },
    "/workspaces/{slug}/tasks/{id}": {
      parameters: [pathParam("slug"), pathParam("id")],
      get: { summary: "Get a task", responses: { "200": jsonOne("Task"), "404": errorRef() } },
      patch: {
        summary: "Update a task",
        parameters: [{ $ref: "#/components/parameters/IfMatch" }],
        requestBody: jsonBody({ type: "object" }),
        responses: { "200": jsonOne("Task"), "409": errorRef() },
      },
      delete: {
        summary: "Delete a task (soft archive)",
        parameters: [{ $ref: "#/components/parameters/IfMatch" }],
        responses: { "200": jsonOne("Task") },
      },
    },
    "/workspaces/{slug}/tasks/{id}/complete": {
      parameters: [pathParam("slug"), pathParam("id")],
      post: { summary: "Mark a task complete", responses: { "200": jsonOne("Task") } },
    },
    "/workspaces/{slug}/tasks/{id}/links": {
      parameters: [pathParam("slug"), pathParam("id")],
      post: {
        summary: "Link this task to another",
        requestBody: jsonBody({
          type: "object",
          required: ["toTaskId", "kind"],
          properties: {
            toTaskId: { type: "string" },
            kind: { type: "string", enum: ["blocks", "relates", "duplicates"] },
          },
        }),
        responses: { "201": { description: "created" }, "422": errorRef() },
      },
    },

    "/workspaces/{slug}/invitations": {
      parameters: [pathParam("slug")],
      get: { summary: "List pending invitations (admin+)", responses: { "200": { description: "ok" } } },
      post: {
        summary: "Invite a member by email (admin+)",
        requestBody: jsonBody({
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["admin", "member", "guest"] },
          },
        }),
        responses: { "201": { description: "created" }, "403": errorRef(), "409": errorRef() },
      },
    },
    "/workspaces/{slug}/invitations/{id}": {
      parameters: [pathParam("slug"), pathParam("id")],
      delete: { summary: "Revoke an invitation (admin+)", responses: { "200": { description: "ok" } } },
    },
    "/invitations/accept": {
      post: {
        summary: "Accept an invitation with its token (session required)",
        requestBody: jsonBody({ type: "object", required: ["token"], properties: { token: { type: "string" } } }),
        responses: { "200": { description: "ok" }, "404": errorRef() },
      },
    },
    "/workspaces/{slug}/tasks/{id}/comments": {
      parameters: [pathParam("slug"), pathParam("id")],
      get: { summary: "List comments on a task", responses: { "200": { description: "ok" } } },
      post: {
        summary: "Add a comment (mentions via @[Name](membershipId))",
        requestBody: jsonBody({ type: "object", required: ["body"], properties: { body: { type: "string" } } }),
        responses: { "201": { description: "created" } },
      },
    },
    "/workspaces/{slug}/comments/{id}": {
      parameters: [pathParam("slug"), pathParam("id")],
      patch: { summary: "Edit own comment", responses: { "200": { description: "ok" }, "403": errorRef() } },
      delete: {
        summary: "Delete own comment (or any, as admin/owner)",
        responses: { "200": { description: "ok" }, "403": errorRef() },
      },
    },
    "/workspaces/{slug}/tasks/{id}/watch": {
      parameters: [pathParam("slug"), pathParam("id")],
      post: { summary: "Watch a task", responses: { "200": { description: "ok" } } },
      delete: { summary: "Unwatch a task", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/notifications": {
      parameters: [pathParam("slug")],
      get: {
        summary: "The caller's in-app notification inbox",
        parameters: [
          { $ref: "#/components/parameters/limit" },
          { name: "unread", in: "query", schema: { type: "boolean" } },
        ],
        responses: { "200": { description: "ok" } },
      },
    },
    "/workspaces/{slug}/notifications/read": {
      parameters: [pathParam("slug")],
      post: {
        summary: "Mark notifications read",
        requestBody: jsonBody({ type: "object", properties: { ids: { type: "array", items: { type: "string" } } } }),
        responses: { "200": { description: "ok" } },
      },
    },
    "/workspaces/{slug}/notification-preferences": {
      parameters: [pathParam("slug")],
      get: { summary: "Get notification preferences", responses: { "200": { description: "ok" } } },
      patch: { summary: "Update notification preferences", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/stream": {
      parameters: [pathParam("slug")],
      get: {
        summary: "Server-Sent Events: activity changes for this workspace",
        parameters: [{ name: "since", in: "query", schema: { type: "string", format: "date-time" } }],
        responses: { "200": { description: "text/event-stream" } },
      },
    },

    "/workspaces/{slug}/search": {
      parameters: [pathParam("slug")],
      get: {
        summary: "Global keyword search across authorized tasks/projects/comments/labels",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "types", in: "query", schema: { type: "string" }, description: "comma list: task,project,comment,label" },
        ],
        responses: { "200": { description: "ok" } },
      },
    },
    "/workspaces/{slug}/saved-searches": {
      parameters: [pathParam("slug")],
      get: { summary: "List the caller's saved searches", responses: { "200": { description: "ok" } } },
      post: {
        summary: "Save a search",
        requestBody: jsonBody({ type: "object", required: ["name", "query"], properties: { name: { type: "string" }, query: { type: "string" } } }),
        responses: { "201": { description: "created" } },
      },
    },
    "/workspaces/{slug}/saved-searches/{id}": {
      parameters: [pathParam("slug"), pathParam("id")],
      delete: { summary: "Delete a saved search", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/imports": {
      parameters: [pathParam("slug")],
      post: {
        summary: "Create + dry-run validate a CSV/JSON import (no tasks written)",
        requestBody: jsonBody({
          type: "object",
          required: ["kind", "filename", "projectId", "mapping", "content"],
          properties: {
            kind: { type: "string", enum: ["csv", "json"] },
            filename: { type: "string" },
            projectId: { type: "string" },
            mapping: { type: "object" },
            content: { type: "string" },
          },
        }),
        responses: { "201": { description: "dry-run summary" }, "422": errorRef() },
      },
    },
    "/workspaces/{slug}/imports/{id}": {
      parameters: [pathParam("slug"), pathParam("id")],
      get: { summary: "Import job status + row summary", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/imports/{id}/apply": {
      parameters: [pathParam("slug"), pathParam("id")],
      post: { summary: "Apply staged rows (idempotent, resumable)", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/export": {
      parameters: [pathParam("slug")],
      get: {
        summary: "Workspace data export (admin+); ?format=json|csv, formula-injection safe",
        parameters: [{ name: "format", in: "query", schema: { type: "string", enum: ["json", "csv"] } }],
        responses: { "200": { description: "file" } },
      },
    },
    "/workspaces/{slug}/deletion-manifest": {
      parameters: [pathParam("slug")],
      get: { summary: "What a workspace deletion would remove (owner)", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/inbound-address": {
      parameters: [pathParam("slug")],
      get: { summary: "The workspace's capture-by-email address", responses: { "200": { description: "ok" } } },
      post: { summary: "Provision the capture-by-email address (admin+)", responses: { "201": { description: "created" } } },
    },

    "/workspaces/{slug}/ai/settings": {
      parameters: [pathParam("slug")],
      get: { summary: "AI settings (kill switch, budget, blast radius, provider)", responses: { "200": { description: "ok" } } },
      patch: { summary: "Update AI settings (admin+) — enabled:false is the kill switch", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/ai/usage": {
      parameters: [pathParam("slug")],
      get: { summary: "This month's AI spend + job count vs budget/quota", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/ai/jobs": {
      parameters: [pathParam("slug")],
      post: {
        summary: "Run an AI job — returns a Proposal in state=draft. Applies nothing.",
        requestBody: jsonBody({
          type: "object",
          required: ["kind", "input"],
          properties: {
            kind: { type: "string", enum: ["extract_plan", "decompose", "acceptance_criteria", "summarize", "nl_query"] },
            input: { type: "string" },
            projectId: { type: "string" },
          },
        }),
        responses: { "201": { description: "job + draft proposal" }, "403": errorRef(), "429": errorRef() },
      },
    },
    "/workspaces/{slug}/ai/proposals/{id}": {
      parameters: [pathParam("slug"), pathParam("id")],
      get: { summary: "Get a proposal (draft→previewed) with its operations + citations", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/ai/proposals/{id}/apply": {
      parameters: [pathParam("slug"), pathParam("id")],
      post: {
        summary: "Apply a proposal (transactional, captures an undo plan). >15 ops or edited ops need ?confirm=high",
        requestBody: jsonBody({
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string" },
            accept: { type: "array", items: { type: "integer" } },
            editedOperations: { type: "array" },
          },
        }),
        responses: { "200": { description: "applied" }, "403": errorRef() },
      },
    },
    "/workspaces/{slug}/ai/proposals/{id}/reject": {
      parameters: [pathParam("slug"), pathParam("id")],
      post: { summary: "Reject a proposal — changes nothing", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/ai/proposals/{id}/undo": {
      parameters: [pathParam("slug"), pathParam("id")],
      post: { summary: "Undo an applied proposal via its inverse plan", responses: { "200": { description: "ok" } } },
    },
  },
  // Note: the mail webhook lives at POST /api/inbound/email (outside /api/v1,
  // bearer-token auth, no session) and is documented in docs/portability.md.
} as const;

function pathParam(name: string) {
  return { name, in: "path", required: true, schema: { type: "string" } };
}
function jsonBody(schema: unknown) {
  return { required: true, content: { "application/json": { schema } } };
}
function jsonOne(ref: string) {
  return {
    description: "ok",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: { data: { $ref: `#/components/schemas/${ref}` } },
        },
      },
    },
  };
}
function jsonList(ref: string) {
  return {
    description: "ok",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: { data: { type: "array", items: { $ref: `#/components/schemas/${ref}` } } },
        },
      },
    },
  };
}
function jsonPage(ref: string) {
  return {
    description: "ok",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: `#/components/schemas/${ref}` } },
            page: { type: "object", properties: { nextCursor: { type: ["string", "null"] } } },
          },
        },
      },
    },
  };
}
function errorRef() {
  return {
    description: "error",
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
}
