# generated/platform/

Output of the ASafariM OS `platform sync` command (AliSafari-IT/asafarim-os), generated from the app manifests in `apps/<app>/platform.app.ts`. **Don't edit these files by hand.** Change the manifest and regenerate.

| File | From | Read by |
| --- | --- | --- |
| `launcher-registry.json` | each manifest's `ui.launcher` block | `@asafarim/auth` (`PLATFORM_APPS`), #769 |

## Regenerate

With an asafarim-os checkout next to this repository (`pnpm install` done there), run from the root of this repository:

```bash
for f in apps/*/platform.app.ts; do node ../asafarim-os/tools/platform-cli/src/cli.ts manifest compile "$f"; done
node ../asafarim-os/tools/platform-cli/src/cli.ts sync --root .
```

The compiled `platform.app.json` files are gitignored. Commit only what changed here.

CI (`.github/workflows/platform-manifests.yml`) runs `platform sync --check` and fails when this directory differs from what the manifests generate.
