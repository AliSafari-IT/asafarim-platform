import { NextResponse } from "next/server";
import { z } from "zod";
import {
  parseFunctionalRequirement,
  parseTestSuite,
  parseTestFixture,
  parseTestCase,
} from "@/test-engine/parsers/jsonParser";
import { db } from "@/db/client";
import { functionalRequirements, testSuites, testFixtures, testCases } from "@/db/schema";

const uploadSchema = z.object({
  functionalRequirements: z.array(z.unknown()).default([]),
  suites: z.array(z.unknown()).default([]),
  fixtures: z.array(z.unknown()).default([]),
  cases: z.array(z.unknown()).default([]),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { functionalRequirements: frs, suites, fixtures, cases } = parsed.data;

  try {
    for (const raw of frs) {
      const fr = parseFunctionalRequirement(raw);
      await db.insert(functionalRequirements).values(fr).onConflictDoUpdate({
        target: functionalRequirements.id,
        set: fr,
      });
    }
    for (const raw of suites) {
      const suite = parseTestSuite(raw);
      await db.insert(testSuites).values(suite).onConflictDoUpdate({
        target: testSuites.suiteId,
        set: suite,
      });
    }
    for (const raw of fixtures) {
      const fixture = parseTestFixture(raw);
      await db.insert(testFixtures).values(fixture).onConflictDoUpdate({
        target: testFixtures.fixtureId,
        set: fixture,
      });
    }
    for (const raw of cases) {
      const testCase = parseTestCase(raw);
      await db.insert(testCases).values(testCase).onConflictDoUpdate({
        target: testCases.caseId,
        set: testCase,
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid test definition" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    imported: {
      functionalRequirements: frs.length,
      suites: suites.length,
      fixtures: fixtures.length,
      cases: cases.length,
    },
  });
}
