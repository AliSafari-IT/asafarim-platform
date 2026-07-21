// Tiny, dependency-free markdown → HTML renderer for issue previews. Handles the
// subset issues actually use: headings, bold/italic, inline code, fenced code,
// links, unordered lists, horizontal rules, and paragraphs. Input is HTML-escaped
// first, so author text can never inject markup.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline transforms applied to already-escaped, non-code text. */
function inline(s: string): string {
  return s
    .replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline">$1</a>',
    )
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-[0.85em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

export function markdownToHtml(md: string): string {
  const src = escapeHtml(md.replace(/\r\n/g, "\n"));
  const out: string[] = [];
  const lines = src.split("\n");
  let i = 0;
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code block.
    if (line.trim().startsWith("```")) {
      closeList();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        buf.push(lines[i]!);
        i++;
      }
      i++; // skip closing fence
      out.push(
        `<pre class="overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed"><code>${buf.join("\n")}</code></pre>`,
      );
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      closeList();
      out.push('<hr class="my-3 border-border" />');
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1]!.length;
      const sizes = ["text-xl", "text-lg", "text-base", "text-sm", "text-sm", "text-sm"];
      out.push(`<h${level} class="mt-3 mb-1 font-semibold ${sizes[level - 1]}">${inline(heading[2]!)}</h${level}>`);
      i++;
      continue;
    }

    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      if (!inList) {
        out.push('<ul class="my-2 list-disc pl-5">');
        inList = true;
      }
      out.push(`<li>${inline(li[1]!)}</li>`);
      i++;
      continue;
    }

    if (line.trim() === "") {
      closeList();
      i++;
      continue;
    }

    closeList();
    out.push(`<p class="my-2 leading-relaxed">${inline(line)}</p>`);
    i++;
  }
  closeList();
  return out.join("\n");
}
