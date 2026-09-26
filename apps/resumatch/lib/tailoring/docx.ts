import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { TailoredResumeContent } from "./ai/schema";
import { groupSkillsByCategory, type SkillCategory } from "../profile/skillCategories";
import { formatProfileDate, formatSpan, templateLabels } from "./language";

/**
 * DOCX export (issue #435). Renders the same single-column, ATS-safe
 * structure the `@media print` stylesheet enforces (components/tailoring/
 * templates/Classic.tsx), from the same `TailoredResumeContent` object, so
 * the two exports can never diverge. Pure serializer — no headless browser,
 * no second content/template system: `templateKey` still only selects a
 * print layout.
 */

function heading(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text, bold: true })] });
}

function entryHeading(title: string, sub: string | null, dates: string | null): Paragraph {
  const children: TextRun[] = [new TextRun({ text: title, bold: true })];
  if (sub) children.push(new TextRun({ text: `  –  ${sub}` }));
  if (dates) children.push(new TextRun({ text: `   (${dates})`, italics: true }));
  return new Paragraph({ spacing: { before: 120 }, children });
}

/** `language`: the CV's stored outputLanguage (#641); null keeps the
 *  English labels and raw dates older CVs have always exported with. */
export function buildTailoredResumeDocx(content: TailoredResumeContent, language: string | null = null): Document {
  const labels = templateLabels(language);
  const children: Paragraph[] = [];

  if (content.fullName) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: content.fullName, bold: true })],
      }),
    );
  }
  if (content.headline) {
    children.push(new Paragraph({ children: [new TextRun({ text: content.headline, italics: true })] }));
  }
  const contact = [content.email, content.phone].filter(Boolean).join("  ·  ");
  if (contact) {
    children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: contact, size: 20 })] }));
  }

  if (content.summary) {
    children.push(heading(labels.summary));
    children.push(new Paragraph({ children: [new TextRun({ text: content.summary })] }));
  }

  if (content.skills.length > 0) {
    children.push(heading(labels.skills));
    for (const { category, skills } of groupSkillsByCategory(content.skills, undefined, {
      collapseUnrecognized: true,
    })) {
      const runs = category
        ? [
            new TextRun({ text: `${labels.skillCategories[category as SkillCategory]}: `, bold: true }),
            new TextRun({ text: skills.join(", ") }),
          ]
        : [new TextRun({ text: skills.join(", ") })];
      children.push(new Paragraph({ spacing: { after: 60 }, children: runs }));
    }
  }

  if (content.experience.length > 0) {
    children.push(heading(labels.experience));
    for (const entry of content.experience) {
      const span = formatSpan(entry.startedOn, entry.endedOn, entry.isCurrent, language);
      children.push(entryHeading(entry.title, entry.employer, span));
      for (const bullet of entry.bullets) {
        children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: bullet })] }));
      }
    }
  }

  if (content.education.length > 0) {
    children.push(heading(labels.education));
    for (const entry of content.education) {
      children.push(entryHeading(entry.qualification, entry.institution, formatProfileDate(entry.completedOn, language)));
    }
  }

  if (content.certifications.length > 0) {
    children.push(heading(labels.certifications));
    for (const entry of content.certifications) {
      children.push(entryHeading(entry.name, entry.issuer, null));
    }
  }

  return new Document({ sections: [{ children }] });
}

export function renderTailoredResumeDocx(content: TailoredResumeContent, language: string | null = null): Promise<Buffer> {
  return Packer.toBuffer(buildTailoredResumeDocx(content, language));
}
