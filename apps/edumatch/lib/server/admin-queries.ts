import { prisma } from "@asafarim/db";

export type PaginationOpts = {
  limit?: number;
  offset?: number;
};

export async function getAdminOverviewStats() {
  const [
    openVerifications,
    disputedBookings,
    recentBookings,
    recentInquiries,
    refusedInquiries,
    recentTransactions,
    recentAuditEvents,
    totalStudents,
    totalTutors,
  ] = await Promise.all([
    prisma.eduTutorVerification.count({
      where: { status: { in: ["PENDING", "NEEDS_CHANGES"] } },
    }),
    prisma.eduBooking.count({ where: { status: "DISPUTED" } }),
    prisma.eduBooking.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        createdAt: true,
        student: { select: { name: true, email: true } },
        tutor: { select: { name: true, email: true } },
      },
    }),
    prisma.eduInquiry.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        subject: true,
        status: true,
        moderationOutcome: true,
        createdAt: true,
        student: { select: { name: true, email: true } },
      },
    }),
    prisma.eduInquiry.count({
      where: { moderationOutcome: "REFUSE" },
    }),
    prisma.eduTransaction.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        grossCents: true,
        netCents: true,
        currency: true,
        createdAt: true,
      },
    }),
    prisma.eduAuditEvent.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        actorRole: true,
        createdAt: true,
        actor: { select: { name: true, email: true } },
      },
    }),
    prisma.eduStudentProfile.count(),
    prisma.eduTutorProfile.count(),
  ]);

  return {
    openVerifications,
    disputedBookings,
    refusedInquiries,
    totalStudents,
    totalTutors,
    recentBookings,
    recentInquiries,
    recentTransactions,
    recentAuditEvents,
  };
}

