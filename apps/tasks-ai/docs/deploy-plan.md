# TasksAI deployment guide

This guide documents the reproducible deployment shape without publishing a
particular operator's host address, secret locations, or rollout schedule.

## Topology

A deployment consists of:

- a Next.js standalone web container;
- a one-shot migration container that completes before the web process starts;
- a BullMQ worker container;
- a dedicated PostgreSQL database; and
- a Redis instance or namespace for TasksAI queues.

The reverse proxy terminates TLS and forwards the configured TasksAI hostname
to the web container. Use deployment-specific DNS and host values.

## Configuration

Required configuration includes the dedicated database URL, authentication
secret, public TasksAI and Hub URLs, and Redis URL. Provider credentials and
billing credentials are optional; features must fail closed or degrade safely
when they are absent. Keep all secret values in the deployment's secret store.

The environment contract must reject a missing TasksAI database URL and must
not silently fall back to the platform identity database.

## CI and migrations

CI runs type checking, unit tests, authentication-registry tests, migration
deployment against an ephemeral database, and schema/migration drift checks.
Production migration execution must finish successfully before application
startup.

## Rollback and smoke test

Roll back the application by deploying the previous immutable image. Database
migrations should be additive and rehearsed before release. After deployment,
verify the health endpoint, an SSO round trip, database health, and worker
readiness without logging credentials or user content.
