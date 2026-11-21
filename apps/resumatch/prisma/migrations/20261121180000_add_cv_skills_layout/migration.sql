-- How a tailored CV lays out its skills, and the checked, fact-based skills
-- paragraph when the candidate asked for one. Both nullable: existing CVs
-- keep rendering as they did (null layout = the automatic choice).
ALTER TABLE "tailored_resumes" ADD COLUMN "skillsLayout" TEXT;
ALTER TABLE "tailored_resumes" ADD COLUMN "skillsParagraph" TEXT;
