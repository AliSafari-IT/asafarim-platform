import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";
import { ChipList } from "./ChipList";

const chips = (n: number) =>
  Array.from({ length: n }, (_, i) => <Badge key={i}>app{i}</Badge>);

describe("ChipList", () => {
  it("shows an em dash when there is nothing", () => {
    expect(renderToStaticMarkup(<ChipList items={[]} />)).toContain("—");
  });

  it("shows everything, with no toggle, up to the limit", () => {
    const html = renderToStaticMarkup(<ChipList items={chips(3)} max={3} />);
    expect(html.match(/ui-badge /g)).toHaveLength(3);
    expect(html).not.toContain("<details");
  });

  it("keeps the first few visible and puts the rest behind a labelled +N toggle", () => {
    const html = renderToStaticMarkup(
      <ChipList items={chips(12)} max={3} noun="apps" />
    );
    expect(html).toContain("<details");
    expect(html).toContain(">+9</summary>");
    expect(html).toContain('aria-label="Show 9 more apps"');
    // all twelve are still in the markup, nine of them inside the details
    expect(html.match(/ui-badge /g)).toHaveLength(12);
    const inside = html.slice(html.indexOf("<details"));
    expect(inside.match(/ui-badge /g)).toHaveLength(9);
  });
});
