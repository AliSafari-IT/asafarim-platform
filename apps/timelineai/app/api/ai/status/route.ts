import { NextResponse } from "next/server";
import { isAiEnabled } from "@/lib/ai/kill-switch";

// Lightweight, unauthenticated status check so the editor's AI copilot
// panel can decide whether to show the generate form or an honest
// "AI is disabled for this deployment" state — never guesses client-side.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ enabled: isAiEnabled() });
}
