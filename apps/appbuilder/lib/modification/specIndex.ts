import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";

/**
 * M13 slice D — a deterministic, read-only search index over the CURRENT
 * specification.
 *
 * The reported failure this exists to fix is root cause #6: "the title whose
 * value is Home" was never first resolved against an indexed view of the
 * specification, so a request with exactly one correct answer came back as
 * "too broad". Indexing is therefore keyed on the three things a user
 * actually refers to in conversation:
 *
 * 1. **stable ids** (`home`, `tasks_table`) — what operations address;
 * 2. **current values** ("Home", "#111111") — "the title whose value is Home";
 * 3. **property words** ("title", "colour", "path") — "change the title".
 *
 * One `IndexedTarget` is one *editable property of one specification
 * object*, not one object. That granularity matters: "rename the Home page"
 * and "recolour it" resolve to different targets on overlapping subjects,
 * and an operation always mutates a property, never an object wholesale.
 *
 * This module is pure — no database, no actor, no I/O — so the resolver and
 * its regression cases can be exercised without a running Postgres.
 */

export type SpecTargetKind =
  | "page"
  | "component"
  | "navigationItem"
  | "entity"
  | "field"
  | "dashboardWidget"
  | "action"
  | "branding"
  | "appMetadata";

export interface IndexedTarget {
  /**
   * The deterministic address of this property, e.g. `pages.home.name` or
   * `pages.home.components.tasks_table.config.title`. Stable across index
   * rebuilds for an unchanged specification, which is what lets conversation
   * memory reference a target durably (and detect when it disappears).
   */
  targetId: string;
  kind: SpecTargetKind;
  /** The editable property this target addresses (`name`, `path`, `label`, `primaryColor`, `config.title`, …). */
  property: string;
  /** The property's current value, stringified and bounded; `null` when unset. */
  value: string | null;
  /** How this target is described back to a human, e.g. `the "Home" page's title`. */
  label: string;
  /** Words a user might use for this property — matched case-insensitively, never used as an operation key. */
  aliases: readonly string[];
  /** True when this property renders as visible text in the running app — what "the title whose value is Home" searches. */
  visibleText: boolean;
  archived: boolean;

  // Stable specification ids an operation would need. Only the ones that
  // apply to this target's kind are set.
  pageId?: string;
  componentId?: string;
  componentKind?: string;
  entityId?: string;
  fieldId?: string;
  navigationItemId?: string;
  widgetId?: string;
  actionId?: string;
  /**
   * For a navigation item: the page it links to. Deliberately NOT `pageId` —
   * selecting a page in the preview must not silently also select every
   * navigation link pointing at it, or "the selected title" would tie
   * between the page title and its menu entry.
   */
  linkedPageId?: string;
}

export interface SpecIndex {
  specificationVersionNumber: number;
  targets: readonly IndexedTarget[];
  /** `targetId` → target. */
  byTargetId: ReadonlyMap<string, IndexedTarget>;
  /** A stable specification id (page/component/entity/…) → every target belonging to it. */
  byStableId: ReadonlyMap<string, readonly IndexedTarget[]>;
  /** Normalized current value → every target holding it. Duplicates here are exactly the "two things named Home" case. */
  byNormalizedValue: ReadonlyMap<string, readonly IndexedTarget[]>;
}

