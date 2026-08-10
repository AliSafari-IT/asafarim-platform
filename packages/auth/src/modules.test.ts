import { describe, expect, it } from "vitest";
import { PLATFORM_APPS } from "./apps";
import {
  MATRIX_ROLES,
  NAV_MODULES,
  getNavModule,
  isModuleVisible,
  parseModuleOverrides,
  serializeModuleOverrides,
  type ModuleOverrides,
} from "./modules";
import { ROLES } from "./roles";

const admin = { roles: [ROLES.ADMIN] };
const standard = { roles: [ROLES.STANDARD_USER] };
const superadmin = { roles: [ROLES.SUPERADMIN] };

describe("registry shape", () => {
  it("gives every module a unique id", () => {
    const ids = NAV_MODULES.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries one entry per registered platform app", () => {
    for (const app of PLATFORM_APPS) {
      expect(getNavModule(`app.${app.key}`)).toBeDefined();
    }
  });

  it("only uses roles the matrix can render as columns", () => {
    for (const module of NAV_MODULES) {
      for (const role of module.defaultRoles) {
        expect(MATRIX_ROLES).toContain(role);
      }
    }
  });
});

describe("visibility resolution", () => {
  it("falls back to registry defaults when there is no override", () => {
    expect(isModuleVisible("console.users", admin)).toBe(true);
    expect(isModuleVisible("console.users", standard)).toBe(false);
  });

  it("applies an override in place of the default", () => {
    const overrides: ModuleOverrides = { "console.users": [ROLES.STANDARD_USER] };
    expect(isModuleVisible("console.users", { ...standard, overrides })).toBe(true);
    expect(isModuleVisible("console.users", { ...admin, overrides })).toBe(false);
  });

  it("treats an empty override as hidden, not as absent", () => {
    const overrides: ModuleOverrides = { "console.settings": [] };
    expect(isModuleVisible("console.settings", { ...admin, overrides })).toBe(false);
  });

  it("keeps every module visible to superadmin, even when hidden", () => {
    // Without this, saving a matrix that hides the access-control page from
    // superadmin would remove the only editor that could undo it.
    const overrides: ModuleOverrides = { "console.access": [] };
    expect(isModuleVisible("console.access", { ...superadmin, overrides })).toBe(true);
  });

  it("hides modules that are not in the registry", () => {
    expect(isModuleVisible("console.removed", superadmin)).toBe(true);
    expect(isModuleVisible("console.removed", admin)).toBe(false);
  });
});

describe("parseModuleOverrides", () => {
  it("drops unknown module ids and unknown roles", () => {
    const parsed = parseModuleOverrides({
      "console.users": [ROLES.ADMIN, "sorcerer"],
      "console.gone": [ROLES.ADMIN],
    });
    expect(parsed).toEqual({ "console.users": [ROLES.ADMIN] });
  });

  it("de-duplicates roles", () => {
    const parsed = parseModuleOverrides({
      "console.users": [ROLES.ADMIN, ROLES.ADMIN],
    });
    expect(parsed["console.users"]).toEqual([ROLES.ADMIN]);
  });

  it("returns an empty map for junk input", () => {
    expect(parseModuleOverrides(null)).toEqual({});
    expect(parseModuleOverrides("nope")).toEqual({});
    expect(parseModuleOverrides([1, 2])).toEqual({});
    expect(parseModuleOverrides({ "console.users": "admin" })).toEqual({});
  });
});

describe("serializeModuleOverrides", () => {
  it("omits modules that match their default, in any order", () => {
    const users = getNavModule("console.users")!;
    const serialized = serializeModuleOverrides({
      "console.users": [...users.defaultRoles].reverse(),
    });
    expect(serialized).toEqual({});
  });

  it("keeps genuine deviations, including hiding everything", () => {
    const serialized = serializeModuleOverrides({
      "console.users": [],
      "console.devices": [ROLES.STANDARD_USER],
    });
    expect(serialized).toEqual({
      "console.users": [],
      "console.devices": [ROLES.STANDARD_USER],
    });
  });

  it("round-trips through parse without changing meaning", () => {
    const serialized = serializeModuleOverrides({
      "console.devices": [ROLES.STANDARD_USER, ROLES.ADMIN],
    });
    expect(parseModuleOverrides(serialized)).toEqual(serialized);
  });
});
