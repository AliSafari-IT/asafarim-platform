import type { Metadata } from "next";
import { cookies } from "next/headers";
import { resolveLocaleFromCookie } from "@asafarim/shared-i18n/server";
import { viontoDictionaries } from "@/lib/i18n-dictionaries";
import { ViontoNav } from "@/components/ViontoNav";
import { ProjectsPageClient } from "./ProjectsPageClient";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const language = locale.split("-")[0] as keyof typeof viontoDictionaries;
  const dictionary = viontoDictionaries[language] ?? viontoDictionaries.en ?? {};

  return {
    title: `${dictionary["vionto.projects.title"] ?? "Projects"} - Vionto`,
    description: dictionary["vionto.projects.description"] ?? "View, manage, and share your Vionto video projects.",
  };
}

export default function ProjectsPage() {
  return (
    <>
      <ViontoNav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <ProjectsPageClient />
      </main>
    </>
  );
}