/** Lowercase, trim, collapse internal whitespace. The single normalization used for every value/label/alias comparison in slice D. */
export function normalizeText(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Component/widget config keys whose values are visible text a user would
 * refer to by what it says. `config` is deliberately free-form JSON
 * (packages/appbuilder-schema/src/ui.ts) and only the M06 renderer gives its
 * keys meaning, so indexing every key would invent targets the runtime does
 * not render. This bounded allowlist is the honest subset.
 */
const VISIBLE_TEXT_CONFIG_KEYS = ["title", "heading", "label", "caption", "text", "description"] as const;

const PAGE_TITLE_ALIASES = ["title", "page title", "page name", "name", "heading", "label"] as const;
/**
 * Deliberately excludes "title": a navigation entry is a link, not a title.
 * Including it made "the title whose value is Home" tie between the Home
 * page's title and the Home menu link in an app that has both — which is
 * exactly the spurious ambiguity M13 exists to remove, since the two have
 * the same value by design.
 */
const NAV_LABEL_ALIASES = ["label", "nav label", "navigation label", "menu item", "menu label", "link", "link text"] as const;
const COLOR_ALIASES = ["color", "colour", "primary color", "primary colour", "brand color", "brand colour", "accent color", "theme color"] as const;

const MAX_INDEXED_VALUE_CHARS = 200;

function boundValue(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") return raw.slice(0, MAX_INDEXED_VALUE_CHARS);
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  return null;
}

/**
 * Builds the index for one specification version.
 *
 * Archived pages/entities/fields/actions ARE indexed, flagged
 * `archived: true`. Dropping them would make "the Home page" silently
 * unresolvable right after someone archives it — the resolver de-ranks them
 * instead, which is recoverable and explainable, where an empty candidate
 * list is neither.
 */
export function buildSpecIndex(
  spec: ApplicationSpecificationType,
  specificationVersionNumber: number,
): SpecIndex {
  const targets: IndexedTarget[] = [];

  const push = (target: IndexedTarget) => {
    targets.push(target);
  };

  // ─── App metadata ──────────────────────────────────────────────────────
  push({
    targetId: "app.name",
    kind: "appMetadata",
    property: "name",
    value: boundValue(spec.app?.name),
    label: `the app's name (${spec.app?.name ?? "unset"})`,
    aliases: ["app name", "application name", "name", "title"],
    visibleText: true,
    archived: false,
  });
  if (spec.app?.description !== undefined) {
    push({
      targetId: "app.description",
      kind: "appMetadata",
      property: "description",
      value: boundValue(spec.app.description),
      label: "the app's description",
      aliases: ["app description", "description", "tagline"],
      visibleText: true,
      archived: false,
    });
  }

  // ─── Branding ──────────────────────────────────────────────────────────
  const branding = spec.branding ?? {};
  push({
    targetId: "branding.primaryColor",
    kind: "branding",
    property: "primaryColor",
    value: boundValue(branding.primaryColor),
    label: `the app's primary brand colour (${branding.primaryColor ?? "unset"})`,
    aliases: COLOR_ALIASES,
    visibleText: false,
    archived: false,
  });
  push({
    targetId: "branding.theme",
    kind: "branding",
    property: "theme",
    value: boundValue(branding.theme),
    label: `the app's theme (${branding.theme ?? "system"})`,
    aliases: ["theme", "dark mode", "light mode", "appearance"],
    visibleText: false,
    archived: false,
  });
  if (branding.companyName !== undefined) {
    push({
      targetId: "branding.companyName",
      kind: "branding",
      property: "companyName",
      value: boundValue(branding.companyName),
      label: `the company name (${branding.companyName})`,
      aliases: ["company name", "brand name", "company", "name"],
      visibleText: true,
      archived: false,
    });
  }
  if (branding.logoUrl !== undefined) {
    push({
      targetId: "branding.logoUrl",
      kind: "branding",
      property: "logoUrl",
      value: boundValue(branding.logoUrl),
      label: "the app's logo",
      aliases: ["logo", "logo url", "brand image"],
      visibleText: false,
      archived: false,
    });
  }
  if (branding.faviconUrl !== undefined) {
    push({
      targetId: "branding.faviconUrl",
      kind: "branding",
      property: "faviconUrl",
      value: boundValue(branding.faviconUrl),
      label: "the app's favicon",
      aliases: ["favicon", "tab icon", "icon"],
      visibleText: false,
      archived: false,
    });
  }

  // ─── Pages and their components ────────────────────────────────────────
  for (const page of spec.pages ?? []) {
    push({
      targetId: `pages.${page.id}.name`,
      kind: "page",
      property: "name",
      value: boundValue(page.name),
      label: `the "${page.name}" page's title`,
      aliases: PAGE_TITLE_ALIASES,
      visibleText: true,
      archived: Boolean(page.archived),
      pageId: page.id,
    });
    push({
      targetId: `pages.${page.id}.path`,
      kind: "page",
      property: "path",
      value: boundValue(page.path),
      label: `the "${page.name}" page's path (/${page.path})`,
      aliases: ["path", "url", "route", "slug", "address"],
      visibleText: false,
      archived: Boolean(page.archived),
      pageId: page.id,
    });

    for (const component of page.components ?? []) {
      push({
        targetId: `pages.${page.id}.components.${component.id}.kind`,
        kind: "component",
        property: "kind",
        value: boundValue(component.kind),
        label: `the ${component.kind} on the "${page.name}" page`,
        aliases: [component.kind, "component", "block", "element", "widget"],
        visibleText: false,
        archived: Boolean(page.archived),
        pageId: page.id,
        componentId: component.id,
        componentKind: component.kind,
        entityId: component.entityId,
      });

      for (const key of VISIBLE_TEXT_CONFIG_KEYS) {
        const raw = (component.config as Record<string, unknown> | undefined)?.[key];
        if (typeof raw !== "string" || raw.length === 0) continue;
        push({
          targetId: `pages.${page.id}.components.${component.id}.config.${key}`,
          kind: "component",
          property: `config.${key}`,
          value: boundValue(raw),
          label: `the ${component.kind}'s ${key} on the "${page.name}" page ("${raw}")`,
          aliases: key === "title" || key === "heading" ? PAGE_TITLE_ALIASES : [key, "text", "label"],
          visibleText: true,
          archived: Boolean(page.archived),
          pageId: page.id,
          componentId: component.id,
          componentKind: component.kind,
          entityId: component.entityId,
        });
      }
    }
  }

  // ─── Navigation ────────────────────────────────────────────────────────
  for (const item of spec.navigation ?? []) {
    push({
      targetId: `navigation.${item.id}.label`,
      kind: "navigationItem",
      property: "label",
      value: boundValue(item.label),
      label: `the "${item.label}" navigation link`,
      aliases: NAV_LABEL_ALIASES,
      visibleText: true,
      archived: false,
      navigationItemId: item.id,
      linkedPageId: item.targetPageId,
    });
  }

  // ─── Entities and fields ───────────────────────────────────────────────
  for (const entity of spec.entities ?? []) {
    push({
      targetId: `entities.${entity.id}.name`,
      kind: "entity",
      property: "name",
      value: boundValue(entity.name),
      label: `the "${entity.name}" entity's name`,
      aliases: ["entity", "table", "model", "record type", "name", "title"],
      visibleText: true,
      archived: Boolean(entity.archived),
      entityId: entity.id,
    });
    for (const field of entity.fields ?? []) {
      push({
        targetId: `entities.${entity.id}.fields.${field.id}.name`,
        kind: "field",
        property: "name",
        value: boundValue(field.name),
        label: `the "${field.name}" field on "${entity.name}"`,
        aliases: ["field", "column", "attribute", "property", "name", "label"],
        visibleText: true,
        archived: Boolean(field.archived),
        entityId: entity.id,
        fieldId: field.id,
      });
    }
  }

  // ─── Dashboard widgets ─────────────────────────────────────────────────
  for (const widget of spec.dashboard?.widgets ?? []) {
    push({
      targetId: `dashboard.widgets.${widget.id}.kind`,
      kind: "dashboardWidget",
      property: "kind",
      value: boundValue(widget.kind),
      label: `the ${widget.kind} on the dashboard`,
      aliases: [widget.kind, "widget", "dashboard widget", "card", "tile"],
      visibleText: false,
      archived: false,
      widgetId: widget.id,
      componentId: widget.id,
      entityId: widget.entityId,
    });
    for (const key of VISIBLE_TEXT_CONFIG_KEYS) {
      const raw = (widget.config as Record<string, unknown> | undefined)?.[key];
      if (typeof raw !== "string" || raw.length === 0) continue;
      push({
        targetId: `dashboard.widgets.${widget.id}.config.${key}`,
        kind: "dashboardWidget",
        property: `config.${key}`,
        value: boundValue(raw),
        label: `the dashboard ${widget.kind}'s ${key} ("${raw}")`,
        aliases: key === "title" || key === "heading" ? PAGE_TITLE_ALIASES : [key, "text", "label"],
        visibleText: true,
        archived: false,
        widgetId: widget.id,
        componentId: widget.id,
        entityId: widget.entityId,
      });
    }
  }

  // ─── Actions ───────────────────────────────────────────────────────────
  for (const action of spec.actions ?? []) {
    push({
      targetId: `actions.${action.id}.name`,
      kind: "action",
      property: "name",
      value: boundValue(action.name),
      label: `the "${action.name}" action`,
      aliases: ["action", "button", "name", "label", "title"],
      visibleText: true,
      archived: Boolean(action.archived),
      actionId: action.id,
      entityId: action.entityId,
    });
  }

  return finalizeIndex(targets, specificationVersionNumber);
}

function finalizeIndex(targets: IndexedTarget[], specificationVersionNumber: number): SpecIndex {
  const byTargetId = new Map<string, IndexedTarget>();
  const byStableId = new Map<string, IndexedTarget[]>();
  const byNormalizedValue = new Map<string, IndexedTarget[]>();

  for (const target of targets) {
    byTargetId.set(target.targetId, target);

    for (const stableId of stableIdsOf(target)) {
      const bucket = byStableId.get(stableId);
      if (bucket) bucket.push(target);
      else byStableId.set(stableId, [target]);
    }

    if (target.value !== null && target.value.length > 0) {
      const key = normalizeText(target.value);
      const bucket = byNormalizedValue.get(key);
      if (bucket) bucket.push(target);
      else byNormalizedValue.set(key, [target]);
    }
  }

  return { specificationVersionNumber, targets, byTargetId, byStableId, byNormalizedValue };
}

/** Every stable specification id this target belongs to — what a request naming an id literally can match on. */
export function stableIdsOf(target: IndexedTarget): string[] {
  return [
    target.pageId,
    target.componentId,
    target.entityId,
    target.fieldId,
    target.navigationItemId,
    target.widgetId,
    target.actionId,
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** True when `phrase` names one of this target's property words (exact match on a normalized alias — never a substring, so "colour scheme" doesn't silently match "colour"). */
export function matchesPropertyAlias(target: IndexedTarget, phrase: string): boolean {
  const normalized = normalizeText(phrase);
  if (normalized.length === 0) return false;
  if (normalizeText(target.property) === normalized) return true;
  return target.aliases.some((alias) => normalizeText(alias) === normalized);
}
