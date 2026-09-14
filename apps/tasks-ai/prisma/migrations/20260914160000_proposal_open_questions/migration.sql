-- Issue #368: the review step has to be able to show what the model was
-- unsure about. `openQuestions` already existed on the generated draft
-- (lib/ai/types.ts) but was dropped when the proposal was persisted, so the
-- reviewer never saw it. Nullable and additive — existing rows keep NULL and
-- render no questions section.
ALTER TABLE "proposal" ADD COLUMN "openQuestions" JSONB;
