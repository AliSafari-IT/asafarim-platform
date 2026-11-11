import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable } from "@asafarim/ui";
import { userColumns, type UserRow } from "./columns";

const user = (over: Partial<UserRow> = {}): UserRow => ({
  id: "u1",
  name: "Ali",
  username: "tlwiojcvzdqaeuurinmkb",
  email: "ali@example.com",
  isActive: true,
  createdAt: new Date("2026-01-02T00:00:00Z"),
  updatedAt: new Date("2026-11-03T00:00:00Z"),
  userRoles: [{ role: { name: "superadmin" } }],
  ...over,
});

const render = (rows: UserRow[]) =>
  renderToStaticMarkup(
    createElement(DataTable<UserRow>, {
      columns: userColumns(),
      rows,
      getRowKey: (row) => row.id,
      stack: "wide",
    })
  );

describe("users table columns", () => {
  it("keeps five columns: username under the name, both dates in one cell", () => {
    const html = render([user()]);
    expect(html.match(/<th[ >]/g)).toHaveLength(5);
    expect(html).not.toContain('data-label="Username"');
    expect(html).toContain('data-label="Created / updated"');
    expect(html).toContain("@tlwiojcvzdqaeuurinmkb");
    expect(html).toContain("2026-01-02");
    expect(html).toContain("2026-11-03");
  });

  it("lets long e-mails and usernames wrap instead of widening the table", () => {
    expect(render([user()])).toContain("ui-table__primary--wrap");
  });

  it("leaves the username line out when there is none", () => {
    expect(render([user({ username: null })])).not.toContain(
      "ui-table__sub u-mono"
    );
  });

  it("shows three app chips and a +N toggle", () => {
    const html = render([user()]);
    const shown = html.slice(
      html.indexOf("ui-chiplist"),
      html.indexOf("<details")
    );
    expect(shown.match(/ui-badge /g)).toHaveLength(3);
    expect(html).toMatch(/<summary[^>]*>\+\d+<\/summary>/);
  });
});
