import { z } from "zod";

/**
 * Phase 2.1 file constraints — kept in sync with the project plan §6.2.1.
 * Tighten these here rather than in route handlers so every entry point
 * (presign, ingest, retry) shares the same rules.
 */
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MIN_FILE_BYTES = 1;

export const ALLOWED_MIME_TYPES = [
  // images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  // video (short clips only — full UX clamp is client-side)
  "video/mp4",
  "video/quicktime",
  // audio (voice questions)
  "audio/mp4", // .m4a
  "audio/mpeg", // .mp3
  "audio/wav",
  "audio/webm",
  // text (allow paste-as-file fallback)
  "text/plain",
  "application/pdf",
  // Microsoft Office documents (assignments, worksheets, slide decks)
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
] as const;

export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

/** Reject path traversal and weird unicode early. */
const safeFilename = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\\/:*?"<>|\u0000-\u001f]+$/, "filename contains invalid characters");

export const presignRequestSchema = z.object({
  filename: safeFilename,
  contentType: z.enum(ALLOWED_MIME_TYPES),
  sizeBytes: z.number().int().min(MIN_FILE_BYTES).max(MAX_FILE_BYTES),
});
export type PresignRequest = z.infer<typeof presignRequestSchema>;

/**
 * An attachment as it lives on the EduInquiry row. The `key` is the storage
 * key issued by the presign endpoint — the server re-validates it against
 * the authenticated user before persisting, so clients can't smuggle in keys
 * belonging to someone else.
 */
export const attachmentSchema = z.object({
  key: z.string().min(1).max(512),
  url: z.string().url(),
  mime: z.enum(ALLOWED_MIME_TYPES),
  sizeBytes: z.number().int().min(MIN_FILE_BYTES).max(MAX_FILE_BYTES),
  filename: safeFilename,
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const GRADE_LEVELS = ["K12", "UNDERGRAD", "GRAD"] as const;
export type GradeLevel = (typeof GRADE_LEVELS)[number];

/**
 * Flatten a ZodError into a single human-readable string suitable for a 400
 * response body. zod v3 has no prettifyError, so we roll our own.
 */
export function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export const inquiryIntakeSchema = z.object({
  subject: z.string().trim().min(2).max(80),
  gradeLevel: z.enum(GRADE_LEVELS),
  description: z.string().trim().min(10).max(4000),
  attachments: z.array(attachmentSchema).max(5).default([]),
});
export type InquiryIntake = z.infer<typeof inquiryIntakeSchema>;

/**
 * Student profile input validation. Shared between POST (create) and PATCH
 * (update); PATCH uses `.partial()` so any subset of fields is valid.
 */
export const studentProfileSchema = z.object({
  gradeLevel: z.enum(GRADE_LEVELS),
  subjectsOfInterest: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  homeAddress: z
    .object({
      line1: z.string().trim().max(200).optional(),
      city: z.string().trim().max(100).optional(),
      region: z.string().trim().max(100).optional(),
      postalCode: z.string().trim().max(20).optional(),
      country: z.string().trim().max(100).optional(),
    })
    .optional(),
});
export type StudentProfileInput = z.infer<typeof studentProfileSchema>;
export const studentProfilePatchSchema = studentProfileSchema.partial();
export type StudentProfilePatch = z.infer<typeof studentProfilePatchSchema>;

/**
 * Tutor profile input validation. `hourlyRateCents` is stored as an integer
 * to avoid floating point money issues.
 */
export const tutorProfileSchema = z.object({
  bio: z.string().trim().max(2000).optional(),
  subjectsTaught: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  levelsTaught: z.array(z.enum(GRADE_LEVELS)).max(3).default([]),
  hourlyRateCents: z.number().int().min(0).max(100_000_00).default(0),
  onlineOnly: z.boolean().default(false),
  serviceRadiusKm: z.number().int().min(0).max(500).default(10),
  homeAddress: z
    .object({
      line1: z.string().trim().max(200).optional(),
      city: z.string().trim().max(100).optional(),
      region: z.string().trim().max(100).optional(),
      postalCode: z.string().trim().max(20).optional(),
      country: z.string().trim().max(100).optional(),
    })
    .optional(),
});
export type TutorProfileInput = z.infer<typeof tutorProfileSchema>;
export const tutorProfilePatchSchema = tutorProfileSchema.partial();
export type TutorProfilePatch = z.infer<typeof tutorProfilePatchSchema>;
