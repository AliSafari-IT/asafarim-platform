-- #933: the retention sweep reads previews and review feedback by age
-- across every workspace. Additive indexes only; no data changes.
CREATE INDEX "tailor_previews_createdAt_idx" ON "tailor_previews"("createdAt");

CREATE INDEX "tailoring_feedback_createdAt_idx" ON "tailoring_feedback"("createdAt");
