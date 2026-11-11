/**
 * Layout check for the users table in a real browser: at every common
 * viewport width, with the console sidebar (shown above 720px), the table
 * must fit its wrapper — no sideways scroll of the wrapper or the page —
 * and the collapsed Apps cell must stay one chip line tall.
 *
 * Needs a Chromium for @playwright/test; when none can be launched (the
 * unit-test CI job installs no browsers) the tests skip. Locally:
 *   pnpm --filter @asafarim/admin exec playwright install chromium
 * or point PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH at an existing Chromium.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "@playwright/test";
import { AppShell, DataTable, SideNav } from "@asafarim/ui";
import { userColumns, type UserRow } from "./columns";

const require = createRequire(import.meta.url);
const stylesDir = path.dirname(
  require.resolve("@asafarim/ui/styles/tokens.css")
);
const css = ["tokens.css", "base.css", "components.css"]
  .map((file) => readFileSync(path.join(stylesDir, file), "utf8"))
  .join("\n");

const roleSets = [
  ["superadmin"],
  ["admin"],
  ["standard_user"],
  ["admin", "tester"],
  [],
  ["guest"],
];
const rows: UserRow[] = Array.from({ length: 12 }, (_, i) => ({
  id: `cm${i}x9q2l0000abcdefghij`,
  name:
    i % 3 === 0
      ? "Maria Fernanda Gonçalves-Oliveira"
      : i % 3 === 1
        ? null
        : "Jo",
  // A 22-char random username and a long e-mail must not widen the table.
  username: i % 2 ? "tlwiojcvzdqaeuurinmkb" : null,
  email:
    i % 2
      ? "a.very.long.email.address.for.testing+admin-console@subdomain.example-company.com"
      : `user${i}@example.com`,
  isActive: i % 4 !== 3,
  createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
  updatedAt: new Date(Date.UTC(2026, 10, 1 + i)),
  userRoles: roleSets[i % roleSets.length].map((name) => ({ role: { name } })),
}));

const page =
  "<!doctype html>" +
  renderToStaticMarkup(
    createElement(
      "html",
      { lang: "en", "data-theme": "dark" },
      createElement(
        "head",
        null,
        createElement("meta", { charSet: "utf-8" }),
        createElement("style", { dangerouslySetInnerHTML: { __html: css } })
      ),
      createElement(
        "body",
        { "data-app": "admin" },
        createElement(AppShell, {
          product: "Admin",
          sideNav: createElement(SideNav, {
            title: "Console",
            items: ["Overview", "Users", "Roles", "Audit logs"].map(
              (label) => ({
                label,
                href: "#",
              })
            ),
          }),
          children: createElement(
            "form",
            null,
            createElement(DataTable<UserRow>, {
              columns: userColumns(),
              rows,
              getRowKey: (row) => row.id,
              selection: { name: "userIds" },
              stack: "wide",
            })
          ),
        })
      )
    )
  );

const WIDTHS = [640, 768, 960, 1024, 1280, 1440, 1920];

let browser: Browser | null = null;

beforeAll(async () => {
  try {
    const { chromium } = await import("@playwright/test");
    browser = await chromium.launch({
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    });
  } catch {
    browser = null;
  }
}, 30_000);

afterAll(async () => {
  await browser?.close();
});

describe("users table layout", () => {
  for (const width of WIDTHS) {
    it(`fits without sideways scroll at ${width}px`, async (ctx) => {
      if (!browser) return ctx.skip();
      const tab = await browser.newPage({ viewport: { width, height: 900 } });
      await tab.setContent(page);
      const m = await tab.evaluate(() => {
        const wrap = document.querySelector<HTMLElement>(".ui-tablewrap")!;
        const table = wrap.querySelector("table")!;
        const lists = [...table.querySelectorAll<HTMLElement>(".ui-chiplist")];
        return {
          tableScroll: table.scrollWidth,
          wrapScroll: wrap.scrollWidth,
          wrapClient: wrap.clientWidth,
          pageScroll: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
          stacked: getComputedStyle(table).display === "block",
          chipLines: lists.map(
            (list) =>
              list.getBoundingClientRect().height /
              list.firstElementChild!.getBoundingClientRect().height
          ),
        };
      });
      await tab.close();
      expect(m.tableScroll).toBeLessThanOrEqual(m.wrapClient);
      expect(m.wrapScroll).toBeLessThanOrEqual(m.wrapClient);
      expect(m.pageScroll).toBeLessThanOrEqual(m.viewport);
      if (!m.stacked) {
        // Three chips and "+N" on one line.
        for (const lines of m.chipLines) expect(lines).toBeLessThan(1.5);
      }
    });
  }

  it("opens and closes the rest of the apps in place from the keyboard", async (ctx) => {
    if (!browser) return ctx.skip();
    const tab = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await tab.setContent(page);
    const summary = tab.locator(".ui-chiplist__more > summary").first();
    await summary.focus();
    const outline = await summary.evaluate(
      (el) => getComputedStyle(el).outlineStyle
    );
    expect(outline).not.toBe("none");
    await tab.keyboard.press("Enter");
    const open = await summary.evaluate((el) => {
      const details = el.parentElement as HTMLDetailsElement;
      const rest = details.querySelector<HTMLElement>(".ui-chiplist__rest")!;
      const td = details.closest("td")!;
      const tops = new Set(
        [...rest.children].map((chip) =>
          Math.round(chip.getBoundingClientRect().top)
        )
      );
      const wrap = document.querySelector<HTMLElement>(".ui-tablewrap")!;
      return {
        open: details.open,
        chips: rest.children.length,
        lines: tops.size,
        withinCell:
          rest.getBoundingClientRect().right <=
          td.getBoundingClientRect().right + 0.5,
        fits: wrap.scrollWidth <= wrap.clientWidth,
      };
    });
    expect(open.open).toBe(true);
    // Wraps across the cell, several chips per line — not one per line.
    expect(open.lines).toBeLessThan(open.chips);
    expect(open.withinCell).toBe(true);
    expect(open.fits).toBe(true);
    await tab.keyboard.press("Enter");
    expect(
      await summary.evaluate(
        (el) => (el.parentElement as HTMLDetailsElement).open
      )
    ).toBe(false);
    await tab.close();
  });
});
