# TasksAI billing integration

This document describes public implementation behavior, not pricing or launch
strategy. Executable plan definitions remain the source of truth.

## Commercial gate

Billing routes fail closed until the deployment's billing feature gate and
required provider configuration are enabled. With the gate closed, core task
management remains available and no payment-provider calls are attempted.

## Plan and entitlement model

`lib/billing/plans.ts` defines stable plan identifiers, entitlements, and
metered allowances. API and UI code consume those identifiers rather than
duplicating plan logic. Public code may expose current executable values; this
document does not make future packaging commitments.

## Usage transparency

Authenticated workspace members can inspect the usage categories that affect
their entitlements. Server-side authorization and tenant scoping apply before
usage is returned.

## Subscription lifecycle

Webhook handlers verify signatures, process provider events idempotently, and
map subscription state into the local billing model. Unknown or malformed
events fail safely. Tests cover entitlement changes, duplicate delivery, and
the disabled-gate path.

## Operator requirements

Deployments that enable billing must configure provider credentials through
their secret-management system, register the webhook endpoint, verify the
rollback path, and monitor failed event delivery. Never commit provider keys or
customer billing payloads.
