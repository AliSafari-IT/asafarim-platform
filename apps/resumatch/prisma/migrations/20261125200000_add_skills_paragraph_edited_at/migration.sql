-- A hand edit of the CV skills paragraph (CV preview, "Edit paragraph").
-- Null while the paragraph is the AI's checked text. Additive and nullable.
ALTER TABLE "tailored_resumes" ADD COLUMN "skillsParagraphEditedAt" TIMESTAMP(3);
