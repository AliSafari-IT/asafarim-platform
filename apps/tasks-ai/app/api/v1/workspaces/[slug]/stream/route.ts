import { workspaceRoute } from "../../../../../../lib/api/handler";
import { activityStream } from "../../../../../../lib/realtime/stream";

// SSE. One long-lived response per client; the stream polls ActivityEvent
// for this workspace and pushes "re-fetch" hints. See lib/realtime/stream.ts.
export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ req, ctx }) => {
  const since = new URL(req.url).searchParams.get("since");
  return new Response(activityStream(ctx, since), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
});
