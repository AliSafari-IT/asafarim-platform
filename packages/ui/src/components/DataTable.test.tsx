import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable, columnLabel, type ColumnDef } from "./DataTable";

interface Row {
  id: string;
  email: string;
  events: number;
}

const columns: ColumnDef<Row>[] = [
  { id: "email", header: "Email", render: (row) => row.email },
  { id: "events", header: "Events", align: "right", render: (row) => row.events },
  { id: "badge", header: <span>Status</span>, label: "Status", render: () => "active" },
  { id: "actions", header: "", render: () => <a href="#">edit</a> },
];
const rows: Row[] = [{ id: "u1", email: "ali@example.com", events: 3 }];

describe("DataTable", () => {
  it("labels every cell with its column, for the stacked layout", () => {
    const html = renderToStaticMarkup(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    expect(html).toContain('data-label="Email"');
    expect(html).toContain('data-label="Events"');
    // An element header takes its label from `label`.
    expect(html).toContain('data-label="Status"');
    // An empty header gives no label, so the value takes the whole line.
    expect(html.match(/data-label=/g)).toHaveLength(3);
  });

  it("stacks on narrow containers by default, and can opt out", () => {
    const auto = renderToStaticMarkup(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    expect(auto).toContain('class="ui-tablewrap ui-tablewrap--stack"');
    const never = renderToStaticMarkup(
      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} stack="never" />,
    );
    expect(never).toContain('class="ui-tablewrap"');
    expect(never).not.toContain("ui-tablewrap--stack");
  });
});

describe("columnLabel", () => {
  it("prefers an explicit label, then a string header", () => {
    expect(columnLabel({ id: "a", header: "Actor", render: () => null })).toBe("Actor");
    expect(columnLabel({ id: "b", header: <b>X</b>, render: () => null })).toBeUndefined();
    expect(columnLabel({ id: "c", header: <b>X</b>, label: "Target", render: () => null })).toBe("Target");
    expect(columnLabel({ id: "d", header: "Shown", label: "", render: () => null })).toBeUndefined();
  });
});
