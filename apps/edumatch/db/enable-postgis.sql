-- Run this once against the EduMatch database before `prisma db push`
-- (or before the first migration that creates EduStudentProfile / EduTutorProfile).
-- PostGIS provides the `geography(Point, 4326)` type used by EduMatch geo columns.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Spatial index helpers; create after `prisma db push` has materialised the columns.
-- CREATE INDEX IF NOT EXISTS edu_student_home_location_gix
--   ON "EduStudentProfile" USING GIST ("homeLocation");
-- CREATE INDEX IF NOT EXISTS edu_tutor_home_location_gix
--   ON "EduTutorProfile" USING GIST ("homeLocation");
