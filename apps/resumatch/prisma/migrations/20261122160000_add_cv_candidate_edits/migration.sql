-- The candidate's own hand edits on the Tailor review screen (skills added
-- or removed for this CV, bullets they wrote). Nullable: existing CVs have
-- none, and the edits are already applied to "content".
ALTER TABLE "tailored_resumes" ADD COLUMN "candidateEdits" JSONB;
