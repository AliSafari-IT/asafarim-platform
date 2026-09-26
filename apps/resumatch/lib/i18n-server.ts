import "server-only";
import { cookies } from "next/headers";
import { getServerTranslator, resolveLocaleFromCookie } from "@asafarim/shared-i18n/server";
import resumatchDictionaries from "./i18n-dictionaries";

/**
 * The active locale (from the shared asafarim-lang cookie) and a translator
 * bound to it, for server components and generateMetadata. Client
 * components use `useTranslation()` from @asafarim/shared-i18n instead.
 */
export async function getTranslator() {
  const locale = resolveLocaleFromCookie((await cookies()).toString());
  return { locale, t: getServerTranslator(locale, resumatchDictionaries) };
}
