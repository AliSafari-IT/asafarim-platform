/**
 * Cross-app platform URLs.
 *
 * NEXT_PUBLIC_* vars are inlined per app at build time; the localhost
 * defaults keep local development working without any env file.
 */
// NEXT_PUBLIC_* reads are replaced at build time by the consuming Next.js
// app; this keeps the ui package free of a @types/node dependency.
declare const process: { env: Record<string, string | undefined> };

export interface PlatformLinks {
  web: string;
  hub: string;
  showcase: string;
  admin: string;
  vionto: string;
  testora: string;
  appbuilder: string;
}

export function getPlatformLinks(): PlatformLinks {
  return {
    web: process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000",
    hub: process.env.NEXT_PUBLIC_HUB_URL ?? "http://localhost:3001",
    showcase: process.env.NEXT_PUBLIC_SHOWCASE_URL ?? "http://localhost:3002",
    admin: process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3003",
    vionto: process.env.NEXT_PUBLIC_VIONTO_URL ?? "http://localhost:3004",
    testora: process.env.NEXT_PUBLIC_TESTORA_URL ?? "http://localhost:3005",
    appbuilder: process.env.NEXT_PUBLIC_APPBUILDER_URL ?? "http://localhost:3006",
  };
}
