import type { ReactNode } from "react";
import { TutorSidebar } from "@/components/EduSidebar";

/**
 * Persistent navigation for the whole /tutor section.
 *
 * TutorSidebar already existed (components/EduSidebar.tsx) with a correct
 * "Requests" entry pointing at /tutor/requests — it just wasn't mounted
 * anywhere, so every tutor page was a standalone screen reachable only by
 * going back to the dashboard and finding its card's link (or typing the
 * URL directly, which is how this gap got noticed: /tutor/requests worked
 * fine, there was just no way to *get* there except the dashboard's small
 * "View requests →" link).
 */
export default function TutorLayout({ children }: { children: ReactNode }) {
  return <TutorSidebar>{children}</TutorSidebar>;
}
