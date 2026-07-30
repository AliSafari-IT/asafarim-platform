/**
 * A read-only view of environment variables.
 *
 * Deliberately NOT `NodeJS.ProcessEnv`: this project's TypeScript
 * configuration types `NODE_ENV` as a required property of that interface, so
 * every call site that wants to check one variable in isolation — which is
 * exactly what a flag test does — would have to construct a fake environment
 * carrying fields it does not care about. `process.env` is assignable to this
 * shape, so production call sites are unaffected and test call sites can pass
 * `{ APPBUILDER_VISION_ENABLED: "true" }` and mean it.
 */
export type EnvLike = Readonly<Record<string, string | undefined>>;
