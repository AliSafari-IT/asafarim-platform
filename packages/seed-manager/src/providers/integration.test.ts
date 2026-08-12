// Integration tests for the shared-Prisma providers.
//
// GUARDED BY DESIGN. These tests write to a database, so they refuse to run
// unless SEED_MANAGER_TEST_DATABASE_URL points at a disposable one — they
// never fall back to DATABASE_URL. Pointing an integration suite at the dev
// database has cost us data before; the guard is not optional.
//
//   docker compose up -d postgres
//   createdb seed_manager_test
//   SEED_MANAGER_TEST_DATABASE_URL=postgresql://... pnpm --filter @asafarim/seed-manager test

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";

import type { SeedProviderContext } from "../contracts";
import { withPrisma, type SeedPrismaClient } from "../prisma-client";
import { edumatchProvider, seedEdumatch } from "./edumatch";
import { platformFoundationProvider } from "./platform-foundation";
import { seedTimelineai, timelineaiProvider } from "./timelineai";
import { TIMELINEAI_DEMO_AUTHOR_EMAIL } from "../definitions/timelineai";

const CONNECTION = process.env.SEED_MANAGER_TEST_DATABASE_URL;
const describeIfDb = CONNECTION ? describe : describe.skip;

function context(): SeedProviderContext {
  return {
    environment: "development",
    connectionString: CONNECTION!,
    timeoutMs: 60_000,
  };
}

const USER_TIMELINE_ID = "integration-user-owned-timeline";

