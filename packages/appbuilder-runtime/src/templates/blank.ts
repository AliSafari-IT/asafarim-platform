import { emptySpecification } from "@asafarim/appbuilder-schema";
import type { AppTemplate } from "./types";

/**
 * Produces exactly `emptySpecification(app)` — byte-identical to what
 * `apps/appbuilder`'s creation transaction already persists for every new
 * app today. Kept as its own template (rather than special-cased) so the
 * registry has one uniform lookup regardless of starter family, and so a
 * future switch to template-driven creation can rely on this being a
 * verified no-op for "blank".
 */
export const blankTemplate: AppTemplate = {
  id: "blank",
  displayName: "Blank internal business app",
  description: "An empty specification with no entities, pages, or navigation yet — start from scratch.",
  build: emptySpecification,
};
