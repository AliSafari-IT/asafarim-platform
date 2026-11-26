-- #972 review fixes: keep the requirement quote with each job fit answer,
-- so a "no" still reaches tailoring when a later analysis does not list it.
ALTER TABLE "job_fit_answers" ADD COLUMN "requirementQuote" TEXT;
