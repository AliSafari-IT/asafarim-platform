import type { ReactNode } from "react";

/**
 * A strict, allowlisted Markdown SUBSET renderer for conversation content —
 * bold, italic, inline code, and "- " bullet lists only. No links, no
 * images, no headings, no raw HTML passthrough, and NEVER
 * `dangerouslySetInnerHTML` — every token becomes a real React element with
 * plain-string children, so there is no way for model or user text to
 * inject markup regardless of what it contains. Anything not matching a
 * supported token (including literal `<script>`, HTML entities, or
 * malformed markdown) is rendered as inert plain text.
 */

const INLINE_TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(INLINE_TOKEN);
  return parts
    .filter((part) => part.length > 0)
    .map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return <code key={key}>{part.slice(1, -1)}</code>;
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return <em key={key}>{part.slice(1, -1)}</em>;
      }
      return <span key={key}>{part}</span>;
    });
}

export function SafeMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList(key: string) {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={key}>
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item, `${key}-li-${i}`)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      listBuffer.push(trimmed.slice(2));
      return;
    }
    flushList(`list-${index}`);
    if (trimmed.length === 0) return;
    blocks.push(<p key={`p-${index}`}>{renderInline(trimmed, `p-${index}`)}</p>);
  });
  flushList("list-end");

  return <div className="ab-safe-markdown">{blocks}</div>;
}
