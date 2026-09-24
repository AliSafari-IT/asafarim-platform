import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { resolveLocaleFromCookie } from "@asafarim/shared-i18n/server";
import { viontoDictionaries } from "@/lib/i18n-dictionaries";
import { ViontoNav } from "@/components/ViontoNav";
import { AiUsagePageClient } from "./AiUsagePageClient";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const language = locale.split("-")[0] as keyof typeof viontoDictionaries;
  const dictionary = viontoDictionaries[language] ?? viontoDictionaries.en ?? {};
  return {
    title: `${dictionary["vionto.aiUsage.title"] ?? "AI cost details"} - Vionto`,
    description: dictionary["vionto.aiUsage.description"],
  };
}

/** AI provider cost timeline (issue #589): grand total → project → final video → call. */
export default function AiUsagePage() {
  return (
    <>
      <ViontoNav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:py-10">
        <Suspense fallback={null}>
          <AiUsagePageClient />
        </Suspense>
      </main>
    </>
  );
}
