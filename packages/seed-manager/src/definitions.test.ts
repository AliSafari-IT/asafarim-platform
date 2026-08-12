import { describe, expect, it } from "vitest";

import { checksum, planChecksum } from "./checksums";
import { listProviders } from "./registry";
import {
  FOUNDATION_PERMISSIONS,
  FOUNDATION_ROLES,
  SECURITY_CRITICAL_PERMISSIONS,
} from "./definitions/foundation";
import {
  EDUMATCH_ADMINS,
  EDUMATCH_BRIEFS,
  EDUMATCH_CHAIN_IDS,
  EDUMATCH_DEMO_EMAILS,
  EDUMATCH_DEMO_EMAIL_DOMAIN,
  EDUMATCH_DEMO_EMAIL_PREFIX,
  EDUMATCH_MATCH_PLAN,
  EDUMATCH_PARENTS,
  EDUMATCH_STUDENTS,
  EDUMATCH_TUTORS,
} from "./definitions/edumatch";
import { TIMELINEAI_DEMOS, timelineSeedId } from "./definitions/timelineai";
import { validateFoundationDefinitions } from "./providers/platform-foundation";
import { validateEdumatchDefinitions } from "./providers/edumatch";
import { validateTimelineaiDefinitions } from "./providers/timelineai";
import { redactText, redactValue, sanitizeError } from "./redaction";

describe("seed definitions validate cleanly", () => {
  it("foundation", () => {
    expect(
      validateFoundationDefinitions().filter((i) => i.severity === "error")
    ).toEqual([]);
  });
  it("edumatch", () => {
    expect(
      validateEdumatchDefinitions().filter((i) => i.severity === "error")
    ).toEqual([]);
  });
  it("timelineai", () => {
    expect(
      validateTimelineaiDefinitions().filter((i) => i.severity === "error")
    ).toEqual([]);
  });
});

