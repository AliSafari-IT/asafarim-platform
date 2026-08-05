"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { BookOpenCheck, CalendarDays, CircleDollarSign, FileCheck2, LayoutDashboard, MessageSquareText, Settings, UserRound } from "lucide-react";

const studentItems = [
  ["Overview", "/student", LayoutDashboard],
  ["Ask a question", "/student/inquiry/new", MessageSquareText],
  ["Bookings", "/student/bookings", CalendarDays],
  ["Learning profile", "/student/profile", UserRound],
] as const;
const tutorItems = [
  ["Studio", "/tutor", LayoutDashboard],
  ["Requests", "/tutor/requests", BookOpenCheck],
  ["Bookings", "/tutor/bookings", CalendarDays],
  ["Quotes", "/tutor/quotes", MessageSquareText],
  ["Earnings", "/tutor/earnings", CircleDollarSign],
  ["Verification", "/tutor/verification", FileCheck2],
  ["Profile", "/tutor/profile", UserRound],
  ["Settings", "/tutor/settings", Settings],
] as const;

function Workspace({ children, role }: { children: React.ReactNode; role: "student" | "tutor" }) {
  const pathname = usePathname();
  const items = role === "student" ? studentItems : tutorItems;
  return (
    <div className="edu-workspace">
      <aside className="edu-sidebar">
        <div><span>Workspace</span><strong>{role === "student" ? "Learn with clarity" : "Tutor studio"}</strong></div>
        <nav>{items.map(([label, href, Icon]) => <Link className={pathname === href ? "is-active" : ""} href={href} key={href}><Icon size={18} />{label}</Link>)}</nav>
      </aside>
      <div className="edu-workspace-main">{children}</div>
    </div>
  );
}

export function StudentSidebar({ children }: { children: React.ReactNode }) { return <Workspace role="student">{children}</Workspace>; }
export function TutorSidebar({ children }: { children: React.ReactNode }) { return <Workspace role="tutor">{children}</Workspace>; }
export function EduSidebar({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const roles = session?.user?.roles || [];
  if (roles.includes("edumatch_student")) return <StudentSidebar>{children}</StudentSidebar>;
  if (roles.includes("edumatch_tutor")) return <TutorSidebar>{children}</TutorSidebar>;
  return <>{children}</>;
}
