-- #928: the server-resolved request context of a tailoring run, shared by
-- the CV and cover-letter calls. All nullable: previews and CVs made before
-- this change have none and keep working as they did.
ALTER TABLE "tailor_previews" ADD COLUMN "contextVersion" TEXT;
ALTER TABLE "tailor_previews" ADD COLUMN "context" JSONB;
ALTER TABLE "tailor_previews" ADD COLUMN "contextFingerprint" TEXT;
ALTER TABLE "tailored_resumes" ADD COLUMN "tailoringContext" JSONB;
