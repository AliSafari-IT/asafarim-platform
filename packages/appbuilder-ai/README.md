# @asafarim/appbuilder-ai

Server-only AI provider boundary and structured planning schemas for
AppBuilder's M07 generation pipeline. The model may only propose
allowlisted `@asafarim/appbuilder-schema` operations — this package
never executes or returns arbitrary source code.

## What's here

- **Requirements analysis** — `RequirementsAnalysis` schema: parses a
  user's natural-language app description into structured requirements
  with confidence levels and clarification questions.
- **Template recommendation** — `TemplateRecommendation` schema:
  selects a starter template from the M06 registry based on the
  analyzed requirements.
- **Operation proposals** — `OperationBatch` / `ProposedOperation`:
  the AI proposes a batch of allowlisted operations that
  `@asafarim/appbuilder-schema`'s engine can validate and apply.
- **Modification decisions** — `ModificationDecision` discriminated
  union: ready / needs clarification / partially supported /
  unsupported, with assumptions, plan steps, capability gaps, and
  supported alternatives.
- **Provider boundary** — OpenAI integration (`provider/`) that
  enforces the schema contract on every model response; the model
  never returns raw text that becomes code.
- **Fixtures** (`fixtures/`) — deterministic test fixtures for every
  schema, so tests don't call the AI provider.
- **Prompts** (`prompts/`) — versioned prompt templates for each
  pipeline stage.
- **Capabilities** (`capabilities/`) — declares what the AI can and
  cannot do, enforced at the provider boundary.

## Exports

```ts
import {
  RequirementsAnalysis,
  TemplateRecommendation,
  OperationBatch,
  ModificationDecision,
  PLANNING_LIMITS,
} from "@asafarim/appbuilder-ai";
```

## Dependencies

- `@asafarim/appbuilder-schema` for the operation allowlist and
  specification contract.
- `openai` for the AI provider client.
- `zod` for schema validation.

## Scripts

```bash
pnpm --filter @asafarim/appbuilder-ai build         # tsc -p tsconfig.build.json
pnpm --filter @asafarim/appbuilder-ai typecheck
pnpm --filter @asafarim/appbuilder-ai test           # vitest
```
