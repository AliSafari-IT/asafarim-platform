-- Student avatar system (#141): dateOfBirth is the source of truth for the
-- under-13 photo-upload restriction. Nullable — a missing value is treated
-- as the most restrictive age everywhere it's read (see lib/server/age.ts).

ALTER TABLE "EduStudentProfile" ADD COLUMN "dateOfBirth" TIMESTAMP(3);

CREATE INDEX "EduStudentProfile_dateOfBirth_idx" ON "EduStudentProfile"("dateOfBirth");
