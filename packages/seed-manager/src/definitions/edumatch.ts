// EduMatch demo seed definitions: a small, deterministic, fully synthetic
// dataset exercising every stage of the student→tutor flow (inquiry → AI
// response → quote → booking → payout) without touching Stripe, sending real
// email, or using real identities.
//
// Extracted from packages/db/prisma/seed-edumatch.ts, which is now a thin CLI
// wrapper. Users are keyed on a reserved `@edumatch.demo` email domain and
// every other row on a fixed `seed-*` id — that is what makes removal exact.

export const EDUMATCH_DEFINITION_VERSION = "1.1.0";

/** Reserved domain. A real user can never occupy one of these addresses. */
export const EDUMATCH_DEMO_EMAIL_DOMAIN = "@edumatch.demo";

export interface DemoStudent {
  email: string;
  name: string;
  gradeLevel: string;
  subjects: string[];
}

export interface DemoTutor {
  email: string;
  name: string;
  subjects: string[];
  levels: string[];
  hourlyRateCents: number;
  verified: boolean;
  ratingAvg: number;
  ratingCount: number;
}

export const EDUMATCH_STUDENTS: DemoStudent[] = [
  { email: `demo.student1${EDUMATCH_DEMO_EMAIL_DOMAIN}`, name: "Nora Demo", gradeLevel: "UNDERGRAD", subjects: ["Mathematics", "Physics"] },
  { email: `demo.student2${EDUMATCH_DEMO_EMAIL_DOMAIN}`, name: "Idris Demo", gradeLevel: "K12", subjects: ["Chemistry"] },
  { email: `demo.student3${EDUMATCH_DEMO_EMAIL_DOMAIN}`, name: "Yara Demo", gradeLevel: "GRAD", subjects: ["Computer Science", "Statistics"] },
];

export const EDUMATCH_TUTORS: DemoTutor[] = [
  { email: `demo.tutor1${EDUMATCH_DEMO_EMAIL_DOMAIN}`, name: "Priya Demo", subjects: ["Mathematics", "Physics"], levels: ["K12", "UNDERGRAD"], hourlyRateCents: 4500, verified: true, ratingAvg: 4.8, ratingCount: 21 },
  { email: `demo.tutor2${EDUMATCH_DEMO_EMAIL_DOMAIN}`, name: "Marcus Demo", subjects: ["Chemistry", "Biology"], levels: ["K12"], hourlyRateCents: 3800, verified: true, ratingAvg: 4.5, ratingCount: 9 },
  { email: `demo.tutor3${EDUMATCH_DEMO_EMAIL_DOMAIN}`, name: "Sofia Demo", subjects: ["Computer Science"], levels: ["UNDERGRAD", "GRAD"], hourlyRateCents: 5200, verified: false, ratingAvg: 0, ratingCount: 0 },
];

/** Fixed ids for the single booking chain. The deletion allowlist. */
export const EDUMATCH_CHAIN_IDS = {
  inquiry: "seed-inquiry-1",
  aiResponse: "seed-ai-response-1",
  quoteRequest: "seed-quote-request-1",
  transaction: "seed-transaction-1",
  notification: "seed-notification-1",
} as const;

export const EDUMATCH_DEMO_EMAILS = [
  ...EDUMATCH_STUDENTS.map((s) => s.email),
  ...EDUMATCH_TUTORS.map((t) => t.email),
];

export const EDUMATCH_DEFINITIONS = {
  version: EDUMATCH_DEFINITION_VERSION,
  students: EDUMATCH_STUDENTS,
  tutors: EDUMATCH_TUTORS,
  chainIds: EDUMATCH_CHAIN_IDS,
};
