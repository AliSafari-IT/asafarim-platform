import "server-only";

/**
 * Minimal Discord webhook notifier, reusing the same `WEBHOOK_SECRET_DISCORD`
 * channel `infra/scripts/vps-deploy.sh` already posts deploy notifications to.
 * Best-effort: a failed notification is logged, never thrown — it must not
 * take down the caller (e.g. a Tailscale webhook handler that still needs to
 * return 200 so Tailscale doesn't retry).
 */
export async function notifyDiscord(content: string): Promise<void> {
  const webhookUrl = process.env.WEBHOOK_SECRET_DISCORD;
  if (!webhookUrl || !webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      console.error(`[discord-notify] webhook returned ${res.status}`);
    }
  } catch (error) {
    console.error("[discord-notify] failed to post:", error);
  }
}
