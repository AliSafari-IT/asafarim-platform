import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Serve a locally-stored object in dev/test when no remote storage is configured. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  // eslint-disable-next-line no-console
  console.log("[storage:GET] key=", key, "cwd=", process.cwd(), "url=", req.url);
  if (!key || key.length > 512) {
    return NextResponse.json({ error: "Invalid key." }, { status: 400 });
  }

  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storageDir = join(process.cwd(), ".local-storage", "objects");
  const filePath = join(storageDir, safeKey);
  const metaPath = `${filePath}.json`;
  // eslint-disable-next-line no-console
  console.log("[storage:GET] looking for", filePath, "exists=", existsSync(filePath));

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
    // eslint-disable-next-line no-console
    console.log("[storage:GET] served", filePath, "bytes=", body.length, "contentType=", contentType);
    return new NextResponse(body, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    // eslint-disable-next-line no-console
    console.log("[storage:GET] not found", filePath);
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
