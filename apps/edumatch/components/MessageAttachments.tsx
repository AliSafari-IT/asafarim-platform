"use client";

export type AttachmentView = {
  url: string;
  mime: string;
  filename: string;
  sizeBytes: number;
};

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileLabel(mime: string): string {
  if (mime.startsWith("audio/")) return "Audio";
  if (mime.startsWith("video/")) return "Video";
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("word") || mime.includes("document")) return "Doc";
  if (mime.includes("sheet") || mime.includes("excel")) return "Sheet";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "Slides";
  if (mime.startsWith("text/")) return "Text";
  return "File";
}

export default function MessageAttachments({
  attachments,
}: {
  attachments: AttachmentView[];
}) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {attachments.map((a, i) =>
        a.mime.startsWith("image/") ? (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            title={a.filename}
            className="block"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.url}
              alt={a.filename}
              className="max-h-52 max-w-[16rem] rounded-lg border border-black/10 object-cover hover:opacity-90"
            />
          </a>
        ) : (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white/60 px-2.5 py-1.5 text-xs text-current hover:bg-white/90 dark:bg-black/20"
          >
            <span aria-hidden className="font-semibold">
              {fileLabel(a.mime)}
            </span>
            <span className="max-w-[12rem] truncate font-medium">{a.filename}</span>
            <span className="opacity-70">{humanSize(a.sizeBytes)}</span>
          </a>
        ),
      )}
    </div>
  );
}
