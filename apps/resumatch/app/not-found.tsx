import Link from "next/link";
import { PageHeader } from "@asafarim/ui";
import { getTranslator } from "../lib/i18n-server";

export default async function NotFound() {
  const { t } = await getTranslator();
  return (
    <>
      <PageHeader kicker="404" title={t("resumatch.notFound.title")} />
      <p className="jm-note">
        <Link href="/" className="jm-mono">
          {t("resumatch.notFound.back")}
        </Link>
      </p>
    </>
  );
}
