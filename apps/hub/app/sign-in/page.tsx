import { redirect } from "next/navigation";
import { auth } from "@asafarim/auth";
import { getPlatformLinks } from "@asafarim/ui";
import { SignInPageContent } from "./_components/SignInPageContent";

const links = getPlatformLinks();
const trustedOrigins = new Set(
  [links.web, links.hub, links.showcase, links.admin].map((url) => new URL(url).origin)
);

function normalizeCallbackUrl(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    if (raw.startsWith("/sign-in") || raw.startsWith("/sign-up")) return "/dashboard";
    return raw;
  }
  try {
    const url = new URL(raw);
    if (trustedOrigins.has(url.origin)) return raw;
  } catch {
    // ignore malformed URLs
  }
  return "/dashboard";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrlParam =
    typeof params.callbackUrl === "string" ? params.callbackUrl : null;

  if (session?.user) {
    redirect(normalizeCallbackUrl(callbackUrlParam));
  }

  return <SignInPageContent />;
}
