import { NextResponse } from "next/server";
import { correlationId, fail } from "../../../../lib/api/http";
import { ApiError } from "../../../../lib/errors";
import { receiveGithubWebhook } from "../../../../lib/integrations/github";

// GitHub webhook. No session; each repo integration carries its own HMAC
// secret verified in-handler. In proxy.ts publicRoutes.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cid = correlationId(req);
  try {
    const repo = req.headers.get("x-tasksai-repo") || new URL(req.url).searchParams.get("repo");
    if (!repo) throw new ApiError("validation_failed", { repo: "required (x-tasksai-repo header)" });
    const rawBody = await req.text();
    const result = await receiveGithubWebhook({
      repo,
      deliveryId: req.headers.get("x-github-delivery") || cid,
      eventType: req.headers.get("x-github-event") || "unknown",
      rawBody,
      signatureHeader: req.headers.get("x-hub-signature-256"),
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    return fail(err, cid);
  }
}
