import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import type { CoverLetterContent } from "./ai/coverLetter/schema";
import { DOCUMENT_LOCALES, isOutputLanguage } from "./language";
import { letterDensity, letterWordCount, type LetterDensity, type LetterLayout } from "./coverLetterLayout";

/**
 * DOCX export for a cover letter (issue #457, part of #453). Renders the
 * exact same `CoverLetterContent` the print/preview page shows, and the
 * same business-letter frame (`buildLetterLayout` in coverLetterLayout.ts):
 * sender block, recipient block, place and date, a bold subject line, then
 * greeting, one paragraph per element of `paragraphs`, sign-off and the
 * candidate's name.
 *
 * One page: margins and type size step down with the word count using the
 * same `letterDensity` thresholds as the print stylesheet, sized so a
 * standard letter fits one A4 or US Letter page in Word and LibreOffice
 * (checked in coverLetterDocx.test.ts / by converting to PDF).
 */

const MM = 56.7; // twips per millimetre

const SIZES: Record<LetterDensity, { font: number; after: number; line: number; marginX: number; marginY: number }> = {
  // font in half-points; spacing in twips; line in 240ths of a line.
  regular: { font: 22, after: 140, line: 252, marginX: 22 * MM, marginY: 17 * MM },
  compact: { font: 21, after: 120, line: 245, marginX: 20 * MM, marginY: 14 * MM },
  tight: { font: 20, after: 100, line: 240, marginX: 18 * MM, marginY: 12 * MM },
};

export function buildCoverLetterDocx(
  content: CoverLetterContent,
  language: string | null = null,
  layout: LetterLayout | null = null,
): Document {
  const size = SIZES[letterDensity(letterWordCount(content))];
  const line = (text: string, options: { bold?: boolean; after?: number; before?: number; right?: boolean; muted?: boolean } = {}) =>
    new Paragraph({
      alignment: options.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { after: options.after ?? 0, before: options.before ?? 0, line: size.line },
      children: [new TextRun({ text, bold: options.bold, color: options.muted ? "4B5563" : undefined })],
    });

  const children: Paragraph[] = [];

  if (layout) {
    const sender = [
      ...(layout.sender.name ? [{ text: layout.sender.name, bold: true, muted: false }] : []),
      ...layout.sender.lines.map((text) => ({ text, bold: false, muted: true })),
    ];
    sender.forEach((entry, index) =>
      children.push(line(entry.text, { ...entry, after: index === sender.length - 1 ? size.after * 2 : 0 })),
    );

    layout.recipient.forEach((text, index) =>
      children.push(line(text, { after: index === layout.recipient.length - 1 ? size.after * 2 : 0 })),
    );
    children.push(line(layout.dateLine, { right: true, after: size.after * 2 }));
    if (layout.subject) children.push(line(layout.subject, { bold: true, after: size.after * 2 }));
  }

  children.push(line(content.greeting, { after: size.after }));
  for (const paragraph of content.paragraphs) {
    children.push(line(paragraph, { after: size.after }));
  }
  children.push(line(content.signOff, { before: size.after }));
  if (content.fullName) children.push(line(content.fullName));

  const run = {
    font: "Calibri",
    size: size.font,
    ...(isOutputLanguage(language) ? { language: { value: DOCUMENT_LOCALES[language] } } : {}),
  };
  return new Document({
    creator: content.fullName ?? undefined,
    title: layout?.subject ?? undefined,
    styles: { default: { document: { run } } },
    sections: [
      {
        properties: {
          page: {
            // A4; the margins leave enough slack that the same letter also
            // fits a US Letter page if Word repaginates it.
            size: { width: 11906, height: 16838 },
            margin: { top: size.marginY, bottom: size.marginY, left: size.marginX, right: size.marginX },
          },
        },
        children,
      },
    ],
  });
}

export function renderCoverLetterDocx(
  content: CoverLetterContent,
  language: string | null = null,
  layout: LetterLayout | null = null,
): Promise<Buffer> {
  return Packer.toBuffer(buildCoverLetterDocx(content, language, layout));
}
