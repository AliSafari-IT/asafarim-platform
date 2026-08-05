/**
 * Help Center content model.
 *
 * Local, typed, dependency-light — no CMS/backend. Article slugs are stable
 * and language-neutral (they're route segments, not translated), so
 * switching locale never breaks a link or a bookmark. All display text is
 * a translation key resolved by the caller via useTranslation()/t(); this
 * file only holds structure + key names, never literal copy.
 *
 * Coverage note: the platform's full workflow list (see apps/edumatch's
 * Help Center PR description) is grouped into 8 articles — 4 per audience
 * — rather than one micro-article per bullet point, so each article stays
 * a complete, readable walkthrough instead of a stub. Every listed
 * workflow is covered by exactly one of these.
 */

export type HelpAudience = "student" | "tutor" | "both";

export type HelpStepContent = {
  /** Translation key for the step's short title. */
  titleKey: string;
  /** Translation key for the step's body copy. */
  bodyKey: string;
  /**
   * Which built-in visual mockup to render for this step (HelpVisual).
   * Purely decorative/illustrative — never the only source of meaning.
   */
  visual: HelpVisualKind;
};

export type HelpVisualKind =
  | "sign-in"
  | "form"
  | "attachments"
  | "ai-response"
  | "quote-list"
  | "quote-compare"
  | "checkout"
  | "booking-status"
  | "dispute"
  | "tutor-profile"
  | "verification"
  | "requests-list"
  | "quote-form"
  | "earnings"
  | "connect-onboarding"
  | "settings";

export type HelpArticle = {
  /** Stable, language-neutral route segment. Never translate this. */
  slug: string;
  audience: HelpAudience;
  titleKey: string;
  summaryKey: string;
  /**
   * Search keywords as translation keys — resolved per-locale so a French
   * user searching "facture" still finds the checkout article even though
   * the slug says "checkout". Also matched against the raw English key
   * name as a stable fallback.
   */
  keywordKeys: string[];
  /** The real in-app route this article explains, for the CTA button. */
  workflowRoute: string;
  workflowLabelKey: string;
  prerequisitesKey: string;
  steps: HelpStepContent[];
  expectedResultKey: string;
  /** "Symptom → fix", one key per item (title+body combined, one sentence each). */
  troubleshootingKeys: string[];
  related: string[]; // other article slugs
};

