/**
 * AI-director layer barrel. Import provider capabilities from here:
 *
 *   import { getNarrationProvider, resolveProviderCredential } from "@/lib/server/ai";
 *
 * The app depends on these interfaces/factories, never on a vendor SDK.
 */
export * from "./types";
export * from "./interfaces";
export * from "./registry";
export * from "./credentials";
export * from "./factory";
