import { prisma } from "@asafarim/db";
import type {
  ActivityEntry,
  ActivityLookup,
  ActivitySection,
  ListAllOptions,
  ListAllResult,
  UserActivityAdapter,
} from "../types";

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
          // Neither /student/bookings nor /tutor/bookings has a [id] detail
          // route (the only per-booking page, /tutor/sessions/[bookingId],
          // is a tutor-only session-note editor, not a generic viewer), and
          // a bare list page would show the *viewing admin's own* bookings
          // (usually none) rather than this entry's actual person. The
          // admin-only /admin/bookings view (gated to the platform
          // admin/superadmin roles this User 360 explorer is already
          // restricted to — plus EduMatch's own edumatch_admin, which every
          // viewer here already outranks) accepts a studentId/tutorId
          // filter, so this links there, scoped to whichever side `userId`
          // is on.
          href: `${base}/admin/bookings?${b.studentId === userId ? "studentId" : "tutorId"}=${userId}`,
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

  /**
   * EduMatch's flagship content for the platform-wide browse view is
   * bookings — the actual matched, paid tutoring session, closest analog to
   * Vionto's exports / TimelineAI's timelines. A booking has two real
   * platform users (student and tutor); the student is attributed as
   * `owner` since they're the one who opened the funnel (the inquiry) that
   * led to it — the tutor's name/email are carried in `metadata` instead so
   * neither side is silently dropped from the entry.
   */
  async listAll({ limit, cursor }: ListAllOptions): Promise<ListAllResult> {
    const base = edumatchUrl();
    const bookings = await prisma.eduBooking.findMany({
      where: cursor ? { createdAt: { lt: new Date(cursor) } } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        createdAt: true,
        updatedAt: true,
        studentId: true,
        student: { select: { email: true, name: true } },
        tutor: { select: { email: true, name: true } },
        quote: {
          select: {
            quoteRequest: { select: { inquiry: { select: { subject: true } } } },
          },
        },
      },
    });

    const hasMore = bookings.length > limit;
    const page = hasMore ? bookings.slice(0, limit) : bookings;

    return {
      entries: page.map((b) => ({
        id: b.id,
        app: "edumatch",
        type: b.status === "DISPUTED" ? "dispute" : "booking",
        title: b.quote.quoteRequest.inquiry.subject,
        status: b.status,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        // See getActivity's own booking href above for why this isn't a
        // fabricated per-item URL, and why not a bare list page either:
        // scoped to the student who generated this entry, on the
        // superadmin-only admin view, not the viewing admin's own
        // (nonexistent) bookings.
        href: `${base}/admin/bookings?studentId=${b.studentId}`,
        metadata: {
          scheduledAt: b.scheduledAt,
          tutorEmail: b.tutor.email,
          tutorName: b.tutor.name,
        },
        owner: {
          userId: b.studentId,
          email: b.student.email,
          name: b.student.name,
        },
      })),
      nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null,
    };
  },
};
