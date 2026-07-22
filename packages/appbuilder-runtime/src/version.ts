/**
 * Bumped whenever the registry's rendering behavior changes in a way that
 * could change an existing preview's output (a new component version, a
 * changed config schema, a different chrome layout). Persisted on every
 * preview build (`apps/appbuilder`) alongside the specification checksum, so
 * a preview can always be reproduced against the exact registry that
 * produced it, and so re-running a preview build after a registry upgrade is
 * never silently conflated with re-running it after a specification edit.
 */
export const REGISTRY_VERSION = "0.1.0";
