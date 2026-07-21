import { NextResponse } from "next/server";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { testResults } from "@/db/schema";

const deleteSchema = z.object({ ids: z.array(z.string().min(1)).min(1) });

/** Bulk-delete stored results by id (used by "delete selected" / "delete all filtered"). */
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const deleted = await db
    .delete(testResults)
    .where(inArray(testResults.id, parsed.data.ids))
    .returning({ id: testResults.id });
  return NextResponse.json({ deleted: deleted.length });
}
