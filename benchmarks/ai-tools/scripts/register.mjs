// The tools' server modules import Next's "server-only" guard, which only
// exists inside a Next build. Outside Next these scripts resolve it to an
// empty module (vitest does the same through an alias).
import { registerHooks } from "node:module";

const stub = new URL("./server-only-stub.mjs", import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    return specifier === "server-only" ? { url: stub, shortCircuit: true, format: "module" } : next(specifier, context);
  },
});
