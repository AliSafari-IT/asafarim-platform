import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TopNav } from "./TopNav";

describe("TopNav", () => {
  it("puts the Menu dropdown in the shared header-menu group", () => {
    // MenuOutsideClick and the exclusive <details name> group both rely on
    // this; without it the Menu stayed open on outside clicks.
    const html = renderToStaticMarkup(
      <TopNav items={[{ label: "Overview", href: "/" }]} />,
    );
    expect(html).toMatch(/<details[^>]*class="ui-menu ui-topnav-mobile"[^>]*name="ui-header-menu"/);
  });
});
