import type { ReactNode } from "react";
import { StudentSidebar } from "@/components/EduSidebar";

/**
 * Persistent navigation for the whole /student section — the same gap as
 * /tutor/layout.tsx fixes, and the same pre-built, unused component
 * (components/EduSidebar.tsx).
 */
export default function StudentLayout({ children }: { children: ReactNode }) {
  return <StudentSidebar>{children}</StudentSidebar>;
}
