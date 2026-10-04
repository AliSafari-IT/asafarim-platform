import { redirect } from "next/navigation";
import { auth } from "@asafarim/auth";
import { normalizeCallbackUrl } from "@/lib/callback-url";
import { SignInPageContent } from "./_components/SignInPageContent";

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
