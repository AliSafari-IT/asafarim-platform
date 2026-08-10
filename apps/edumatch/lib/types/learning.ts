/**
 * Client-side mirrors of the learning-brief API payloads.
 *
 * Dates arrive as ISO strings over the wire, which is why these are not just
 * re-exports of the server types — a shared type that claims `Date` for a
 * value that is really a string is worse than no shared type at all.
 */

export type BriefFieldsView = {
  subject?: string;
  topic?: string;
  educationalLevel?: string;
  schoolYear?: string;
  learningObjective?: string;
  currentUnderstanding?: string;
  difficulties?: string[];
  prerequisiteGaps?: string[];
  language?: string;
  mode?: "ONLINE" | "IN_PERSON" | "EITHER";
  locationCity?: string;
  availability?: Array<{ day: string; from: string; to: string }>;
  deadlineAt?: string;
  deadlineKind?: "EXAM" | "ASSIGNMENT" | "NONE";
  accessibilityNeeds?: string;
  estimatedSessions?: number;
  sessionMinutes?: number;
};

export type BriefView = {
  id: string;
  status: "DRAFT" | "CONFIRMED" | "MATCHED" | "ARCHIVED";
  fields: BriefFieldsView;
  attachments: Array<{ key: string; filename: string; mime: string; sizeBytes: number }>;
  completeness: number;
  triageOutcome: "SELF_STUDY" | "TUTOR_RECOMMENDED" | "NEEDS_DIAGNOSTIC" | null;
  triageRationale: string | null;
  blockers: string[];
  readyForReview: boolean;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BriefTurn = {
  id: string;
  role: "STUDENT" | "ASSISTANT";
  kind: "MESSAGE" | "QUESTION" | "HELP" | "SUMMARY";
  content: string;
  field: string | null;
  createdAt: string;
};

export type IntakeQuestion = {
  field: string;
  questionKey: string;
  text: string;
};

export type TutorCandidateView = {
  tutorId: string;
  name: string | null;
  image: string | null;
  bio: string | null;
  subjectsTaught: string[];
  levelsTaught: string[];
  languagesTaught: string[];
  qualifications: string[];
  teachingStyle: string | null;
  hourlyRateCents: number;
  ratingAvg: number;
  ratingCount: number;
  verifiedAt: string | null;
  distanceKm: number | null;
  score: number;
  reasons: string[];
  rotationBoost: boolean;
};

export type PlanStepView = {
  session: number;
  focus: string;
  outcome: string;
};

export type ProposalComparisonView = {
  quoteId: string;
  tutorId: string;
  tutorName: string | null;
  tutorImage: string | null;
  verified: boolean;
  qualifications: string[];
  subjectsTaught: string[];
  levelsTaught: string[];
  teachingStyle: string | null;
  languagesTaught: string[];
  ratingAvg: number;
  ratingCount: number;
  hourlyRateCents: number;
  totalCents: number;
  sessionCount: number | null;
  sessionMinutes: number | null;
  mode: string | null;
  language: string | null;
  earliestStartAt: string | null;
  planOutline: PlanStepView[];
  cancellationPolicy: string | null;
  notes: string | null;
  status: string;
  sentAt: string | null;
  matchReasons: string[];
  matchScore: number | null;
  rotationBoost: boolean;
};

export type JourneySessionView = {
  bookingId: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  tutorId: string;
  tutorName: string | null;
  subject: string | null;
  topicsCovered: string[];
  studentSummary: string | null;
  homework: string | null;
  nextStep: string | null;
  resources: Array<{ label: string; url: string }>;
  goalProgress: number | null;
  openConcerns: string[];
  attendance: string | null;
  reviewed: boolean;
  reviewable: boolean;
};

export type JourneyInsightsView = {
  recurringTopics: Array<{ topic: string; sessions: number }>;
  openConcerns: string[];
  progressTrend: Array<{ at: string; progress: number }>;
  completedSessions: number;
  upcomingSessions: number;
  approachingDeadlines: Array<{
    briefId: string;
    subject: string;
    deadlineAt: string;
  }>;
};

/** Money is stored in integer cents everywhere; format once, here. */
export function formatEuros(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}
