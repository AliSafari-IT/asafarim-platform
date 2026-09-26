-- #641: output language for tailored CVs. Additive and nullable: existing
-- rows keep NULL ("no language applied"), which renders exactly as before.
ALTER TABLE "tailored_resumes" ADD COLUMN "outputLanguage" TEXT;
ALTER TABLE "tailor_previews" ADD COLUMN "outputLanguage" TEXT;
