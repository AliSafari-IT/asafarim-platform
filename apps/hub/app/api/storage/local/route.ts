import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Serve a locally-stored object in dev/test when no remote storage is configured. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key || key.length > 512) {
    return NextResponse.json({ error: "Invalid key." }, { status: 400 });
  }

  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageDir = join(process.cwd(), ".local-storage", "objects");
  const filePath = join(storageDir, safeKey);
  const metaPath = `${filePath}.json`;

  let contentType = "application/octet-stream";
  try {
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as {
      contentType?: string;
    };
    contentType = meta.contentType ?? contentType;
  } catch {
    // no metadata
  }

  try {
    const body = await readFile(filePath);
    return new NextResponse(body, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
