import { auth, isAdmin } from "@asafarim/auth";
import { AppsManager } from "@/components/apps/apps-manager";

export const metadata = { title: "Apps · e2e-testora" };

export default async function AppsPage() {
  const session = await auth();
  return <AppsManager canDeleteBuiltIns={isAdmin(session)} />;
}
