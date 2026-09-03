import { handlers } from "@asafarim/auth";
import type { NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{ nextauth: string[] }>;
};

export async function GET(request: NextRequest, _context: RouteContext) {
  return handlers.GET(request as unknown as Parameters<typeof handlers.GET>[0]);
}

export async function POST(request: NextRequest, _context: RouteContext) {
  return handlers.POST(request as unknown as Parameters<typeof handlers.POST>[0]);
}
