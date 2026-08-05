import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getAuthedUser } from "@/lib/server/auth";
import { isAdmin } from "@/lib/server/profiles";
import { AdminShell } from "./AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getAuthedUser();
  const portalUrl = process.env.PORTAL_URL || "https://portal.asafarim.com";

  if (!user) {
    redirect(`${portalUrl}/sign-in`);
  }

  if (!isAdmin(user)) {
    redirect("/");
  }

  return (
    <AdminShell userEmail={user.email} userRoles={user.roles}>
      {children}
    </AdminShell>
  );
}
