import type { Metadata } from "next";
import { cookies } from "next/headers";
import { EmptyState, PageHeader } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../lib/i18n-dictionaries";

export const metadata: Metadata = { title: "Labs" };

export default async function LabsPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);

  return (
    <>
      <PageHeader
        kicker={t("showcase.labs.kicker")}
        kickerIndex="02"
        title={t("showcase.labs.title")}
        description={t("showcase.labs.description")}
      />
      <EmptyState
        glyph="( ~ )"
        title={t("showcase.labs.empty.title")}
        description={t("showcase.labs.empty.description")}
      />
    </>
  );
}