export const HELP_ARTICLES: HelpArticle[] = [
  // ── Student ──────────────────────────────────────────────────────────
  {
    slug: "getting-started",
    audience: "student",
    titleKey: "edumatch.help.article.student.gettingStarted.title",
    summaryKey: "edumatch.help.article.student.gettingStarted.summary",
    keywordKeys: [
      "edumatch.help.article.student.gettingStarted.kw1",
      "edumatch.help.article.student.gettingStarted.kw2",
      "edumatch.help.article.student.gettingStarted.kw3",
    ],
    workflowRoute: "/student",
    workflowLabelKey: "edumatch.help.workflow.studentSpace",
    prerequisitesKey: "edumatch.help.article.student.gettingStarted.prereq",
    steps: [
      {
        titleKey: "edumatch.help.article.student.gettingStarted.step1.title",
        bodyKey: "edumatch.help.article.student.gettingStarted.step1.body",
        visual: "sign-in",
      },
      {
        titleKey: "edumatch.help.article.student.gettingStarted.step2.title",
        bodyKey: "edumatch.help.article.student.gettingStarted.step2.body",
        visual: "form",
      },
      {
        titleKey: "edumatch.help.article.student.gettingStarted.step3.title",
        bodyKey: "edumatch.help.article.student.gettingStarted.step3.body",
        visual: "form",
      },
      {
        titleKey: "edumatch.help.article.student.gettingStarted.step4.title",
        bodyKey: "edumatch.help.article.student.gettingStarted.step4.body",
        visual: "booking-status",
      },
    ],
    expectedResultKey: "edumatch.help.article.student.gettingStarted.result",
    troubleshootingKeys: [
      "edumatch.help.article.student.gettingStarted.trouble1",
      "edumatch.help.article.student.gettingStarted.trouble2",
      "edumatch.help.article.student.gettingStarted.trouble3",
    ],
    related: ["ask-a-question", "tutor-quotes-and-booking"],
  },
  {
    slug: "ask-a-question",
    audience: "student",
    titleKey: "edumatch.help.article.student.askQuestion.title",
    summaryKey: "edumatch.help.article.student.askQuestion.summary",
    keywordKeys: [
      "edumatch.help.article.student.askQuestion.kw1",
      "edumatch.help.article.student.askQuestion.kw2",
      "edumatch.help.article.student.askQuestion.kw3",
    ],
    workflowRoute: "/student/inquiry/new",
    workflowLabelKey: "edumatch.help.workflow.askQuestion",
    prerequisitesKey: "edumatch.help.article.student.askQuestion.prereq",
    steps: [
      {
        titleKey: "edumatch.help.article.student.askQuestion.step1.title",
        bodyKey: "edumatch.help.article.student.askQuestion.step1.body",
        visual: "form",
      },
      {
        titleKey: "edumatch.help.article.student.askQuestion.step2.title",
        bodyKey: "edumatch.help.article.student.askQuestion.step2.body",
        visual: "attachments",
      },
      {
        titleKey: "edumatch.help.article.student.askQuestion.step3.title",
        bodyKey: "edumatch.help.article.student.askQuestion.step3.body",
        visual: "ai-response",
      },
      {
        titleKey: "edumatch.help.article.student.askQuestion.step4.title",
        bodyKey: "edumatch.help.article.student.askQuestion.step4.body",
        visual: "ai-response",
      },
    ],
    expectedResultKey: "edumatch.help.article.student.askQuestion.result",
    troubleshootingKeys: [
      "edumatch.help.article.student.askQuestion.trouble1",
      "edumatch.help.article.student.askQuestion.trouble2",
      "edumatch.help.article.student.askQuestion.trouble3",
    ],
    related: ["getting-started", "tutor-quotes-and-booking"],
  },
  {
    slug: "tutor-quotes-and-booking",
    audience: "student",
    titleKey: "edumatch.help.article.student.quotesBooking.title",
    summaryKey: "edumatch.help.article.student.quotesBooking.summary",
    keywordKeys: [
      "edumatch.help.article.student.quotesBooking.kw1",
      "edumatch.help.article.student.quotesBooking.kw2",
      "edumatch.help.article.student.quotesBooking.kw3",
    ],
    workflowRoute: "/student/inquiry/new",
    workflowLabelKey: "edumatch.help.workflow.askQuestion",
    prerequisitesKey: "edumatch.help.article.student.quotesBooking.prereq",
    steps: [
      {
        titleKey: "edumatch.help.article.student.quotesBooking.step1.title",
        bodyKey: "edumatch.help.article.student.quotesBooking.step1.body",
        visual: "quote-list",
      },
      {
        titleKey: "edumatch.help.article.student.quotesBooking.step2.title",
        bodyKey: "edumatch.help.article.student.quotesBooking.step2.body",
        visual: "quote-compare",
      },
      {
        titleKey: "edumatch.help.article.student.quotesBooking.step3.title",
        bodyKey: "edumatch.help.article.student.quotesBooking.step3.body",
        visual: "checkout",
      },
      {
        titleKey: "edumatch.help.article.student.quotesBooking.step4.title",
        bodyKey: "edumatch.help.article.student.quotesBooking.step4.body",
        visual: "booking-status",
      },
    ],
    expectedResultKey: "edumatch.help.article.student.quotesBooking.result",
    troubleshootingKeys: [
      "edumatch.help.article.student.quotesBooking.trouble1",
      "edumatch.help.article.student.quotesBooking.trouble2",
      "edumatch.help.article.student.quotesBooking.trouble3",
    ],
    related: ["ask-a-question", "bookings-and-support"],
  },
  {
    slug: "bookings-and-support",
    audience: "student",
    titleKey: "edumatch.help.article.student.bookingsSupport.title",
    summaryKey: "edumatch.help.article.student.bookingsSupport.summary",
    keywordKeys: [
      "edumatch.help.article.student.bookingsSupport.kw1",
      "edumatch.help.article.student.bookingsSupport.kw2",
      "edumatch.help.article.student.bookingsSupport.kw3",
    ],
    workflowRoute: "/student/bookings",
    workflowLabelKey: "edumatch.help.workflow.myBookings",
    prerequisitesKey: "edumatch.help.article.student.bookingsSupport.prereq",
    steps: [
      {
        titleKey: "edumatch.help.article.student.bookingsSupport.step1.title",
        bodyKey: "edumatch.help.article.student.bookingsSupport.step1.body",
        visual: "booking-status",
      },
      {
        titleKey: "edumatch.help.article.student.bookingsSupport.step2.title",
        bodyKey: "edumatch.help.article.student.bookingsSupport.step2.body",
        visual: "booking-status",
      },
      {
        titleKey: "edumatch.help.article.student.bookingsSupport.step3.title",
        bodyKey: "edumatch.help.article.student.bookingsSupport.step3.body",
        visual: "dispute",
      },
      {
        titleKey: "edumatch.help.article.student.bookingsSupport.step4.title",
        bodyKey: "edumatch.help.article.student.bookingsSupport.step4.body",
        visual: "dispute",
      },
    ],
    expectedResultKey: "edumatch.help.article.student.bookingsSupport.result",
    troubleshootingKeys: [
      "edumatch.help.article.student.bookingsSupport.trouble1",
      "edumatch.help.article.student.bookingsSupport.trouble2",
      "edumatch.help.article.student.bookingsSupport.trouble3",
    ],
    related: ["tutor-quotes-and-booking", "getting-started"],
  },

  // ── Tutor ────────────────────────────────────────────────────────────
  {
    slug: "getting-started",
    audience: "tutor",
    titleKey: "edumatch.help.article.tutor.gettingStarted.title",
    summaryKey: "edumatch.help.article.tutor.gettingStarted.summary",
    keywordKeys: [
      "edumatch.help.article.tutor.gettingStarted.kw1",
      "edumatch.help.article.tutor.gettingStarted.kw2",
      "edumatch.help.article.tutor.gettingStarted.kw3",
    ],
    workflowRoute: "/tutor/profile",
    workflowLabelKey: "edumatch.help.workflow.tutorProfile",
    prerequisitesKey: "edumatch.help.article.tutor.gettingStarted.prereq",
    steps: [
      {
        titleKey: "edumatch.help.article.tutor.gettingStarted.step1.title",
        bodyKey: "edumatch.help.article.tutor.gettingStarted.step1.body",
        visual: "sign-in",
      },
      {
        titleKey: "edumatch.help.article.tutor.gettingStarted.step2.title",
        bodyKey: "edumatch.help.article.tutor.gettingStarted.step2.body",
        visual: "tutor-profile",
      },
      {
        titleKey: "edumatch.help.article.tutor.gettingStarted.step3.title",
        bodyKey: "edumatch.help.article.tutor.gettingStarted.step3.body",
        visual: "tutor-profile",
      },
      {
        titleKey: "edumatch.help.article.tutor.gettingStarted.step4.title",
        bodyKey: "edumatch.help.article.tutor.gettingStarted.step4.body",
        visual: "verification",
      },
    ],
    expectedResultKey: "edumatch.help.article.tutor.gettingStarted.result",
    troubleshootingKeys: [
      "edumatch.help.article.tutor.gettingStarted.trouble1",
      "edumatch.help.article.tutor.gettingStarted.trouble2",
      "edumatch.help.article.tutor.gettingStarted.trouble3",
    ],
    related: ["finding-and-quoting-requests", "payments-and-settings"],
  },
  {
    slug: "finding-and-quoting-requests",
    audience: "tutor",
    titleKey: "edumatch.help.article.tutor.requestsQuotes.title",
    summaryKey: "edumatch.help.article.tutor.requestsQuotes.summary",
    keywordKeys: [
      "edumatch.help.article.tutor.requestsQuotes.kw1",
      "edumatch.help.article.tutor.requestsQuotes.kw2",
      "edumatch.help.article.tutor.requestsQuotes.kw3",
    ],
    workflowRoute: "/tutor/requests",
    workflowLabelKey: "edumatch.help.workflow.tutorRequests",
    prerequisitesKey: "edumatch.help.article.tutor.requestsQuotes.prereq",
    steps: [
      {
        titleKey: "edumatch.help.article.tutor.requestsQuotes.step1.title",
        bodyKey: "edumatch.help.article.tutor.requestsQuotes.step1.body",
        visual: "requests-list",
      },
      {
        titleKey: "edumatch.help.article.tutor.requestsQuotes.step2.title",
        bodyKey: "edumatch.help.article.tutor.requestsQuotes.step2.body",
        visual: "attachments",
      },
      {
        titleKey: "edumatch.help.article.tutor.requestsQuotes.step3.title",
        bodyKey: "edumatch.help.article.tutor.requestsQuotes.step3.body",
        visual: "quote-form",
      },
      {
        titleKey: "edumatch.help.article.tutor.requestsQuotes.step4.title",
        bodyKey: "edumatch.help.article.tutor.requestsQuotes.step4.body",
        visual: "quote-list",
      },
    ],
    expectedResultKey: "edumatch.help.article.tutor.requestsQuotes.result",
    troubleshootingKeys: [
      "edumatch.help.article.tutor.requestsQuotes.trouble1",
      "edumatch.help.article.tutor.requestsQuotes.trouble2",
      "edumatch.help.article.tutor.requestsQuotes.trouble3",
    ],
    related: ["getting-started", "bookings-and-disputes"],
  },
  {
    slug: "bookings-and-disputes",
    audience: "tutor",
    titleKey: "edumatch.help.article.tutor.bookingsDisputes.title",
    summaryKey: "edumatch.help.article.tutor.bookingsDisputes.summary",
    keywordKeys: [
      "edumatch.help.article.tutor.bookingsDisputes.kw1",
      "edumatch.help.article.tutor.bookingsDisputes.kw2",
      "edumatch.help.article.tutor.bookingsDisputes.kw3",
    ],
    workflowRoute: "/tutor/bookings",
    workflowLabelKey: "edumatch.help.workflow.tutorBookings",
    prerequisitesKey: "edumatch.help.article.tutor.bookingsDisputes.prereq",
    steps: [
      {
        titleKey: "edumatch.help.article.tutor.bookingsDisputes.step1.title",
        bodyKey: "edumatch.help.article.tutor.bookingsDisputes.step1.body",
        visual: "booking-status",
      },
      {
        titleKey: "edumatch.help.article.tutor.bookingsDisputes.step2.title",
        bodyKey: "edumatch.help.article.tutor.bookingsDisputes.step2.body",
        visual: "booking-status",
      },
      {
        titleKey: "edumatch.help.article.tutor.bookingsDisputes.step3.title",
        bodyKey: "edumatch.help.article.tutor.bookingsDisputes.step3.body",
        visual: "dispute",
      },
      {
        titleKey: "edumatch.help.article.tutor.bookingsDisputes.step4.title",
        bodyKey: "edumatch.help.article.tutor.bookingsDisputes.step4.body",
        visual: "dispute",
      },
    ],
    expectedResultKey: "edumatch.help.article.tutor.bookingsDisputes.result",
    troubleshootingKeys: [
      "edumatch.help.article.tutor.bookingsDisputes.trouble1",
      "edumatch.help.article.tutor.bookingsDisputes.trouble2",
      "edumatch.help.article.tutor.bookingsDisputes.trouble3",
    ],
    related: ["finding-and-quoting-requests", "payments-and-settings"],
  },
  {
    slug: "payments-and-settings",
    audience: "tutor",
    titleKey: "edumatch.help.article.tutor.paymentsSettings.title",
    summaryKey: "edumatch.help.article.tutor.paymentsSettings.summary",
    keywordKeys: [
      "edumatch.help.article.tutor.paymentsSettings.kw1",
      "edumatch.help.article.tutor.paymentsSettings.kw2",
      "edumatch.help.article.tutor.paymentsSettings.kw3",
    ],
    workflowRoute: "/tutor/connect/onboard",
    workflowLabelKey: "edumatch.help.workflow.connectOnboard",
    prerequisitesKey: "edumatch.help.article.tutor.paymentsSettings.prereq",
    steps: [
      {
        titleKey: "edumatch.help.article.tutor.paymentsSettings.step1.title",
        bodyKey: "edumatch.help.article.tutor.paymentsSettings.step1.body",
        visual: "connect-onboarding",
      },
      {
        titleKey: "edumatch.help.article.tutor.paymentsSettings.step2.title",
        bodyKey: "edumatch.help.article.tutor.paymentsSettings.step2.body",
        visual: "connect-onboarding",
      },
      {
        titleKey: "edumatch.help.article.tutor.paymentsSettings.step3.title",
        bodyKey: "edumatch.help.article.tutor.paymentsSettings.step3.body",
        visual: "earnings",
      },
      {
        titleKey: "edumatch.help.article.tutor.paymentsSettings.step4.title",
        bodyKey: "edumatch.help.article.tutor.paymentsSettings.step4.body",
        visual: "settings",
      },
    ],
    expectedResultKey: "edumatch.help.article.tutor.paymentsSettings.result",
    troubleshootingKeys: [
      "edumatch.help.article.tutor.paymentsSettings.trouble1",
      "edumatch.help.article.tutor.paymentsSettings.trouble2",
      "edumatch.help.article.tutor.paymentsSettings.trouble3",
    ],
    related: ["getting-started", "bookings-and-disputes"],
  },
];

