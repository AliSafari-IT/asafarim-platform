import type { Metadata } from "next";
import { cookies } from "next/headers";
import { resolveLocaleFromCookie } from "@asafarim/shared-i18n/server";
import { viontoDictionaries } from "@/lib/i18n-dictionaries";
import { ViontoNav } from "@/components/ViontoNav";
import { LibraryPageClient } from "./LibraryPageClient";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const language = locale.split("-")[0] as keyof typeof viontoDictionaries;
  const dictionary = viontoDictionaries[language] ?? viontoDictionaries.en ?? {};

  return {
    title: `${dictionary["vionto.libraryPage.title"] ?? "Video Library"} - Vionto`,
    description:
      dictionary["vionto.libraryPage.description"] ??
      "Every completed video you have generated across all Vionto projects.",
  };
}

export default function LibraryPage() {
  return (
    <>
      <ViontoNav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:py-10">
        <LibraryPageClient />
      </main>
    </>
  );
}
