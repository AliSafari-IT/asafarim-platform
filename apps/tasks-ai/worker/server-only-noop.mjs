/**
 * Loaded with `--import` by every worker entry point (#787):
 * `tsx --import ./worker/server-only-noop.mjs worker/<entry>.ts`.
 *
 * `server-only` is a Next.js marker: the Next build resolves it to an empty
 * module for server code and fails the build if a client bundle imports it.
 * The worker runs the same service modules under plain Node (tsx), where the
 * package isn't installed, so every module that imports it failed with
 * ERR_MODULE_NOT_FOUND. For this process only, resolve it to an empty module,
 * as Next does on the server. The marker stays in the shared modules, so the
 * client-bundle guard in the Next app is unchanged.
 *
 * `registerHooks` (in-thread, synchronous) covers both `import` and `require`.
 */
import { registerHooks } from "node:module";

const EMPTY = new URL("./server-only-empty.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: EMPTY, format: "module", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
