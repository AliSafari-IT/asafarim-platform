// Client-safe shapes for the contact inbox (dates serialized to ISO strings).

export interface InboxAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface InboxMessage {
  id: string;
  subject: string | null;
  bodyHtml: string;
  bodyText: string | null;
  status: string;
  emailSent: boolean;
  createdAt: string;
  attachments: InboxAttachment[];
}
