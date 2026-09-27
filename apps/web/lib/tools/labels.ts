import type { ToolAvailability, ToolLifecycle } from "./types";

/** Translator shape returned by `getServerTranslator` (@asafarim/shared-i18n/server). */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export interface ToolCardLabels {
  use: string;
  view: string;
  continueIn: (app: string) => string;
  caseStudy: string;
  paste: string;
  get: string;
  privacy: string;
  availability: Record<ToolAvailability, string>;
  lifecycle: Record<ToolLifecycle, string>;
}

/** Catalogue-card wording from the Web dictionaries (web.tools.*). */
export function toolCardLabels(t: Translate): ToolCardLabels {
  return {
    use: t("web.tools.card.use"),
    view: t("web.tools.card.view"),
    continueIn: (app) => t("web.tools.card.continueIn", { app }),
    caseStudy: t("web.tools.card.caseStudy"),
    paste: t("web.tools.card.paste"),
    get: t("web.tools.card.get"),
    privacy: t("web.tools.card.privacy"),
    availability: {
      live: t("web.tools.availability.live"),
      "examples-only": t("web.tools.availability.examples-only"),
      paused: t("web.tools.availability.paused"),
    },
    lifecycle: {
      experiment: t("web.tools.lifecycle.experiment"),
      beta: t("web.tools.lifecycle.beta"),
      stable: t("web.tools.lifecycle.stable"),
      paused: t("web.tools.lifecycle.paused"),
      retired: t("web.tools.lifecycle.retired"),
    },
  };
}