export function getArticle(
  audience: "student" | "tutor",
  slug: string,
): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug && a.audience === audience);
}

export function getArticlesForAudience(
  audience: "student" | "tutor",
): HelpArticle[] {
  return HELP_ARTICLES.filter((a) => a.audience === audience || a.audience === "both");
}

export function getRelatedArticles(article: HelpArticle): HelpArticle[] {
  return article.related
    .map((slug) => getArticle(article.audience as "student" | "tutor", slug))
    .filter((a): a is HelpArticle => Boolean(a));
}

/**
 * Case-insensitive search across a resolved (translated) view of the
 * articles. Callers pass a `resolve(key) => string` (their t()) so search
 * always matches what's actually on screen for the current locale, plus
 * the raw key name as a stable, locale-independent fallback (useful for
 * e2e tests and for partial translations).
 */
export type ResolvedHelpArticle = HelpArticle & {
  title: string;
  summary: string;
};

export function resolveArticles(
  articles: HelpArticle[],
  t: (key: string) => string,
): ResolvedHelpArticle[] {
  return articles.map((a) => ({
    ...a,
    title: t(a.titleKey),
    summary: t(a.summaryKey),
  }));
}

export function searchArticles(
  articles: ResolvedHelpArticle[],
  query: string,
  t: (key: string) => string,
): ResolvedHelpArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return articles;
  return articles.filter((a) => {
    const haystack = [
      a.title,
      a.summary,
      a.slug,
      ...a.keywordKeys.map((k) => t(k)),
      ...a.keywordKeys,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
