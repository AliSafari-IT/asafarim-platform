import { getPlatformLinks } from "@asafarim/ui";
import { toolStructuredData } from "../../lib/tools/metadata";
import type { ToolDefinition } from "../../lib/tools/types";

/**
 * WebApplication JSON-LD for indexable tool pages (#681). Built only from
 * catalogue data that the page also shows (title, description, free, no
 * sign-in, author, review date); never ratings, reviews, or download counts.
 * The one place the tools use dangerouslySetInnerHTML: the content is our
 * own catalogue, serialized with `<` escaped so it can't close the tag.
 */
export function ToolStructuredData({ tool }: { tool: ToolDefinition }) {
  const json = JSON.stringify(toolStructuredData(tool, getPlatformLinks().web)).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
