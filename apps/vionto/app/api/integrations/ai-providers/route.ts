import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import { formatZodError } from "@/lib/server/validation";
import {
  byokProviders,
  getProvider,
  listProviderCredentials,
  saveProviderCredential,
  deleteProviderCredential,
} from "@/lib/server/ai";
import type { AiProviderId } from "@/lib/server/ai";

export const runtime = "nodejs";

const BYOK_IDS = byokProviders().map((p) => p.id) as [AiProviderId, ...AiProviderId[]];

const saveSchema = z.object({
  provider: z.enum(BYOK_IDS),
  apiKey: z.string().trim().min(8, "API key looks too short."),
  apiSecret: z.string().trim().min(1).optional(),
  label: z.string().trim().max(80).optional(),
});

const deleteSchema = z.object({ provider: z.enum(BYOK_IDS) });

/**
 * GET /api/integrations/ai-providers
 *
 * Returns the BYOK-eligible providers, whether each is available via a server
 * env fallback, and the caller's own configured keys (masked — never raw).
 */
export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const configured = await listProviderCredentials(user.id);
    const configuredByProvider = new Map(configured.map((c) => [c.provider, c] as const));

    const providers = byokProviders().map((p) => {
      const envAvailable = Boolean(p.envKey && process.env[p.envKey]);
      const mine = configuredByProvider.get(p.id);
      return {
        id: p.id,
        label: p.label,
        capabilities: p.capabilities,
        auth: p.auth,
        implemented: p.implemented,
        needsSecret: p.auth === "key_secret",
        envAvailable,
        configured: Boolean(mine),
        maskedKey: mine?.maskedKey ?? null,
        status: mine?.status ?? null,
        updatedAt: mine?.updatedAt ?? null,
        models: p.models.map((m) => ({ id: m.id, label: m.label, tier: m.tier, approxCost: m.approxCost })),
      };
    });

    return NextResponse.json({ providers });
  } catch (error) {
    return serverError("ai-providers GET", error);
  }
}

/**
 * PUT /api/integrations/ai-providers — save (upsert) the caller's key for a
 * provider. The raw key is encrypted at rest and never returned.
 */
export async function PUT(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const entry = getProvider(parsed.data.provider);
    if (!entry?.byok) return badRequest("This provider does not support user keys.");
    if (entry.auth === "key_secret" && !parsed.data.apiSecret) {
      return badRequest(`${entry.label} requires both a key and a secret.`);
    }

    const saved = await saveProviderCredential({
      userId: user.id,
      provider: parsed.data.provider,
      apiKey: parsed.data.apiKey,
      apiSecret: parsed.data.apiSecret,
      label: parsed.data.label,
    });

    return NextResponse.json(saved, { status: 200 });
  } catch (error) {
    return serverError("ai-providers PUT", error);
  }
}

/** DELETE /api/integrations/ai-providers?provider=fal — remove the caller's key. */
export async function DELETE(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const url = new URL(req.url);
    const parsed = deleteSchema.safeParse({ provider: url.searchParams.get("provider") });
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    await deleteProviderCredential(user.id, parsed.data.provider);
    return NextResponse.json({ ok: true, provider: parsed.data.provider });
  } catch (error) {
    return serverError("ai-providers DELETE", error);
  }
}
