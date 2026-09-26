import { Document, Packer, Paragraph, TextRun } from "docx";
import type { CoverLetterContent } from "./ai/coverLetter/schema";
import { DOCUMENT_LOCALES, isOutputLanguage } from "./language";

/**
 * DOCX export for a cover letter (issue #457, part of #453). Same pattern
 * as lib/tailoring/docx.ts's CV export: renders the exact same
 * `CoverLetterContent` the print/preview page shows, from the same `docx`
 * package, so the print and DOCX paths can never diverge. A business-
 * letter layout — greeting, one paragraph per element of `paragraphs`
 * (already the right unit: the content was drafted and reviewed as
 * discrete paragraphs), sign-off, and the candidate's own name.
 */

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text })] });
}

/** The letter has no fixed labels of its own — greeting, paragraphs and
 *  sign-off are all the reviewed text — so the language (#642) only sets
 *  the document's proofing language, so Word spell-checks a Dutch letter
 *  in Dutch. Null (older letters, degraded) sets none, as before. */
export function buildCoverLetterDocx(content: CoverLetterContent, language: string | null = null): Document {
  const children: Paragraph[] = [bodyParagraph(content.greeting)];

  for (const paragraph of content.paragraphs) {
    children.push(bodyParagraph(paragraph));
  }

  children.push(new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: content.signOff })] }));
  if (content.fullName) {
    children.push(new Paragraph({ children: [new TextRun({ text: content.fullName })] }));
  }

  const styles = isOutputLanguage(language)
    ? { default: { document: { run: { language: { value: DOCUMENT_LOCALES[language] } } } } }
    : undefined;
  return new Document({ styles, sections: [{ children }] });
}

export function renderCoverLetterDocx(content: CoverLetterContent, language: string | null = null): Promise<Buffer> {
  return Packer.toBuffer(buildCoverLetterDocx(content, language));
}
