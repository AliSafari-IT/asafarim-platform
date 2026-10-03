import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader } from "@asafarim/ui";
import { getServerTranslator, resolveLocaleFromCookie } from "@asafarim/shared-i18n/server";
import { ToolCatalogue } from "../../components/tools/ToolCatalogue";
import { getListedTools } from "../../lib/tools/catalogue";
import webDictionaries from "../../lib/i18n-dictionaries";

async function translator() {
  const cookieStore = await cookies();
  return getServerTranslator(resolveLocaleFromCookie(cookieStore.toString()), webDictionaries);
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await translator();
  return {
    title: { absolute: t("web.tools.meta.title") },
    description: t("web.tools.meta.description"),
    alternates: { canonical: "/tools" },
    openGraph: { type: "website", url: "/tools", title: t("web.tools.meta.title"), description: t("web.tools.meta.description"), siteName: "ASafariM Digital" },
    twitter: { card: "summary_large_image", title: t("web.tools.meta.title"), description: t("web.tools.meta.description") },
    // An empty catalogue is not a page worth indexing.
    ...(getListedTools().length ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function ToolsPage() {
  const t = await translator();

  return (
    <>
      <PageHeader kicker={t("web.tools.kicker")} title={t("web.tools.title")} description={t("web.tools.description")} />
      <ToolCatalogue tools={getListedTools()} t={t} />
    </>
  );
}
