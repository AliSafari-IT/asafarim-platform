import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * A secret-safe diagnostic for the admin credentials used by the test suite.
 *
 * It runs inside the same Next server process the tests run in, so it reads the
 * EXACT `WEBAPP_ADMIN_EMAIL` / `WEBAPP_ADMIN_PASSWORD` the specs use, and POSTs them to
 * `<api>/auth/login` against the chosen target. It never echoes the password —
 * only its length — so it's safe to hit from a browser.
 *
 *   GET /api/auth-check?api=https://api.immostory.ai/api/v1
 *
 * `api` defaults to WEBAPP_API_URL, then the configured remote API, then local.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const api =
    url.searchParams.get("api") ||
    process.env.WEBAPP_API_URL ||
    process.env.NEXT_PUBLIC_WEBAPP_REMOTE_API_URL ||
    "http://localhost:3234/api/v1";

  const email = process.env.WEBAPP_ADMIN_EMAIL || "admin@example.com";
  const emailFromEnv = Boolean(process.env.WEBAPP_ADMIN_EMAIL);
  const password = process.env.WEBAPP_ADMIN_PASSWORD || "";

  const result: Record<string, unknown> = {
    api,
    email,
    emailFromEnv,
    passwordPresent: password.length > 0,
    passwordLength: password.length,
  };

  if (!password) {
    return NextResponse.json(
      { ...result, ok: false, hint: "WEBAPP_ADMIN_PASSWORD is empty — set it in .env and restart the dev server." },
      { status: 200 },
    );
  }

  try {
    const res = await fetch(`${api}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "*/*" },
      body: JSON.stringify({ email, password }),
    });
    let body: unknown = null;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 300);
    }
    const serverMessage =
      body && typeof body === "object" && "message" in (body as Record<string, unknown>)
        ? (body as Record<string, unknown>).message
        : typeof body === "string"
          ? body
          : null;

    return NextResponse.json({
      ...result,
      ok: res.status === 200,
      status: res.status,
      serverMessage,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ...result,
        ok: false,
        error: error instanceof Error ? error.message : "request failed",
        hint: "Could not reach the API base — check the `api` URL is correct and reachable.",
      },
      { status: 200 },
    );
  }
}
