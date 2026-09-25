import { NextResponse } from "next/server";
import { isEmptyImpact, previewSeedImpact, seedDatabase } from "@/db/seedDatabase";

// Server side of the Run page's "Update tests" button.
//
// Re-seeding reconciles the catalog with the @/data definitions and PRUNES
// anything no longer defined in code — with every stored result under it.
// So it is a two-step call:
//   GET  → dry run: what a re-seed would delete right now (reads only)
//   POST → re-seed; if anything would be deleted it is refused with 409 and
//          the impact, unless the body says { "confirm": true }

export async function GET() {
  try {
    return NextResponse.json({ impact: await previewSeedImpact() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not preview the update" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
  try {
    if (body?.confirm !== true) {
      const impact = await previewSeedImpact();
      if (!isEmptyImpact(impact)) {
        return NextResponse.json(
          { error: "This update would delete tests and results — confirm to continue.", impact },
          { status: 409 },
        );
      }
    }
    const result = await seedDatabase();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Re-seed failed" },
      { status: 500 },
    );
  }
}
