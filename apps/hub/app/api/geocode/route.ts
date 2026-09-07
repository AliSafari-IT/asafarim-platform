import { NextResponse } from "next/server";
import { getSession } from "@asafarim/auth";

export const runtime = "nodejs";

interface NominatimSearchResult {
  lat: string;
  lon: string;
  display_name: string;
  importance?: number;
}

interface NominatimReverseResult {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    postcode?: string;
    state?: string;
    country_code?: string;
  };
  error?: string;
}

/**
 * POST /api/geocode — two modes, via OpenStreetMap's Nominatim (free, no API key):
 * - Forward: `{ street1, city, ... }` → lat/lng for the *typed* address.
 * - Reverse: `{ lat, lng }` → structured address components for the device's
 *   physical position (used by "Use my location" in AddressFields).
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
    | { lat?: number; lng?: number; street1?: string; city?: string; state?: string; postalCode?: string; country?: string }
    | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const reverse = typeof body.lat === "number" && typeof body.lng === "number";

  let url: URL;
  if (reverse) {
    url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(body.lat));
    url.searchParams.set("lon", String(body.lng));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("zoom", "18");
  } else {
    const parts = [body.street1, body.postalCode, body.city, body.state, body.country].filter(
      (p): p is string => Boolean(p && p.trim()),
    );
    if (parts.length === 0) {
      return NextResponse.json({ error: "Enter a street address first." }, { status: 400 });
    }
    url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", parts.join(", "));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    if (body.country) url.searchParams.set("countrycodes", body.country.toLowerCase());
  }

  let data: NominatimSearchResult[] | NominatimReverseResult;
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
    data = await res.json();
  } catch {
    return NextResponse.json({ error: "Address lookup service is unavailable right now." }, { status: 502 });
  }

  if (reverse) {
    const rev = data as NominatimReverseResult;
    if (!rev || "error" in rev || !rev.address) {
      return NextResponse.json({ error: "Couldn't find an address at your location." }, { status: 404 });
    }
    const a = rev.address;
    return NextResponse.json({
      lat: Math.round(Number(rev.lat ?? body.lat) * 1e6) / 1e6,
      lng: Math.round(Number(rev.lon ?? body.lng) * 1e6) / 1e6,
      formatted: rev.display_name ?? "",
      address: {
        street1: [a.road ?? a.pedestrian, a.house_number].filter(Boolean).join(" "),
        city: a.city ?? a.town ?? a.village ?? a.municipality ?? "",
        state: a.state ?? "",
        postalCode: a.postcode ?? "",
        country: (a.country_code ?? "").toUpperCase(),
      },
    });
  }

  const match = (data as NominatimSearchResult[])[0];
  if (!match) {
    return NextResponse.json({ error: "Couldn't find that address. Check the spelling or enter coordinates manually." }, { status: 404 });
  }

  return NextResponse.json({
    lat: Math.round(Number(match.lat) * 1e6) / 1e6,
    lng: Math.round(Number(match.lon) * 1e6) / 1e6,
    formatted: match.display_name,
  });
}
