# @asafarim/config

Shared TypeScript, ESLint, and Tailwind configuration for the ASafarIM
Platform monorepo. Consumed by every app and package via `extends` in
their `tsconfig.json`.

## What's here

- **`tsconfig/base.json`** — base TypeScript config (strict mode,
  `target`/`lib` settings, path aliases for `@asafarim/*` packages).
- **`tsconfig/nextjs.json`** — extends `base.json` with Next.js-specific
  compiler options (JSX, plugin types, incremental builds).
- **`tsconfig/react-library.json`** — extends `base.json` for
  React-only packages (UI components, theme toggle) that don't use
  Next.js.

## Usage

```jsonc
// In an app's tsconfig.json:
{
  "extends": "@asafarim/config/tsconfig/nextjs.json",
  "compilerOptions": { "paths": { "@/*": ["./*"] } }
}

// In a package's tsconfig.json:
{
  "extends": "@asafarim/config/tsconfig/react-library.json"
}
```
