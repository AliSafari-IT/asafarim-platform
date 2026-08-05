"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslation } from "@asafarim/shared-i18n";
import {
  BookOpenCheck,
  CalendarDays,
  CircleDollarSign,
  FileCheck2,
  HelpCircle,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  UserRound,
} from "lucide-react";

function Workspace({ children, role }: { children: React.ReactNode; role: "student" | "tutor" }) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const studentItems = [
    ["edumatch.sidebar.overview", "/student", LayoutDashboard],
    ["edumatch.sidebar.askQuestion", "/student/inquiry/new", MessageSquareText],
    ["edumatch.sidebar.bookings", "/student/bookings", CalendarDays],
    ["edumatch.sidebar.learningProfile", "/student/profile", UserRound],
    ["edumatch.sidebar.help", "/help/students", HelpCircle],
  ] as const;
  const tutorItems = [
    ["edumatch.sidebar.studio", "/tutor", LayoutDashboard],
    ["edumatch.sidebar.requests", "/tutor/requests", BookOpenCheck],
    ["edumatch.sidebar.bookings", "/tutor/bookings", CalendarDays],
    ["edumatch.sidebar.quotes", "/tutor/quotes", MessageSquareText],
    ["edumatch.sidebar.earnings", "/tutor/earnings", CircleDollarSign],
    ["edumatch.sidebar.verification", "/tutor/verification", FileCheck2],
    ["edumatch.sidebar.profile", "/tutor/profile", UserRound],
    ["edumatch.sidebar.settings", "/tutor/settings", Settings],
    ["edumatch.sidebar.help", "/help/tutors", HelpCircle],
  ] as const;

  const items = role === "student" ? studentItems : tutorItems;

  return (
    <div className="edu-workspace">
      <aside className="edu-sidebar">
        <div>
          <span>{t("edumatch.sidebar.workspace")}</span>
          <strong>{t(role === "student" ? "edumatch.sidebar.studentTagline" : "edumatch.sidebar.tutorTagline")}</strong>
        </div>
        <nav aria-label={t("edumatch.sidebar.workspace")}>
          {items.map(([labelKey, href, Icon]) => (
            <Link
              className={pathname === href ? "is-active" : ""}
              aria-current={pathname === href ? "page" : undefined}
              href={href}
              key={href}
            >
              <Icon size={18} aria-hidden="true" />
              {t(labelKey)}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="edu-workspace-main">{children}</div>
    </div>
  );
}

export function StudentSidebar({ children }: { children: React.ReactNode }) {
  return <Workspace role="student">{children}</Workspace>;
}
export function TutorSidebar({ children }: { children: React.ReactNode }) {
  return <Workspace role="tutor">{children}</Workspace>;
}
export function EduSidebar({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const roles = session?.user?.roles || [];
  if (roles.includes("edumatch_student")) return <StudentSidebar>{children}</StudentSidebar>;
  if (roles.includes("edumatch_tutor")) return <TutorSidebar>{children}</TutorSidebar>;
  return <>{children}</>;
}
