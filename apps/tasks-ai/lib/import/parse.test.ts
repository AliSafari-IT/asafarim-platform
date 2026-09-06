import { describe, expect, it } from "vitest";
import { stageRows } from "./parse";

const mapping = { title: "Title", description: "Notes", dueDate: "Due", externalId: "Id" };

describe("stageRows", () => {
  it("stages valid CSV rows as ok with stable rowKeys from externalId", () => {
    const csv = "Id,Title,Notes,Due\n1,Draft brief,,2026-09-10\n2,Review,check,\n";
    const { rows, totalRows } = stageRows("csv", csv, mapping);
    expect(totalRows).toBe(2);
    expect(rows[0]).toMatchObject({ rowKey: "1", status: "ok", data: { title: "Draft brief" } });
    expect(rows[1].data.title).toBe("Review");
  });

  it("flags missing titles and bad dates as error rows", () => {
    const csv = "Id,Title,Notes,Due\n1,,,2026-09-10\n2,Ok,,not-a-date\n";
    const { rows } = stageRows("csv", csv, mapping);
    expect(rows[0].status).toBe("error");
    expect(rows[0].errors).toContain("title is required");
    expect(rows[1].status).toBe("error");
    expect(rows[1].errors[0]).toMatch(/date/);
  });

  it("marks a repeated rowKey as duplicate (idempotent re-run)", () => {
    const csv = "Id,Title,Notes,Due\n7,A,,\n7,A,,\n";
    const { rows } = stageRows("csv", csv, mapping);
    expect(rows[0].status).toBe("ok");
    expect(rows[1].status).toBe("duplicate");
  });

  it("accepts a JSON array and { items: [] }", () => {
    const a = stageRows("json", JSON.stringify([{ Title: "X" }]), { title: "Title" });
    const b = stageRows("json", JSON.stringify({ items: [{ Title: "Y" }] }), { title: "Title" });
    expect(a.rows[0].data.title).toBe("X");
    expect(b.rows[0].data.title).toBe("Y");
  });

  it("rejects hostile / malformed files safely", () => {
    expect(() => stageRows("json", "{not json", { title: "t" })).toThrow(/valid JSON/);
    expect(() => stageRows("json", JSON.stringify({ nope: 1 }), { title: "t" })).toThrow(/array of objects/);
  });
});
