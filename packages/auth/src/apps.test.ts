import { describe, expect, it } from "vitest";
import {
  PLATFORM_APPS,
  canAccessApp,
  getAccessibleApps,
  getAppAccessDecision,
  getPlatformApp,
} from "./apps";
import { ROLES } from "./roles";

const web = getPlatformApp("web")!;
const hub = getPlatformApp("hub")!;
const showcase = getPlatformApp("showcase")!;
const admin = getPlatformApp("admin")!;
const vionto = getPlatformApp("vionto")!;
const edumatch = getPlatformApp("edumatch")!;

const anonymous = { roles: [], authenticated: false };
const roleless = { roles: [], authenticated: true };
const standard = { roles: [ROLES.STANDARD_USER], authenticated: true };
const adminUser = { roles: [ROLES.ADMIN], authenticated: true };
const superadmin = { roles: [ROLES.SUPERADMIN], authenticated: true };
/** Deactivated accounts cannot hold a session: authenticated=false. */
const inactiveAdmin = { roles: [ROLES.ADMIN], authenticated: false };

describe("registry shape", () => {
  it("registers the five active platform apps and only those", () => {
    const active = PLATFORM_APPS.filter((app) => app.status === "active");
    expect(active.map((app) => app.key).sort()).toEqual([
      "admin",
      "hub",
      "showcase",
      "vionto",
      "web",
    ]);
  });

  it("grants nobody access to deferred apps", () => {
    for (const app of PLATFORM_APPS.filter((a) => a.status === "coming-soon")) {
      expect(app.access).toBeNull();
    }
  });
});

describe("public apps", () => {
  it("are open to anonymous visitors", () => {
    expect(getAppAccessDecision(web, anonymous)).toEqual({
      allowed: true,
      reason: "public",
    });
    expect(canAccessApp(showcase, anonymous)).toBe(true);
  });
});

describe("authenticated apps", () => {
  it("deny anonymous visitors with a deterministic reason", () => {
    expect(getAppAccessDecision(hub, anonymous)).toEqual({
      allowed: false,
      reason: "not-authenticated",
    });
  });

  it("admit any signed-in active user, even roleless", () => {
    expect(getAppAccessDecision(hub, roleless)).toEqual({
      allowed: true,
      reason: "authenticated",
    });
    expect(canAccessApp(hub, standard)).toBe(true);
  });
});

describe("role-gated apps (admin console)", () => {
  it("denies roleless and standard users", () => {
    expect(getAppAccessDecision(admin, roleless)).toEqual({
      allowed: false,
      reason: "missing-role",
    });
    expect(canAccessApp(admin, standard)).toBe(false);
  });

  it("admits admins via their role", () => {
    expect(getAppAccessDecision(admin, adminUser)).toEqual({
      allowed: true,
      reason: "role",
    });
  });

  it("admits superadmin via the explicit bypass", () => {
    expect(getAppAccessDecision(admin, superadmin)).toEqual({
      allowed: true,
      reason: "superadmin",
    });
  });

  it("denies unauthenticated users regardless of roles (inactive accounts)", () => {
    expect(getAppAccessDecision(admin, inactiveAdmin)).toEqual({
      allowed: false,
      reason: "not-authenticated",
    });
  });
});

describe("public apps (vionto)", () => {
  it("is open to anonymous visitors now that the app has shipped", () => {
    expect(getAppAccessDecision(vionto, anonymous)).toEqual({
      allowed: true,
      reason: "public",
    });
  });
});

describe("coming-soon apps", () => {
  it("deny everyone, including superadmin", () => {
    expect(getAppAccessDecision(edumatch, superadmin)).toEqual({
      allowed: false,
      reason: "coming-soon",
    });
    expect(canAccessApp(edumatch, superadmin)).toBe(false);
  });
});

describe("getAccessibleApps", () => {
  it("gives an anonymous visitor only the public apps", () => {
    expect(getAccessibleApps(anonymous).map((app) => app.key).sort()).toEqual([
      "showcase",
      "vionto",
      "web",
    ]);
  });

  it("gives a standard user every app except admin and deferred ones", () => {
    expect(getAccessibleApps(standard).map((app) => app.key).sort()).toEqual([
      "hub",
      "showcase",
      "vionto",
      "web",
    ]);
  });

  it("gives an admin multiple apps at once — access is not one app per role", () => {
    expect(getAccessibleApps(adminUser).map((app) => app.key).sort()).toEqual([
      "admin",
      "hub",
      "showcase",
      "vionto",
      "web",
    ]);
  });

  it("gives a deactivated user only public apps", () => {
    expect(
      getAccessibleApps(inactiveAdmin).map((app) => app.key).sort()
    ).toEqual(["showcase", "vionto", "web"]);
  });
});
