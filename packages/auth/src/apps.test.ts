import { describe, expect, it } from "vitest";
import {
  PLATFORM_APPS,
  canAccessApp,
  getAccessibleApps,
  getAppAccessDecision,
  getPlatformApp,
  getShowcaseApps,
  getShowcaseProject,
} from "./apps";
import { ROLES } from "./roles";

const web = getPlatformApp("web")!;
const hub = getPlatformApp("hub")!;
const showcase = getPlatformApp("showcase")!;
const admin = getPlatformApp("admin")!;
const vionto = getPlatformApp("vionto")!;
const testora = getPlatformApp("testora")!;
const appbuilder = getPlatformApp("appbuilder")!;
const edumatch = getPlatformApp("edumatch")!;

const anonymous = { roles: [], authenticated: false };
const roleless = { roles: [], authenticated: true };
const standard = { roles: [ROLES.STANDARD_USER], authenticated: true };
const adminUser = { roles: [ROLES.ADMIN], authenticated: true };
const superadmin = { roles: [ROLES.SUPERADMIN], authenticated: true };
/** Deactivated accounts cannot hold a session: authenticated=false. */
const inactiveAdmin = { roles: [ROLES.ADMIN], authenticated: false };

describe("registry shape", () => {
  it("registers the eleven active platform apps and only those", () => {
    const active = PLATFORM_APPS.filter((app) => app.status === "active");
    expect(active.map((app) => app.key).sort()).toEqual([
      "admin",
      "appbuilder",
      "devtools",
      "edumatch",
      "hub",
      "labs",
      "showcase",
      "testora",
      "timelineai",
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

describe("public apps (testora)", () => {
  it("is open to anonymous visitors — private apps-under-test gate themselves inside the tool", () => {
    expect(getAppAccessDecision(testora, anonymous)).toEqual({
      allowed: true,
      reason: "public",
    });
  });
});

describe("authenticated apps (appbuilder)", () => {
  it("denies anonymous visitors", () => {
    expect(getAppAccessDecision(appbuilder, anonymous)).toEqual({
      allowed: false,
      reason: "not-authenticated",
    });
  });

  it("admits any signed-in active user, even roleless — per-app ownership is enforced inside AppBuilder, not here", () => {
    expect(getAppAccessDecision(appbuilder, roleless)).toEqual({
      allowed: true,
      reason: "authenticated",
    });
  });

  it("denies a deactivated user (authenticated=false)", () => {
    expect(getAppAccessDecision(appbuilder, inactiveAdmin)).toEqual({
      allowed: false,
      reason: "not-authenticated",
    });
  });
});

describe("public apps (edumatch)", () => {
  it("is open to anonymous visitors — student/tutor routes gate themselves inside the app", () => {
    expect(getAppAccessDecision(edumatch, anonymous)).toEqual({
      allowed: true,
      reason: "public",
    });
    expect(canAccessApp(edumatch, superadmin)).toBe(true);
  });
});

describe("getAccessibleApps", () => {
  it("gives an anonymous visitor only the public apps", () => {
    expect(getAccessibleApps(anonymous).map((app) => app.key).sort()).toEqual([
      "devtools",
      "edumatch",
      "labs",
      "showcase",
      "testora",
      "timelineai",
      "vionto",
      "web",
    ]);
  });

  it("gives a standard user every app except admin and deferred ones", () => {
    expect(getAccessibleApps(standard).map((app) => app.key).sort()).toEqual([
      "appbuilder",
      "devtools",
      "edumatch",
      "hub",
      "labs",
      "showcase",
      "testora",
      "timelineai",
      "vionto",
      "web",
    ]);
  });

  it("gives an admin multiple apps at once — access is not one app per role", () => {
    expect(getAccessibleApps(adminUser).map((app) => app.key).sort()).toEqual([
      "admin",
      "appbuilder",
      "devtools",
      "edumatch",
      "hub",
      "labs",
      "showcase",
      "testora",
      "timelineai",
      "vionto",
      "web",
    ]);
  });

  it("gives a deactivated user only public apps", () => {
    expect(
      getAccessibleApps(inactiveAdmin).map((app) => app.key).sort()
    ).toEqual([
      "devtools",
      "edumatch",
      "labs",
      "showcase",
      "testora",
      "timelineai",
      "vionto",
      "web",
    ]);
  });
});

describe("showcase positioning", () => {
  it("marks exactly the four public product apps as showcases", () => {
    expect(getShowcaseApps().map((app) => app.key).sort()).toEqual([
      "edumatch",
      "testora",
      "timelineai",
      "vionto",
    ]);
  });

  it("keeps infrastructure, internal, and studio apps out of it", () => {
    // web IS ASafarIM Digital; hub/admin are internal; showcase already says
    // everything on it is a demo. A notice on any of these would either
    // contradict itself or duplicate messaging.
    for (const key of ["web", "hub", "admin", "showcase", "appbuilder"]) {
      expect(getShowcaseProject(key)).toBeUndefined();
    }
  });

  it("never marks a coming-soon app as a showcase", () => {
    for (const app of getShowcaseApps()) {
      expect(app.status).toBe("active");
      expect(app.access).toBe("public");
    }
  });

  it("gives every showcase app its own copy — no shared boilerplate", () => {
    const summaries = getShowcaseApps().map((app) => app.showcase!.summary);
    expect(new Set(summaries).size).toBe(summaries.length);

    const titles = getShowcaseApps().map((app) => app.showcase!.aboutTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("always declares what is synthetic — an omission would read as a claim", () => {
    for (const app of getShowcaseApps()) {
      expect(app.showcase!.synthetic.length).toBeGreaterThan(0);
      expect(app.showcase!.functional.length).toBeGreaterThan(0);
      expect(app.showcase!.demonstrates.length).toBeGreaterThan(0);
      expect(app.showcase!.operationalStatus).not.toBe("");
    }
  });

  it("points every app at the same in-app about route", () => {
    for (const app of getShowcaseApps()) {
      expect(app.showcase!.aboutHref).toBe("/about-this-project");
    }
  });

  it("makes no claim of customers, transactions, or an active marketplace", () => {
    // These phrases are the exact confusion this messaging exists to prevent:
    // deployed software must never read as an operating business.
    const banned = [
      "trusted by",
      "our customers",
      "real transactions",
      "production customer data",
      "active marketplace",
    ];
    for (const app of getShowcaseApps()) {
      const text = JSON.stringify(app.showcase).toLowerCase();
      for (const phrase of banned) {
        expect(text).not.toContain(phrase);
      }
    }
  });

  it("states EduMatch is not an operating marketplace, and that money never moves", () => {
    const edu = getShowcaseProject("edumatch")!;
    expect(edu.summary).toContain("not an operating tutor marketplace");
    expect(edu.synthetic.map((f) => f.title)).toContain(
      "Money never actually moves"
    );
  });

  it("declares Vionto's beta status and its fixture-only benchmark", () => {
    const vionto = getShowcaseProject("vionto")!;
    expect(vionto.summary).toContain("beta");
    expect(JSON.stringify(vionto.synthetic)).toContain("fixture");
  });

  it("separates Testora's live runs from its committed Showcase evidence", () => {
    const testora = getShowcaseProject("testora")!;
    expect(testora.summary).toContain("do not execute live");
    expect(JSON.stringify(testora.synthetic)).toContain("committed fixture");
  });

  it("does not imply a marketplace for TimelineAI", () => {
    const timelineai = getShowcaseProject("timelineai")!;
    expect(timelineai.summary).toContain("not a commercial service");
    expect(JSON.stringify(timelineai).toLowerCase()).toContain("no marketplace");
  });
});
