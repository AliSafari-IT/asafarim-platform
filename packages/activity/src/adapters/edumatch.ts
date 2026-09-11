import { prisma } from "@asafarim/db";
import type { ActivityEntry, ActivityLookup, ActivitySection, UserActivityAdapter } from "../types";

function edumatchUrl(): string {
  return process.env.NEXT_PUBLIC_EDUMATCH_URL ?? "http://localhost:3009";
}

/**
 * EduMatch adapter: a user can appear as a student (inquiries, bookings) and/or
 * a tutor (bookings, verification reviews), so bookings are queried by either
 * side. There is no dedicated dispute model — DISPUTED is one value of
 * EduBooking.status — so disputed bookings are surfaced as their own entry
 * type rather than left folded into "booking", per the issue's checklist.
 */
export const edumatchActivityAdapter: UserActivityAdapter = {
  app: "edumatch",

  async getActivity({ userId }: ActivityLookup): Promise<ActivitySection> {
    const base = edumatchUrl();

    const [inquiries, bookings, verifications] = await Promise.all([
      prisma.eduInquiry.findMany({
        where: { studentId: userId },
        orderBy: { createdAt: "desc" },
        select: { id: true, subject: true, status: true, createdAt: true, updatedAt: true },
      }),
      prisma.eduBooking.findMany({
        where: { OR: [{ studentId: userId }, { tutorId: userId }] },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          studentId: true,
          tutorId: true,
          scheduledAt: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.eduTutorVerification.findMany({
        where: { tutorId: userId },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, resolvedAt: true, createdAt: true, updatedAt: true },
      }),
    ]);

    const entries: ActivityEntry[] = [
      ...inquiries.map(
        (i): ActivityEntry => ({
          id: i.id,
          app: "edumatch",
          type: "inquiry",
          title: i.subject,
          status: i.status,
          createdAt: i.createdAt,
          updatedAt: i.updatedAt,
          href: `${base}/student`,
          metadata: {},
        })
      ),
      ...bookings.map(
        (b): ActivityEntry => ({
          id: b.id,
          app: "edumatch",
          // A dedicated entry type for the DISPUTED status: there is no
          // separate EduDispute model, so this is the only way a dispute is
          // visible in the User 360 view rather than folded into "booking".
          type: b.status === "DISPUTED" ? "dispute" : "booking",
          title: `Booking with ${b.studentId === userId ? "tutor" : "student"}`,
          status: b.status,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
          href: `${base}/${b.studentId === userId ? "student" : "tutor"}/bookings/${b.id}`,
          metadata: { scheduledAt: b.scheduledAt, role: b.studentId === userId ? "student" : "tutor" },
        })
      ),
      ...verifications.map(
        (v): ActivityEntry => ({
          id: v.id,
          app: "edumatch",
          type: "tutor_verification",
          title: "Tutor verification review",
          status: v.status,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
          href: `${base}/tutor/verification`,
          metadata: { resolvedAt: v.resolvedAt },
        })
      ),
    ];

    return { app: "edumatch", supported: true, available: true, entries };
  },
};
