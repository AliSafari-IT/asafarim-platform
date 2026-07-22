import { describe, expect, it } from "vitest";
import { SelectionContext } from "./selectionContext";

describe("SelectionContext schema — bounded, stable-id-only shape", () => {
  it("accepts a minimal valid context (app + version only)", () => {
    expect(SelectionContext.safeParse({ appId: "app_1", specificationVersionNumber: 3 }).success).toBe(true);
  });

  it("accepts a full context with page/component/kind/label/registryMetadata", () => {
    const result = SelectionContext.safeParse({
      appId: "app_1",
      specificationVersionNumber: 3,
      pageId: "tasks",
      componentId: "tasks_table",
      componentKind: "dataTable",
      label: "Tasks table",
      registryMetadata: { variant: "table", density: "compact" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing appId", () => {
    expect(SelectionContext.safeParse({ specificationVersionNumber: 3 }).success).toBe(false);
  });

  it("rejects a negative version number", () => {
    expect(SelectionContext.safeParse({ appId: "app_1", specificationVersionNumber: -1 }).success).toBe(false);
  });

  it("rejects an oversized label (unbounded rendered text is not allowed)", () => {
    const result = SelectionContext.safeParse({
      appId: "app_1",
      specificationVersionNumber: 3,
      label: "x".repeat(10_000),
    });
    expect(result.success).toBe(false);
  });

  it("rejects registryMetadata carrying a non-primitive (e.g. an attempt to smuggle a nested object/DOM-shaped payload)", () => {
    const result = SelectionContext.safeParse({
      appId: "app_1",
      specificationVersionNumber: 3,
      registryMetadata: { nested: { evil: true } },
    });
    expect(result.success).toBe(false);
  });

  it("does not itself carry any raw-DOM/HTML/cookie/token-shaped field — only the allowlisted keys pass through", () => {
    const result = SelectionContext.safeParse({
      appId: "app_1",
      specificationVersionNumber: 3,
      cookie: "session=abc",
      innerHTML: "<script>evil()</script>",
    });
    expect(result.success).toBe(true); // extra unknown keys are stripped by zod, not rejected
    if (result.success) {
      expect(result.data).not.toHaveProperty("cookie");
      expect(result.data).not.toHaveProperty("innerHTML");
    }
  });
});
