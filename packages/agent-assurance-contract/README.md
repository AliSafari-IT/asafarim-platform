# `@asafarim/agent-assurance-contract`

Vendor-neutral schemas and a deterministic evaluator for describing and
verifying an AI agent's operational promises.

The package has no database, framework, provider SDK, or network dependency.
It is intended to be shared by runners, CI integrations, dashboards, and
evidence exporters.

It also defines a strict HTTP request/response envelope. Network execution,
target authorization, credentials, retries, and persistence remain the
runner's responsibility.

## Contract model

An operational contract contains scenarios and allowlisted checks:

- required or forbidden tool execution;
- approval before a consequential tool executes;
- required output fragments;
- maximum duration and cost.

Run evidence is a strict, versioned record of the output, tool timeline,
duration, and cost. Missing evidence produces an `inconclusive` result rather
than a false pass.

Callers must supply only synthetic or redacted scenario inputs and output
excerpts. The schema is not a secret scrubber and must never be used to move
credentials, raw customer datasets, or unrestricted production traces.

```bash
pnpm --filter @asafarim/agent-assurance-contract test
pnpm --filter @asafarim/agent-assurance-contract typecheck
```
