import { toolCatalogue } from "../../content/tools";
import type { ToolDefinition } from "./types";
import { validateCatalogue } from "./validate";

// Fail loudly at import time — during `next build` and in tests — rather than
// render a tool page with missing disclosures.
const problems = validateCatalogue(toolCatalogue);
if (problems.length) {
  throw new Error(`Invalid AI Workbench catalogue (content/tools.ts):\n- ${problems.join("\n- ")}`);
}

type Env = { nodeEnv?: string };

/**
 * Whether `/tools/<slug>` renders at all. Internal tools are dev/test only;
 * retired tools keep a page (charter §4.2) so this stays true for them.
 */
export function isToolRoutable(tool: ToolDefinition, env: Env = { nodeEnv: process.env.NODE_ENV }): boolean {
  return !tool.internal || env.nodeEnv !== "production";
}

/** Resolve a slug from a URL. Unknown or unroutable slugs return undefined. */
export function getTool(slug: string, env?: Env): ToolDefinition | undefined {
  const tool = toolCatalogue.find((t) => t.slug === slug);
  return tool && isToolRoutable(tool, env) ? tool : undefined;
}

export function getRoutableTools(env?: Env): ToolDefinition[] {
  return toolCatalogue.filter((t) => isToolRoutable(t, env));
}

/**
 * Whether the Workbench has anything public to show. Site-wide entry points
 * (primary nav, homepage link, sitemap) stay hidden until it does, so no one
 * is sent to an empty catalogue.
 */
export function hasListedTools(): boolean {
  return getListedTools().length > 0;
}

/**
 * Tools shown on catalogue surfaces: never internal, experimental, or retired
 * (charter §4: experiments are reachable by URL but not promoted); featured
 * first by `featuredOrder`, then alphabetical.
 */
export function getListedTools(): ToolDefinition[] {
  return toolCatalogue
    .filter((t) => !t.internal && t.lifecycle !== "retired" && t.lifecycle !== "experiment")
    .sort(
      (a, b) =>
        (a.featuredOrder ?? Number.POSITIVE_INFINITY) - (b.featuredOrder ?? Number.POSITIVE_INFINITY) ||
        a.title.localeCompare(b.title)
    );
}

/** Tool pages search engines may index: routable, public, and beta/stable/paused (charter §4). */
export function getIndexableTools(env?: Env): ToolDefinition[] {
  return getRoutableTools(env).filter((t) => t.indexable && !t.internal);
}
