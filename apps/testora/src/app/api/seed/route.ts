import { NextResponse } from "next/server";
import { seedDatabase } from "@/db/seedDatabase";

// Re-seed (upsert) the test catalog from the @/data definitions — the server
// side of the Run page's "Update tests" button.
export async function POST() {
  try {
    const result = await seedDatabase();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Re-seed failed" },
      { status: 500 },
    );
  }
}
