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
    "/workspaces/{slug}/ai/proposals/{id}/feedback": {
      parameters: [pathParam("slug"), pathParam("id")],
      post: {
        summary: "Record copilot feedback (outcome, edit distance, time saved, trust, correction reason)",
        requestBody: jsonBody({
          type: "object",
          required: ["outcome"],
          properties: {
            outcome: { type: "string", enum: ["accepted", "partially_accepted", "rejected", "regenerated"] },
            editDistance: { type: "number" },
            timeSavedMin: { type: "integer" },
            correctionReason: { type: "string" },
            trust: { type: "integer", minimum: 1, maximum: 5 },
          },
        }),
        responses: { "201": { description: "recorded" } },
      },
    },
    "/workspaces/{slug}/ai/metrics": {
      parameters: [pathParam("slug")],
      get: {
        summary: "30-day copilot KPIs: acceptance rate, edit distance, time saved, trust, cost",
        responses: { "200": { description: "ok" } },
      },
    },

    "/workspaces/{slug}/focus": {
      parameters: [pathParam("slug")],
      get: {
        summary: "Explainable focus ranking of the viewer's open assigned tasks (per-factor breakdown)",
        responses: { "200": { description: "ok" } },
      },
    },
    "/workspaces/{slug}/brief": {
      parameters: [pathParam("slug")],
      get: { summary: "Personal daily brief: top focus items + the signals touching them", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/signals": {
      parameters: [pathParam("slug")],
      get: {
        summary: "Deterministic risk/workload signals (evidence, freshness, confidence, limitations, alternatives). Never a per-person report.",
        responses: { "200": { description: "ok" } },
      },
    },
    "/workspaces/{slug}/signal-preferences": {
      parameters: [pathParam("slug")],
      get: { summary: "The viewer's signal enable/weight preferences", responses: { "200": { description: "ok" } } },
      patch: {
        summary: "Enable/disable or re-weight a signal for the viewer",
        requestBody: jsonBody({ type: "object", required: ["signalType"], properties: { signalType: { type: "string" }, enabled: { type: "boolean" }, weight: { type: "number" } } }),
        responses: { "200": { description: "ok" } },
      },
    },
    "/workspaces/{slug}/signals/feedback": {
      parameters: [pathParam("slug")],
      post: {
        summary: "Typed signal feedback tied to its rule version (false_alarm/missed/helpful/wrong_evidence)",
        requestBody: jsonBody({
          type: "object",
          required: ["signalType", "targetType", "targetId", "verdict", "ruleVersion"],
          properties: {
            signalType: { type: "string" },
            targetType: { type: "string" },
            targetId: { type: "string" },
            verdict: { type: "string", enum: ["false_alarm", "missed", "helpful", "wrong_evidence"] },
            ruleVersion: { type: "string" },
            note: { type: "string" },
          },
        }),
        responses: { "201": { description: "recorded" } },
      },
    },
    "/workspaces/{slug}/signals/quality": {
      parameters: [pathParam("slug")],
      get: { summary: "Feedback-derived signal quality summary by type + rule version (admin+)", responses: { "200": { description: "ok" }, "403": errorRef() } },
    },

    "/workspaces/{slug}/automations/rules": {
      parameters: [pathParam("slug")],
      get: { summary: "List automation rules", responses: { "200": { description: "ok" } } },
      post: {
        summary: "Create an automation rule (draft; admin+)",
        requestBody: jsonBody({
          type: "object",
          required: ["name", "trigger", "actions"],
          properties: {
            name: { type: "string" },
            trigger: { type: "object" },
            conditions: { type: "array" },
            actions: { type: "array" },
            maxRunsPerHour: { type: "integer" },
          },
        }),
        responses: { "201": { description: "created" }, "403": errorRef() },
      },
    },
    "/workspaces/{slug}/automations/rules/{id}": {
      parameters: [pathParam("slug"), pathParam("id")],
      patch: { summary: "Activate / pause a rule", responses: { "200": { description: "ok" } } },
      delete: { summary: "Return a rule to draft", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/automations/rules/{id}/dry-run": {
      parameters: [pathParam("slug"), pathParam("id")],
      post: { summary: "Predict what a rule would do for a sample event — executes nothing", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/automations/rules/{id}/runs": {
      parameters: [pathParam("slug"), pathParam("id")],
      get: { summary: "Rule execution log (per-action outcomes, retries, skips)", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/webhooks": {
      parameters: [pathParam("slug")],
      get: { summary: "List webhook endpoints", responses: { "200": { description: "ok" } } },
      post: {
        summary: "Register an https webhook endpoint (returns the signing secret once; admin+)",
        requestBody: jsonBody({ type: "object", required: ["url", "events"], properties: { url: { type: "string" }, events: { type: "array", items: { type: "string" } } } }),
        responses: { "201": { description: "created" } },
      },
    },
    "/workspaces/{slug}/webhooks/{id}": {
      parameters: [pathParam("slug"), pathParam("id")],
      delete: { summary: "Delete a webhook endpoint", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/webhooks/{id}/rotate": {
      parameters: [pathParam("slug"), pathParam("id")],
      post: { summary: "Rotate the endpoint signing secret", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/api-tokens": {
      parameters: [pathParam("slug")],
      get: { summary: "List scoped API tokens (hashes only)", responses: { "200": { description: "ok" } } },
      post: {
        summary: "Mint a scoped API token — plaintext returned exactly once (admin+)",
        requestBody: jsonBody({ type: "object", required: ["name", "scopes"], properties: { name: { type: "string" }, scopes: { type: "array", items: { type: "string" } }, expiresInDays: { type: "integer" } } }),
        responses: { "201": { description: "created" } },
      },
    },
    "/workspaces/{slug}/api-tokens/{id}": {
      parameters: [pathParam("slug"), pathParam("id")],
      delete: { summary: "Revoke a token — access stops immediately", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/api-tokens/{id}/rotate": {
      parameters: [pathParam("slug"), pathParam("id")],
      post: { summary: "Rotate a token (revokes the old, mints a linked new one)", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/integrations/github": {
      parameters: [pathParam("slug")],
      get: { summary: "List connected GitHub repos", responses: { "200": { description: "ok" } } },
      post: {
        summary: "Connect a GitHub repo (owner/repo + webhook secret + target project; admin+)",
        requestBody: jsonBody({ type: "object", required: ["repo", "secret", "projectId"], properties: { repo: { type: "string" }, secret: { type: "string" }, projectId: { type: "string" } } }),
        responses: { "201": { description: "created" } },
      },
    },
    "/workspaces/{slug}/integrations/testora": {
      parameters: [pathParam("slug")],
      get: { summary: "List connected integrations", responses: { "200": { description: "ok" } } },
      post: {
        summary: "Connect a Testora app (appId + HMAC secret + target project for diagnosis proposals; admin+)",
        requestBody: jsonBody({ type: "object", required: ["appId", "secret", "projectId"], properties: { appId: { type: "string" }, secret: { type: "string" }, projectId: { type: "string" } } }),
        responses: { "201": { description: "created" } },
      },
    },

    "/workspaces/{slug}/analytics/flow": {
      parameters: [pathParam("slug")],
      get: {
        summary: "Flow dashboard: cycle time, throughput, aging WIP, predictability (all versioned, work-only)",
        parameters: [{ name: "projectId", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "ok" } },
      },
    },
    "/workspaces/{slug}/analytics/portfolio": {
      parameters: [pathParam("slug")],
      get: { summary: "Per-project health + goal progress + a versioned forecast band", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/analytics/metrics/{metric}": {
      parameters: [pathParam("slug"), pathParam("metric")],
      get: { summary: "Metric snapshot history (value + semantics version + window)", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/analytics/snapshot": {
      parameters: [pathParam("slug")],
      post: { summary: "Freeze current flow metrics as history-safe snapshots (admin+)", responses: { "201": { description: "ok" } } },
    },
    "/workspaces/{slug}/key-results": {
      parameters: [pathParam("slug")],
      post: {
        summary: "Create/update a key result on a goal",
        requestBody: jsonBody({ type: "object", required: ["goalId", "name", "targetValue"], properties: { goalId: { type: "string" }, name: { type: "string" }, startValue: { type: "number" }, targetValue: { type: "number" }, currentValue: { type: "number" }, unit: { type: "string" } } }),
        responses: { "201": { description: "ok" } },
      },
    },
    "/workspaces/{slug}/time-entries": {
      parameters: [pathParam("slug")],
      post: {
        summary: "Log time against a task",
        requestBody: jsonBody({ type: "object", required: ["taskId", "minutes", "spentOn"], properties: { taskId: { type: "string" }, minutes: { type: "integer" }, spentOn: { type: "string", format: "date-time" }, note: { type: "string" } } }),
        responses: { "201": { description: "ok" } },
      },
    },

    "/workspaces/{slug}/admin/audit": {
      parameters: [pathParam("slug")],
      get: {
        summary: "Search the workspace audit log (admin+)",
        parameters: [
          { name: "name", in: "query", schema: { type: "string" } },
          { name: "actorId", in: "query", schema: { type: "string" } },
          { name: "since", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "until", in: "query", schema: { type: "string", format: "date-time" } },
          { $ref: "#/components/parameters/cursor" },
        ],
        responses: { "200": { description: "ok" }, "403": errorRef() },
      },
    },
    "/workspaces/{slug}/admin/audit/export": {
      parameters: [pathParam("slug")],
      get: { summary: "Export audit results as CSV (admin+)", responses: { "200": { description: "text/csv" } } },
    },
    "/workspaces/{slug}/admin/members/{id}/revoke": {
      parameters: [pathParam("slug"), pathParam("id")],
      post: { summary: "Revoke a member: archive membership + revoke their API tokens (admin+)", responses: { "200": { description: "ok" }, "403": errorRef() } },
    },
    "/workspaces/{slug}/admin/break-glass": {
      parameters: [pathParam("slug")],
      get: { summary: "Active break-glass grants (admin+)", responses: { "200": { description: "ok" } } },
      post: {
        summary: "Grant time-boxed elevated access for support/incident response (owner)",
        requestBody: jsonBody({ type: "object", required: ["grantedTo", "reason"], properties: { grantedTo: { type: "string" }, reason: { type: "string" }, ticketRef: { type: "string" }, minutes: { type: "integer" } } }),
        responses: { "201": { description: "granted" }, "403": errorRef() },
      },
    },
    "/workspaces/{slug}/admin/break-glass/{id}": {
      parameters: [pathParam("slug"), pathParam("id")],
      delete: { summary: "Revoke a break-glass grant early (owner)", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/privacy/dsr": {
      parameters: [pathParam("slug")],
      get: { summary: "List data-subject requests (owner)", responses: { "200": { description: "ok" } } },
      post: {
        summary: "Create a data-subject request (export | delete) for an opaque platform user id (owner)",
        requestBody: jsonBody({ type: "object", required: ["subjectUserId", "kind"], properties: { subjectUserId: { type: "string" }, kind: { type: "string", enum: ["export", "delete"] } } }),
        responses: { "201": { description: "created" }, "403": errorRef() },
      },
    },
    "/workspaces/{slug}/privacy/dsr/{id}/process": {
      parameters: [pathParam("slug"), pathParam("id")],
      post: { summary: "Run the DSR — export builds a bundle, delete runs verified deletion (owner)", responses: { "200": { description: "ok" } } },
    },

    "/workspaces/{slug}/beta": {
      parameters: [pathParam("slug")],
      get: { summary: "Beta enrolment + this member's consent status", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/beta/enroll": {
      parameters: [pathParam("slug")],
      post: {
        summary: "Enrol the workspace in the design-partner beta (owner)",
        requestBody: jsonBody({ type: "object", required: ["cohort"], properties: { cohort: { type: "string", enum: ["concierge", "self_serve"] }, teamType: { type: "string" }, segment: { type: "string" } } }),
        responses: { "201": { description: "enrolled" }, "403": errorRef() },
      },
    },
    "/workspaces/{slug}/beta/consent": {
      parameters: [pathParam("slug")],
      post: { summary: "Record this member's consent to the current beta terms", responses: { "201": { description: "ok" } } },
    },
    "/workspaces/{slug}/beta/metrics": {
      parameters: [pathParam("slug")],
      get: { summary: "Beta KPI dashboard: activation, completion, invitation acceptance, AI acceptance/trust/cost, feedback backlog", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/beta/decision": {
      parameters: [pathParam("slug")],
      post: {
        summary: "Record the beta decision (continue | narrow | remediate | stop) (owner)",
        requestBody: jsonBody({ type: "object", required: ["decision"], properties: { decision: { type: "string", enum: ["continue", "narrow", "remediate", "stop"] } } }),
        responses: { "200": { description: "ok" } },
      },
    },
    "/workspaces/{slug}/feedback": {
      parameters: [pathParam("slug")],
      get: {
        summary: "List feedback items (triage board)",
        parameters: [
          { name: "state", in: "query", schema: { type: "string" } },
          { name: "overdue", in: "query", schema: { type: "boolean" } },
        ],
        responses: { "200": { description: "ok" } },
      },
      post: {
        summary: "Report feedback — respondBy is derived from severity",
        requestBody: jsonBody({ type: "object", required: ["source", "severity", "title", "detail"], properties: { source: { type: "string", enum: ["in_app", "interview", "email", "support", "observed"] }, severity: { type: "string", enum: ["blocker", "major", "minor", "idea"] }, title: { type: "string" }, detail: { type: "string" } } }),
        responses: { "201": { description: "created" } },
      },
    },
    "/workspaces/{slug}/feedback/{id}": {
      parameters: [pathParam("slug"), pathParam("id")],
      patch: {
        summary: "Triage a feedback item (state, owner, severity, linkedChange). Changing severity recomputes respondBy; resolving stamps respondedAt. (admin+)",
        responses: { "200": { description: "ok" }, "403": errorRef() },
      },
    },

    "/workspaces/{slug}/billing": {
      parameters: [pathParam("slug")],
      get: { summary: "Current subscription (tier, status, seats)", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/billing/usage": {
      parameters: [pathParam("slug")],
      get: {
        summary: "Usage transparency — meters, remaining, overage flag, the visible cost driver, estimated monthly bill",
        responses: { "200": { description: "ok" } },
      },
    },
    "/workspaces/{slug}/billing/checkout": {
      parameters: [pathParam("slug")],
      post: {
        summary: "Start a Stripe checkout (owner). Refused by the license gate until billing is open; returns a stub session without a Stripe key.",
        requestBody: jsonBody({ type: "object", required: ["tier", "seats"], properties: { tier: { type: "string", enum: ["pro", "business"] }, seats: { type: "integer" } } }),
        responses: { "201": { description: "checkout session" }, "403": errorRef() },
      },
    },
    "/workspaces/{slug}/billing/cancel": {
      parameters: [pathParam("slug")],
      post: { summary: "Cancel the subscription — enters a grace window to period end (owner)", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/billing/invoices": {
      parameters: [pathParam("slug")],
      get: { summary: "Invoice history (owner)", responses: { "200": { description: "ok" } } },
    },

    "/workspaces/{slug}/enterprise/domains": {
      parameters: [pathParam("slug")],
      post: { summary: "Claim an email domain — returns a DNS TXT verification token (owner)", responses: { "201": { description: "ok" }, "409": errorRef() } },
    },
    "/workspaces/{slug}/enterprise/domains/{id}/verify": {
      parameters: [pathParam("slug"), pathParam("id")],
      post: { summary: "Mark a claimed domain verified + set auto-join (owner)", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/enterprise/service-accounts": {
      parameters: [pathParam("slug")],
      post: {
        summary: "Create a service account with a scoped token + IP allowlist (owner)",
        requestBody: jsonBody({ type: "object", required: ["name", "scopes"], properties: { name: { type: "string" }, scopes: { type: "array", items: { type: "string" } }, ipAllowlist: { type: "array", items: { type: "string" } } } }),
        responses: { "201": { description: "ok" } },
      },
    },
    "/workspaces/{slug}/enterprise/service-accounts/{id}": {
      parameters: [pathParam("slug"), pathParam("id")],
      delete: { summary: "Disable a service account and revoke its token (owner)", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/enterprise/retention": {
      parameters: [pathParam("slug")],
      get: { summary: "Effective retention (override → legal hold → platform default)", responses: { "200": { description: "ok" } } },
      patch: { summary: "Set per-workspace retention overrides (owner)", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/enterprise/legal-holds": {
      parameters: [pathParam("slug")],
      post: { summary: "Place a legal hold — suspends retention deletion (owner)", responses: { "201": { description: "ok" } } },
    },
    "/workspaces/{slug}/enterprise/legal-holds/{id}": {
      parameters: [pathParam("slug"), pathParam("id")],
      delete: { summary: "Lift a legal hold (owner)", responses: { "200": { description: "ok" } } },
    },
    "/workspaces/{slug}/enterprise/audit-stream": {
      parameters: [pathParam("slug")],
      post: { summary: "Configure an https SIEM audit-stream endpoint — returns the signing secret (owner)", responses: { "201": { description: "ok" } } },
    },
    "/workspaces/{slug}/enterprise/scim": {
      parameters: [pathParam("slug")],
      get: { summary: "SCIM provisioning log (admin+)", responses: { "200": { description: "ok" } } },
      post: {
        summary: "SCIM push: create | update | deactivate a member by IdP externalId (owner)",
        requestBody: jsonBody({ type: "object", required: ["externalId", "platformUserId", "op"], properties: { externalId: { type: "string" }, platformUserId: { type: "string" }, op: { type: "string", enum: ["create", "update", "deactivate"] }, role: { type: "string" } } }),
        responses: { "201": { description: "ok" } },
      },
    },
  },
  // Machine endpoints outside /api/v1: POST /api/inbound/email (bearer),
  // POST /api/integrations/github (per-repo HMAC), POST /api/billing/stripe
  // (Stripe webhook, 404 until billing is open). See docs/billing-launch.md
  // and docs/enterprise.md.
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
