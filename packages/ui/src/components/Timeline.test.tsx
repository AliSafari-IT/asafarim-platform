import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Timeline } from "./Timeline";

describe("Timeline", () => {
  it("renders a plain title with no link when href is absent", () => {
    const html = renderToStaticMarkup(
      <Timeline items={[{ time: "2026-01-01 00:00", title: "Something happened", meta: "by someone" }]} />
    );
    expect(html).toContain("Something happened");
    expect(html).not.toContain("<a ");
  });

  it("wraps the title in a link, opening in a new tab, when href is present", () => {
    const html = renderToStaticMarkup(
      <Timeline
        items={[
          {
            time: "2026-01-01 00:00",
            title: "Vionto · export · clip.mp4",
            href: "https://vionto.asafarim.com/projects/p1",
          },
        ]}
      />
    );
    expect(html).toContain('href="https://vionto.asafarim.com/projects/p1"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Vionto · export · clip.mp4");
  });
});