describeIfDb("shared-Prisma providers against a disposable database", () => {
  beforeAll(async () => {
    await withPrisma(CONNECTION!, async (prisma) => {
      await prisma.$queryRaw`SELECT 1`;
    });
  });

  afterAll(async () => {
    await withPrisma(CONNECTION!, async (prisma) => {
      await prisma.timeline.deleteMany({ where: { id: USER_TIMELINE_ID } });
    });
  });

  describe("platform foundation", () => {
    it("seeds, then converges to clean on a second run", async () => {
      const ctx = context();
      const first = await platformFoundationProvider.execute(
        ctx,
        await platformFoundationProvider.plan(ctx, "seed")
      );
      expect(first.ok).toBe(true);

      const status = await platformFoundationProvider.inspect(ctx);
      expect(status.health).toBe("clean");
      expect(status.missingCount).toBe(0);

      const second = await platformFoundationProvider.execute(
        ctx,
        await platformFoundationProvider.plan(ctx, "seed")
      );
      expect(second.inserted).toBe(0);
      expect(second.updated).toBe(0);
    });

    it("produces an empty plan once clean — dry runs write nothing", async () => {
      const ctx = context();
      const before = await platformFoundationProvider.inspect(ctx);
      const plan = await platformFoundationProvider.plan(ctx, "reconcile");
      const after = await platformFoundationProvider.inspect(ctx);

      expect(plan.inserts + plan.updates + plan.deletes).toBe(0);
      expect(after.seedOwnedCount).toBe(before.seedOwnedCount);
    });

    it("refuses removal outright", async () => {
      await expect(
        platformFoundationProvider.plan(context(), "remove")
      ).rejects.toThrow(/never be removed/i);
    });
  });

  describe("timelineai", () => {
    it("detects drift and reconciles it away", async () => {
      const ctx = context();
      await withPrisma(CONNECTION!, (prisma) => seedTimelineai(prisma));
      expect((await timelineaiProvider.inspect(ctx)).health).toBe("clean");

      // Nudge a seeded row out of line with the definitions.
      await withPrisma(CONNECTION!, async (prisma: SeedPrismaClient) => {
        await prisma.timeline.update({
          where: { id: "seed-timeline-demo-vertical-history" },
          data: { title: "Drifted title" },
        });
      });

      const drifted = await timelineaiProvider.inspect(ctx);
      expect(drifted.health).toBe("drifted");
      expect(drifted.driftedCount).toBeGreaterThan(0);

      // "Seed missing" leaves drift alone; reconcile fixes it.
      const seedPlan = await timelineaiProvider.plan(ctx, "seed");
      expect(seedPlan.updates).toBe(0);
      expect(seedPlan.retained).toBeGreaterThan(0);

      const reconcilePlan = await timelineaiProvider.plan(ctx, "reconcile");
      expect(reconcilePlan.updates).toBeGreaterThan(0);

      await timelineaiProvider.execute(ctx, reconcilePlan);
      expect((await timelineaiProvider.inspect(ctx)).health).toBe("clean");
    });

    it("retains the shared demo author when it owns non-seeded content", async () => {
      const ctx = context();
      await withPrisma(CONNECTION!, (prisma) => seedTimelineai(prisma));

      await withPrisma(CONNECTION!, async (prisma) => {
        const author = await prisma.user.findUniqueOrThrow({
          where: { email: TIMELINEAI_DEMO_AUTHOR_EMAIL },
          select: { id: true },
        });
        await prisma.timeline.upsert({
          where: { id: USER_TIMELINE_ID },
          update: {},
          create: {
            id: USER_TIMELINE_ID,
            publicId: "integration-user-owned",
            ownerUserId: author.id,
            title: "A human made this",
            timelineType: "general",
            layout: "vertical",
            visibility: "private",
          },
        });
      });

      const plan = await timelineaiProvider.plan(ctx, "remove");
      const author = plan.changes.find(
        (c) => c.seedKey === "timelineai.demo-author"
      );
      expect(author?.action).toBe("retain");
      expect(author?.reason).toMatch(/did not create/);
      expect(plan.retained).toBe(1);

      await timelineaiProvider.execute(ctx, plan);

      // The user's timeline and the account that owns it both survive.
      await withPrisma(CONNECTION!, async (prisma) => {
        expect(
          await prisma.timeline.count({ where: { id: USER_TIMELINE_ID } })
        ).toBe(1);
        expect(
          await prisma.user.count({
            where: { email: TIMELINEAI_DEMO_AUTHOR_EMAIL },
          })
        ).toBe(1);
        // Every seed-owned timeline is gone.
        expect(
          await prisma.timeline.count({
            where: { id: { startsWith: "seed-timeline-" } },
          })
        ).toBe(0);
      });
    });

    it("removes only seed-owned rows and leaves the database clean to re-seed", async () => {
      const ctx = context();
      await withPrisma(CONNECTION!, async (prisma) => {
        await prisma.timeline.deleteMany({ where: { id: USER_TIMELINE_ID } });
        await seedTimelineai(prisma);
      });

      const plan = await timelineaiProvider.plan(ctx, "remove");
      const result = await timelineaiProvider.execute(ctx, plan);
      expect(result.ok).toBe(true);
      expect(result.deleted).toBe(plan.deletes);

      await withPrisma(CONNECTION!, (prisma) => seedTimelineai(prisma));
      expect((await timelineaiProvider.inspect(ctx)).health).toBe("clean");
    });
  });

  describe("edumatch", () => {
    it("is idempotent and reports clean after seeding", async () => {
      const ctx = context();
      await withPrisma(CONNECTION!, (prisma) => seedEdumatch(prisma));
      await withPrisma(CONNECTION!, (prisma) => seedEdumatch(prisma));
      const status = await edumatchProvider.inspect(ctx);
      expect(status.health).toBe("clean");
      expect(status.missingCount).toBe(0);

      await withPrisma(CONNECTION!, async (prisma) => {
        const [
          members,
          students,
          hybridTutors,
          onlineTutors,
          parents,
          briefs,
          reviews,
          bookings,
        ] = await Promise.all([
          prisma.user.count({
            where: {
              email: { startsWith: "asafarim+edu", endsWith: "@gmail.com" },
            },
          }),
          prisma.eduStudentProfile.count(),
          prisma.eduTutorProfile.count({ where: { onlineOnly: false } }),
          prisma.eduTutorProfile.count({ where: { onlineOnly: true } }),
          prisma.eduParentProfile.count(),
          prisma.eduLearningBrief.count({
            where: { id: { startsWith: "seed-edumatch-" } },
          }),
          prisma.eduReview.count({
            where: { id: { startsWith: "seed-edumatch-" } },
          }),
          prisma.eduBooking.count({
            where: { id: { startsWith: "seed-edumatch-" } },
          }),
        ]);
        expect({
          members,
          students,
          hybridTutors,
          onlineTutors,
          parents,
          briefs,
          reviews,
          bookings,
        }).toEqual({
          members: 50,
          students: 27,
          hybridTutors: 10,
          onlineTutors: 5,
          parents: 5,
          briefs: 18,
          reviews: 51,
          bookings: 58,
        });
        const seededUsers = await prisma.user.findMany({
          where: {
            email: { startsWith: "asafarim+edu", endsWith: "@gmail.com" },
          },
          select: { password: true },
        });
        expect(seededUsers.every((user) => Boolean(user.password))).toBe(true);
        expect(
          await Promise.all(
            seededUsers.map((user) =>
              bcrypt.compare(
                process.env.EDUMATCH_SEED_USERS_PASSWORD!,
                user.password!
              )
            )
          )
        ).toEqual(Array(50).fill(true));
      });
    });

    it("never plans a delete outside the reserved demo domain", async () => {
      const plan = await edumatchProvider.plan(context(), "remove");
      for (const change of plan.changes.filter((c) => c.action === "delete")) {
        expect([
          "edumatch.students",
          "edumatch.tutors",
          "edumatch.parents",
          "edumatch.admins",
          "edumatch.presentation-scenarios",
        ]).toContain(change.seedKey);
      }
    });

    it("migrates an original unpadded demo alias without duplicating its user", async () => {
      await withPrisma(CONNECTION!, async (prisma) => {
        const currentEmail = "asafarim+edustudent01@gmail.com";
        const legacyEmail = "demo.student1@edumatch.demo";
        const before = await prisma.user.findUniqueOrThrow({
          where: { email: currentEmail },
          select: { id: true },
        });
        await prisma.user.update({
          where: { id: before.id },
          data: { email: legacyEmail },
        });

        await seedEdumatch(prisma);

        const migrated = await prisma.user.findUniqueOrThrow({
          where: { email: currentEmail },
          select: { id: true },
        });
        expect(migrated.id).toBe(before.id);
        expect(
          await prisma.user.count({
            where: { email: { in: [currentEmail, legacyEmail] } },
          })
        ).toBe(1);
      });
    });

    it("removes the owned presentation graph and can seed it cleanly again", async () => {
      const ctx = context();
      const plan = await edumatchProvider.plan(ctx, "remove");
      const result = await edumatchProvider.execute(ctx, plan);

      expect(result.ok).toBe(true);
      expect(result.deleted).toBe(plan.deletes);

      await withPrisma(CONNECTION!, (prisma) => seedEdumatch(prisma));
      expect((await edumatchProvider.inspect(ctx)).health).toBe("clean");
    });
  });

  describe("database availability", () => {
    it("reports unavailable rather than throwing when a database is unreachable", async () => {
      const status = await timelineaiProvider.inspect({
        environment: "development",
        // Port chosen to be closed; the provider must degrade, not crash.
        connectionString: "postgresql://nobody:nobody@127.0.0.1:1/none",
        timeoutMs: 5_000,
      });
      expect(status.health).toBe("unavailable");
      expect(status.connection).toBe("unreachable");
      // And the failure must not carry the credentials that produced it.
      expect(JSON.stringify(status.issues)).not.toContain("nobody");
    });
  });
});
