import { ConflictError, ForbiddenError } from "../errors";

export class AttachmentTooLargeError extends ConflictError {
  constructor(maxBytes: number) {
    super(`Attachment exceeds the maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))}MB for this file type.`);
    this.name = "AttachmentTooLargeError";
  }
}

export class UnsupportedAttachmentTypeError extends ConflictError {
  constructor(mimeType: string) {
    super(`"${mimeType}" is not an accepted attachment type.`);
    this.name = "UnsupportedAttachmentTypeError";
  }
}

/** The uploaded bytes' actual length, or their sniffed content, disagree with what was declared at init. */
export class AttachmentMismatchError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentMismatchError";
  }
}

export class AttachmentAccessDeniedError extends ForbiddenError {
  constructor() {
    super("Not authorized to access this attachment.");
    this.name = "AttachmentAccessDeniedError";
  }
}

/** The scan adapter flagged the content, or (production only) no real scanner is configured at all — fail closed rather than serve unscanned content. */
export class AttachmentScanFailedError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentScanFailedError";
  }
}

export class AttachmentAlreadyClaimedError extends ConflictError {
  constructor(attachmentId: string) {
    super(`Attachment ${attachmentId} is already attached to another message.`);
    this.name = "AttachmentAlreadyClaimedError";
  }
}

export class AttachmentNotReadyError extends ConflictError {
  constructor(attachmentId: string, status: string) {
    super(`Attachment ${attachmentId} is not ready to attach (status: ${status}).`);
    this.name = "AttachmentNotReadyError";
  }
}

export class TooManyAttachmentsError extends ConflictError {
  constructor(max: number) {
    super(`A message may reference at most ${max} attachments.`);
    this.name = "TooManyAttachmentsError";
  }
}