export async function listAdminBookings(opts: PaginationOpts & {
  status?: string;
  studentId?: string;
  tutorId?: string;
} = {}) {
  const { limit = 50, offset = 0, status, studentId, tutorId } = opts;
  const [items, total] = await Promise.all([
    prisma.eduBooking.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(studentId ? { studentId } : {}),
        ...(tutorId ? { tutorId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        quoteId: true,
        status: true,
        mode: true,
        scheduledAt: true,
        durationMinutes: true,
        completedAt: true,
        cancelledAt: true,
        cancellationReason: true,
        stripePaymentIntentId: true,
        createdAt: true,
        student: { select: { id: true, name: true, email: true } },
        tutor: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.eduBooking.count({
      where: {
        ...(status ? { status } : {}),
        ...(studentId ? { studentId } : {}),
        ...(tutorId ? { tutorId } : {}),
      },
    }),
  ]);
  return { items, total };
}

export async function listAdminDisputes(opts: PaginationOpts = {}) {
  const { limit = 50, offset = 0 } = opts;
  const [items, total] = await Promise.all([
    prisma.eduBooking.findMany({
      where: { status: "DISPUTED" },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        quoteId: true,
        status: true,
        mode: true,
        scheduledAt: true,
        cancelledAt: true,
        cancellationReason: true,
        stripePaymentIntentId: true,
        createdAt: true,
        updatedAt: true,
        student: { select: { id: true, name: true, email: true } },
        tutor: { select: { id: true, name: true, email: true } },
        transactions: {
          select: { id: true, type: true, grossCents: true, netCents: true, createdAt: true },
        },
      },
    }),
    prisma.eduBooking.count({ where: { status: "DISPUTED" } }),
  ]);
  return { items, total };
}

export async function listAdminTransactions(opts: PaginationOpts & {
  type?: string;
  tutorId?: string;
  bookingId?: string;
} = {}) {
  const { limit = 50, offset = 0, type, tutorId, bookingId } = opts;
  const [items, total] = await Promise.all([
    prisma.eduTransaction.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(tutorId ? { tutorId } : {}),
        ...(bookingId ? { bookingId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        bookingId: true,
        type: true,
        grossCents: true,
        platformFeeCents: true,
        netCents: true,
        currency: true,
        stripeChargeId: true,
        stripePayoutId: true,
        createdAt: true,
        tutor: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.eduTransaction.count({
      where: {
        ...(type ? { type } : {}),
        ...(tutorId ? { tutorId } : {}),
        ...(bookingId ? { bookingId } : {}),
      },
    }),
  ]);
  return { items, total };
}

export async function listAdminUsers(opts: PaginationOpts & {
  search?: string;
} = {}) {
  const { limit = 50, offset = 0, search } = opts;
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        userRoles: {
          select: { role: { select: { name: true } } },
        },
        eduStudentProfile: { select: { id: true, gradeLevel: true } },
        eduTutorProfile: {
          select: {
            id: true,
            verifiedAt: true,
            subjectsTaught: true,
            ratingAvg: true,
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: items.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      roles: u.userRoles.map((ur) => ur.role.name),
      hasStudentProfile: !!u.eduStudentProfile,
      hasTutorProfile: !!u.eduTutorProfile,
      tutorVerified: u.eduTutorProfile?.verifiedAt != null,
      studentGradeLevel: u.eduStudentProfile?.gradeLevel ?? null,
      tutorSubjects: u.eduTutorProfile?.subjectsTaught ?? [],
      tutorRating: u.eduTutorProfile?.ratingAvg ?? null,
    })),
    total,
  };
}

/**
 * Full detail for a single user in the admin directory: profile fields,
 * roles, and — where applicable — student/tutor profile plus rating.
 * Returns null when no such user exists.
 */
export async function getAdminUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      bio: true,
      phone: true,
      location: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      userRoles: { select: { role: { select: { name: true } } } },
      eduStudentProfile: {
        select: {
          id: true,
          gradeLevel: true,
          subjectsOfInterest: true,
          homeLat: true,
          homeLng: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      eduTutorProfile: {
        select: {
          id: true,
          bio: true,
          subjectsTaught: true,
          levelsTaught: true,
          hourlyRateCents: true,
          onlineOnly: true,
          serviceRadiusKm: true,
          payoutEnabled: true,
          verifiedAt: true,
          ratingAvg: true,
          ratingCount: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    bio: user.bio,
    phone: user.phone,
    location: user.location,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles: user.userRoles.map((ur) => ur.role.name),
    studentProfile: user.eduStudentProfile,
    tutorProfile: user.eduTutorProfile,
  };
}

export async function listAdminInquiries(opts: PaginationOpts & {
  status?: string;
  moderationOutcome?: string;
  subject?: string;
} = {}) {
  const { limit = 50, offset = 0, status, moderationOutcome, subject } = opts;
  const [items, total] = await Promise.all([
    prisma.eduInquiry.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(moderationOutcome ? { moderationOutcome } : {}),
        ...(subject ? { subject: { contains: subject, mode: "insensitive" as const } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        subject: true,
        gradeLevel: true,
        status: true,
        moderationOutcome: true,
        moderationCategory: true,
        createdAt: true,
        student: { select: { id: true, name: true, email: true } },
        aiResponses: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { modelUsed: true, moderationOutcome: true },
        },
      },
    }),
    prisma.eduInquiry.count({
      where: {
        ...(status ? { status } : {}),
        ...(moderationOutcome ? { moderationOutcome } : {}),
        ...(subject ? { subject: { contains: subject, mode: "insensitive" as const } } : {}),
      },
    }),
  ]);
  return { items, total };
}

export async function getAdminWallets(opts: PaginationOpts = {}) {
  const { limit = 50, offset = 0 } = opts;
  const [items, total] = await Promise.all([
    prisma.eduWallet.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        tutorId: true,
        balanceCents: true,
        pendingCents: true,
        lastPayoutAt: true,
        currency: true,
        tutor: { select: { name: true, email: true } },
      },
    }),
    prisma.eduWallet.count(),
  ]);
  return { items, total };
}
