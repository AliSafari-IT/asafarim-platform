import { prisma } from "@asafarim/db";
import type { Attachment, InquiryIntake } from "./validation";
import { isKeyOwnedBy, objectExists } from "./storage";

/**
 * Persist a new EduInquiry for the given student. Validates that every
 * attachment key was actually issued to this student and (when storage is
 * configured) that the underlying object exists. Returns the created row.
 */
export async function createInquiry(
  studentId: string,
  intake: InquiryIntake,
): Promise<{ id: string; status: string }> {
  // Ownership check — refuse keys minted for other users.
  const stolen = intake.attachments.find((a) => !isKeyOwnedBy(a.key, studentId));
  if (stolen) {
    throw new InquiryValidationError(`Attachment key not owned by user: ${stolen.key}`);
  }

  // Existence check — skipped automatically in local-dev stub mode.
  const missing: Attachment[] = [];
  for (const att of intake.attachments) {
    const exists = await objectExists(att.key);
    if (!exists) missing.push(att);
  }
  if (missing.length > 0) {
    throw new InquiryValidationError(
      `Attachment object(s) not found in storage: ${missing.map((m) => m.key).join(", ")}`,
    );
  }

  const row = await prisma.eduInquiry.create({
    data: {
      studentId,
      subject: intake.subject,
      gradeLevel: intake.gradeLevel,
      description: intake.description,
      attachments: intake.attachments as unknown as object,
      status: "NEW",
    },
    select: { id: true, status: true },
  });

  return row;
}

export async function listInquiriesForStudent(studentId: string, limit = 50) {
  return prisma.eduInquiry.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      subject: true,
      gradeLevel: true,
      description: true,
      attachments: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export class InquiryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InquiryValidationError";
  }
}
