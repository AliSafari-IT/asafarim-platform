import { describe, expect, it } from "vitest";
import { ApplicationSpecification } from "./specification";
import { validateSpecification } from "./validation";
import {
  constructionTaskManagementFixture,
  duplicateIdsFixture,
  brokenRelationsFixture,
  orphanedComponentReferencesFixture,
  privilegeEscalationFixture,
  scriptInjectionFixture,
  sqlInjectionFixture,
  circularWorkflowFixture,
  reservedIdentifierFixture,
} from "./fixtures";
import type { ApplicationSpecificationType } from "./specification";

/** Adversarial fixtures with Zod-valid shape but semantic problems — parse then validate. */
function parseLoosely(raw: unknown): ApplicationSpecificationType {
  const result = ApplicationSpecification.parse(raw);
  return result;
}

describe("validateSpecification", () => {
  it("accepts the construction task-management fixture with no errors", () => {
    const result = validateSpecification(constructionTaskManagementFixture);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects duplicate entity ids", () => {
    const result = validateSpecification(parseLoosely(duplicateIdsFixture));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "duplicate_id")).toBe(true);
  });

  it("rejects a relation pointing at a nonexistent entity", () => {
    const result = validateSpecification(parseLoosely(brokenRelationsFixture));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "orphaned_reference")).toBe(true);
  });

  it("rejects a component bound to a nonexistent entity", () => {
    const result = validateSpecification(parseLoosely(orphanedComponentReferencesFixture));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "orphaned_reference")).toBe(true);
  });

  it("rejects a permission referencing a role that was never created (privilege escalation attempt)", () => {
    const result = validateSpecification(parseLoosely(privilegeEscalationFixture));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "orphaned_reference")).toBe(true);
  });

  it("rejects a <script> payload smuggled through a free-text field", () => {
    const result = validateSpecification(parseLoosely(scriptInjectionFixture));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "unsafe_content")).toBe(true);
  });

  it("rejects a SQL-injection-shaped payload smuggled through a free-text field", () => {
    const result = validateSpecification(parseLoosely(sqlInjectionFixture));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "unsafe_content")).toBe(true);
  });

  it("rejects a circular condition-step reference in a workflow", () => {
    const result = validateSpecification(parseLoosely(circularWorkflowFixture));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "circular_reference")).toBe(true);
  });

  it("rejects a reserved word used as an entity machineName", () => {
    const result = validateSpecification(parseLoosely(reservedIdentifierFixture));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "reserved_name")).toBe(true);
  });

  it("produces path-aware errors", () => {
    const result = validateSpecification(parseLoosely(duplicateIdsFixture));
    expect(result.errors[0].path).toEqual(expect.arrayContaining(["entities"]));
  });

  it("is deterministic — validating the same spec twice yields identical errors", () => {
    const spec = parseLoosely(duplicateIdsFixture);
    const first = validateSpecification(spec);
    const second = validateSpecification(spec);
    expect(first).toEqual(second);
  });
});

describe("unsupported component/action kinds (Zod-level)", () => {
  it("rejects an unsupported component kind at parse time", () => {
    const raw = {
      ...constructionTaskManagementFixture,
      pages: [
        {
          id: "bad_page",
          name: "Bad",
          path: "bad",
          archived: false,
          components: [{ id: "c1", kind: "rawHtmlInjector", config: {}, order: 0 }],
        },
      ],
    };
    expect(ApplicationSpecification.safeParse(raw).success).toBe(false);
  });

  it("rejects an unsupported action kind at parse time", () => {
    const raw = {
      ...constructionTaskManagementFixture,
      actions: [{ id: "a1", name: "Bad", kind: "runShellCommand", config: {}, archived: false }],
    };
    expect(ApplicationSpecification.safeParse(raw).success).toBe(false);
  });

  it("rejects a spec with more entities than the bounded limit", () => {
    const raw = {
      ...constructionTaskManagementFixture,
      entities: Array.from({ length: 101 }, (_, i) => ({
        id: `e${i}`,
        machineName: `e${i}`,
        name: `E${i}`,
        fields: [],
        indexes: [],
        archived: false,
      })),
    };
    expect(ApplicationSpecification.safeParse(raw).success).toBe(false);
  });
});