describe("seed keys are unique and stable", () => {
  it("no provider repeats a seed key in its manifest", () => {
    for (const provider of listProviders()) {
      const keys = provider.manifest.map((entry) => entry.seedKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("every manifest dependency names a key in the same manifest", () => {
    for (const provider of listProviders()) {
      const keys = new Set(provider.manifest.map((entry) => entry.seedKey));
      for (const entry of provider.manifest) {
        for (const dependency of entry.dependsOn ?? []) {
          expect(keys).toContain(dependency);
        }
      }
    }
  });

  it("no manifest entry is removable on a protected provider", () => {
    for (const provider of listProviders().filter((p) => p.protected)) {
      expect(
        provider.manifest.every((entry) => entry.removable === false)
      ).toBe(true);
    }
  });

  it("timelineai ids are derived deterministically from the publicId", () => {
    for (const demo of TIMELINEAI_DEMOS) {
      expect(timelineSeedId(demo.publicId)).toBe(
        `seed-timeline-${demo.publicId}`
      );
    }
    const ids = TIMELINEAI_DEMOS.map((demo) => timelineSeedId(demo.publicId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("edumatch identities use the exact presentation alias pattern", () => {
    for (const email of EDUMATCH_DEMO_EMAILS) {
      expect(email.endsWith(EDUMATCH_DEMO_EMAIL_DOMAIN)).toBe(true);
      expect(email.startsWith(EDUMATCH_DEMO_EMAIL_PREFIX)).toBe(true);
    }
    expect(EDUMATCH_DEMO_EMAILS).toContain("asafarim+edustudent01@gmail.com");
    expect(EDUMATCH_DEMO_EMAILS).toContain("asafarim+edututor15@gmail.com");
    expect(new Set(EDUMATCH_DEMO_EMAILS).size).toBe(50);
    for (const id of Object.values(EDUMATCH_CHAIN_IDS)) {
      expect(id.startsWith("seed-")).toBe(true);
    }
  });

  it("edumatch defines the presentation population and tutor mode split", () => {
    expect(EDUMATCH_STUDENTS).toHaveLength(27);
    expect(EDUMATCH_TUTORS).toHaveLength(15);
    expect(EDUMATCH_PARENTS).toHaveLength(5);
    expect(EDUMATCH_ADMINS).toHaveLength(3);
    expect(EDUMATCH_DEMO_EMAILS).toHaveLength(50);
    expect(EDUMATCH_TUTORS.filter((tutor) => tutor.onlineOnly)).toHaveLength(5);
    expect(EDUMATCH_TUTORS.filter((tutor) => !tutor.onlineOnly)).toHaveLength(
      10
    );
    expect(EDUMATCH_BRIEFS).toHaveLength(18);
  });

  it("edumatch match plans are bounded, valid, and include newcomer rotation", () => {
    const tutors = new Set(EDUMATCH_TUTORS.map((tutor) => tutor.key));
    const briefs = new Set(EDUMATCH_BRIEFS.map((brief) => brief.key));
    const plans = Object.entries(EDUMATCH_MATCH_PLAN);
    expect(plans.every(([brief]) => briefs.has(brief))).toBe(true);
    expect(plans.every(([, matches]) => matches.length <= 5)).toBe(true);
    expect(
      plans.every(([, matches]) =>
        matches.every((match) => tutors.has(match.tutor))
      )
    ).toBe(true);
    expect(
      plans.flatMap(([, matches]) => matches).filter((match) => match.rotation)
    ).toHaveLength(2);
  });
});

describe("foundation permission catalog", () => {
  it("defines the four seed permissions", () => {
    const names = FOUNDATION_PERMISSIONS.map((p) => p.name);
    for (const permission of [
      "seeds.view",
      "seeds.execute",
      "seeds.remove",
      "seeds.schedule",
    ]) {
      expect(names).toContain(permission);
    }
  });

  it("grants superadmin everything", () => {
    const superadmin = FOUNDATION_ROLES.find(
      (role) => role.name === "superadmin"
    )!;
    expect(superadmin.permissions.sort()).toEqual(
      FOUNDATION_PERMISSIONS.map((p) => p.name).sort()
    );
  });

  it("does not grant seeds.remove or seeds.schedule to admin by default", () => {
    const admin = FOUNDATION_ROLES.find((role) => role.name === "admin")!;
    expect(admin.permissions).toContain("seeds.view");
    expect(admin.permissions).toContain("seeds.execute");
    expect(admin.permissions).not.toContain("seeds.remove");
    expect(admin.permissions).not.toContain("seeds.schedule");
  });

  it("does not grant any seed permission to non-administrative roles", () => {
    for (const role of FOUNDATION_ROLES.filter((r) =>
      ["standard_user", "guest"].includes(r.name)
    )) {
      expect(
        role.permissions.some((permission) => permission.startsWith("seeds."))
      ).toBe(false);
    }
  });

  it("treats seeds.remove as security-critical", () => {
    expect(SECURITY_CRITICAL_PERMISSIONS.has("seeds.remove")).toBe(true);
  });
});

describe("checksums", () => {
  it("are stable across key ordering", () => {
    expect(checksum({ a: 1, b: { c: 2, d: 3 } })).toBe(
      checksum({ b: { d: 3, c: 2 }, a: 1 })
    );
  });

  it("change when the plan changes", () => {
    const base = {
      providerId: "timelineai",
      environment: "development",
      operation: "seed",
      definitionChecksum: "abc",
      changes: [
        { seedKey: "k", entity: "E", action: "insert" as const, count: 1 },
      ],
    };
    const changed = { ...base, changes: [{ ...base.changes[0]!, count: 2 }] };
    expect(planChecksum(base)).not.toBe(planChecksum(changed));
  });

  it("ignore the order providers emit changes in", () => {
    const changes = [
      { seedKey: "a", entity: "A", action: "insert" as const, count: 1 },
      { seedKey: "b", entity: "B", action: "delete" as const, count: 2 },
    ];
    const base = {
      providerId: "p",
      environment: "development",
      operation: "remove",
      definitionChecksum: "abc",
      changes,
    };
    expect(planChecksum(base)).toBe(
      planChecksum({ ...base, changes: [...changes].reverse() })
    );
  });

  it("differ per environment, so a staging plan cannot approve production work", () => {
    const base = {
      providerId: "p",
      environment: "staging",
      operation: "remove",
      definitionChecksum: "abc",
      changes: [
        { seedKey: "a", entity: "A", action: "delete" as const, count: 1 },
      ],
    };
    expect(planChecksum(base)).not.toBe(
      planChecksum({ ...base, environment: "production" })
    );
  });
});

describe("redaction", () => {
  it("strips connection URLs from free text", () => {
    const text =
      "connect ECONNREFUSED postgresql://asafarim:hunter2@db.internal:5432/asafarim";
    const redacted = redactText(text);
    expect(redacted).not.toContain("hunter2");
    expect(redacted).not.toContain("db.internal");
  });

  it("strips libpq keyword credentials", () => {
    expect(redactText("password=hunter2 host=db.internal")).not.toContain(
      "hunter2"
    );
  });

  it("strips bare user:password@host pairs", () => {
    expect(redactText("failed for asafarim:hunter2@db")).not.toContain(
      "hunter2"
    );
  });

  it("redacts by key name and by value", () => {
    const redacted = redactValue({
      DATABASE_URL: "postgresql://u:p@h/db",
      nested: { apiKey: "sk-live-123", note: "see postgres://u:p@h/db" },
      safe: 42,
    }) as Record<string, unknown>;
    expect(redacted.DATABASE_URL).toBe("[redacted]");
    expect((redacted.nested as Record<string, unknown>).apiKey).toBe(
      "[redacted]"
    );
    expect((redacted.nested as Record<string, unknown>).note).not.toContain(
      "u:p@h"
    );
    expect(redacted.safe).toBe(42);
  });

  it("reduces an error to a code and a single sanitized line", () => {
    const error = new Error(
      "connect ECONNREFUSED postgresql://u:secret@10.0.0.1:5432/db\n    at Socket.emit (node:events)"
    );
    const result = sanitizeError(error);
    expect(result.code).toBe("DATABASE_UNREACHABLE");
    expect(result.message).not.toContain("secret");
    expect(result.message).not.toContain("at Socket.emit");
  });

  it("classifies auth and schema failures distinctly", () => {
    expect(
      sanitizeError(new Error("password authentication failed for user")).code
    ).toBe("DATABASE_AUTH_FAILED");
    expect(
      sanitizeError(new Error('relation "timelines" does not exist')).code
    ).toBe("SCHEMA_MISMATCH");
  });
});
