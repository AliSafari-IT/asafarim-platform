import type { Metadata } from "next";
import type { ToolDefinition } from "./types";

/**
 * Page metadata derived from the catalogue entry, so titles/descriptions are
 * never restated in page files. Social images and structured data arrive in
 * #681; this covers the parts every tool page needs from day one.
 */
export function buildToolMetadata(tool: ToolDefinition): Metadata {
  return {
    title: tool.title,
    description: tool.shortDescription,
    alternates: { canonical: `/tools/${tool.slug}` },
    ...(tool.indexable ? {} : { robots: { index: false, follow: true } }),
  };
}
