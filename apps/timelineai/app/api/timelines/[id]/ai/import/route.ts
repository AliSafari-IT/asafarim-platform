import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { importSource } from "@/lib/server/services/source-import";
import { SOURCE_IMPORT_KINDS } from "@/lib/ai/source-import";

const ImportInputSchema = z
  .object({
    kind: z.enum(SOURCE_IMPORT_KINDS),
    content: z.string().min(1).max(20_000).optional(),
    url: z.string().url().max(2000).optional(),
    label: z.string().max(200).optional(),
  })
  .refine((input) => (input.kind === "url" ? !!input.url && !input.content : !!input.content && !input.url), {
    message: "Provide exactly one of `content` or `url`, matching the chosen `kind`.",
  });

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json();
    const input = ImportInputSchema.parse(body);
    const viewer = await getViewerContext();
    const { sourceImport, proposal, wasReimport, alreadyImportedChunkIds } = await importSource(id, viewer, input);
    return NextResponse.json({ sourceImport, proposal, wasReimport, alreadyImportedChunkIds }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
