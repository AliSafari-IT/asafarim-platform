-- #642: output language for cover letters. Additive and nullable: existing
-- rows keep NULL ("no language applied"), which renders exactly as before.
ALTER TABLE "cover_letters" ADD COLUMN "outputLanguage" TEXT;
ALTER TABLE "tailor_previews" ADD COLUMN "coverLetterOutputLanguage" TEXT;
