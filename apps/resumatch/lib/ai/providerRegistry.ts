import type { ResuMatchAiProvider } from "../env";

/**
 * Shared provider registry factory (issue #515).
 *
 * Every AI domain resolves its provider by name the same way: a lazy,
 * per-name loader (a dynamic `import()` so a provider SDK is only pulled in
 * when that provider is actually selected) plus a process-wide cache. Each
 * domain passes its own loaders, typed by its own provider interface; the
 * factory owns the cache and the "unknown provider" error.
 *
 * The loaders must live in the domain's own registry file, so the
 * `import("./providers/…")` specifiers resolve relative to that domain.
 */
export type ProviderLoaders<P> = Record<ResuMatchAiProvider, () => Promise<P>>;

export interface ProviderRegistryOptions<P> {
  /** Used in the error for an unknown name, e.g. "extraction". */
  label: string;
  loaders: ProviderLoaders<P>;
}

export function createProviderRegistry<P>({
  label,
  loaders,
}: ProviderRegistryOptions<P>): (name: ResuMatchAiProvider) => Promise<P> {
  const cache = new Map<string, P>();

  return async function getProvider(name: ResuMatchAiProvider): Promise<P> {
    const cached = cache.get(name);
    if (cached) return cached;

    // Own-property check so a name like "toString" can't reach a prototype
    // method on the loaders object.
    if (!Object.hasOwn(loaders, name)) {
      throw new Error(`unknown ResuMatch ${label} provider: ${name as string}`);
    }
    const provider = await loaders[name]();
    cache.set(name, provider);
    return provider;
  };
}
