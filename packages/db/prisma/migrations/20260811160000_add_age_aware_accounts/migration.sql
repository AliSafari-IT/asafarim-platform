-- Age-aware accounts (#142): students under 16 are parent-managed; 16+
-- students act independently. Builds on EduStudentProfile.dateOfBirth from
-- 20260811150000_add_student_date_of_birth.

-- EduParentProfile: a user with this row is a parent/guardian.
CREATE TABLE "EduParentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EduParentProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EduParentProfile_userId_key" ON "EduParentProfile"("userId");

ALTER TABLE "EduParentProfile"
    ADD CONSTRAINT "EduParentProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EduStudentProfile.parentUserId: set when the profile is parent-managed.
ALTER TABLE "EduStudentProfile" ADD COLUMN "parentUserId" TEXT;

CREATE INDEX "EduStudentProfile_parentUserId_idx" ON "EduStudentProfile"("parentUserId");

ALTER TABLE "EduStudentProfile"
    ADD CONSTRAINT "EduStudentProfile_parentUserId_fkey"
    FOREIGN KEY ("parentUserId") REFERENCES "EduParentProfile"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- EduBooking.payerId: who is legally/financially responsible for the
-- booking (self for an independent student, parent otherwise). Plain
-- scalar, no FK — see schema.prisma comment.
ALTER TABLE "EduBooking" ADD COLUMN "payerId" TEXT;

CREATE INDEX "EduBooking_payerId_idx" ON "EduBooking"("payerId");
