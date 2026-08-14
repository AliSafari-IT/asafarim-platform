import { NextResponse } from "next/server";
import { getSession } from "@asafarim/auth";

export const runtime = "nodejs";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  importance?: number;
}

/**
 * POST /api/geocode — turns the typed street address into lat/lng, via
 * OpenStreetMap's Nominatim (free, no API key). Distinct from "Use my
 * location" (browser GPS): this looks up the *typed* address, not the
 * device's physical position, which routinely disagree (see AddressFields).
 *
 * Server-side only — Nominatim's usage policy requires a descriptive
 * User-Agent/Referer and disallows client-side bulk use.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as
    | { street1?: string; city?: string; state?: string; postalCode?: string; country?: string }
    | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parts = [body.street1, body.postalCode, body.city, body.state, body.country].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  if (parts.length === 0) {
    return NextResponse.json({ error: "Enter a street address first." }, { status: 400 });
  }

  const query = parts.join(", ");
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  if (body.country) url.searchParams.set("countrycodes", body.country.toLowerCase());

  let results: NominatimResult[];
  try {
    const res = await fetch(url, {
      headers: {
        // Nominatim's usage policy requires an identifying User-Agent.
        "User-Agent": "ASafarIM-Platform/1.0 (hub.asafarim.com; profile address lookup)",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Address lookup service is unavailable right now." }, { status: 502 });
    }
    results = await res.json();
  } catch {
    return NextResponse.json({ error: "Address lookup service is unavailable right now." }, { status: 502 });
  }

  const match = results[0];
  if (!match) {
    return NextResponse.json({ error: "Couldn't find that address. Check the spelling or enter coordinates manually." }, { status: 404 });
  }

  return NextResponse.json({
    lat: Math.round(Number(match.lat) * 1e6) / 1e6,
    lng: Math.round(Number(match.lon) * 1e6) / 1e6,
    formatted: match.display_name,
  });
}
