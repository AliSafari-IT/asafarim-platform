import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  Paragraph,
  SectionType,
  TextRun,
  TextWrappingSide,
  TextWrappingType,
  VerticalPositionRelativeFrom,
} from "docx";
import { photoAltText, type PhotoShape } from "../profile/photo";
import { displayUrl, headerLinks, linkText, productLinks } from "../profile/links";
import type { TailoredResumeContent } from "./ai/schema";
import type { SkillCategory } from "../profile/skillCategories";
import { resolveSkillsDisplay, type SkillsDisplay } from "./skillsLayout";
import { formatProfileDate, formatSpan, formatSpokenLanguages, templateLabels } from "./language";

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

/** A clickable link; Word's own "Hyperlink" character style colours it. */
function hyperlink(text: string, url: string): ExternalHyperlink {
  return new ExternalHyperlink({ link: url, children: [new TextRun({ text, style: "Hyperlink", size: 20 })] });
}

function entryHeading(title: string, sub: string | null, dates: string | null): Paragraph {
  const children: TextRun[] = [new TextRun({ text: title, bold: true })];
  if (sub) children.push(new TextRun({ text: `  –  ${sub}` }));
  if (dates) children.push(new TextRun({ text: `   (${dates})`, italics: true }));
  return new Paragraph({ spacing: { before: 120 }, children });
}

/** The optional CV photo's bytes (a sanitized square JPEG) and shape. */
export interface DocxPhoto {
  data: Uint8Array;
  shape: PhotoShape;
}

/** 30 mm, the same as the printed CV (app/resumatch.css). docx sizes
 *  images in pixels at 96 dpi. */
const PHOTO_PX = Math.round((30 / 25.4) * 96);
const EMU_PER_MM = 36000;

/**
 * An image whose picture geometry is an ellipse instead of a rectangle, so
 * Word, LibreOffice and Google Docs clip it to a circle — the same as the
 * preview's `border-radius: 50%`. docx always writes `prst="rect"`; this
 * rewrites that one attribute in the run's own XML tree and nothing else.
 * docx.test.ts checks the output, so a library change that moves this
 * shows up as a failing test (and a square photo), not a broken file.
 */
class EllipseImageRun extends ImageRun {
  override prepForXml(context: Parameters<ImageRun["prepForXml"]>[0]) {
    const xml = super.prepForXml(context);
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        if (key === "a:prstGeom" && Array.isArray(value)) {
          for (const part of value as { _attr?: { prst?: string } }[]) {
            if (part?._attr?.prst === "rect") part._attr.prst = "ellipse";
          }
        } else {
          visit(value);
        }
      }
    };
    visit(xml);
    return xml;
  }
}

function photoRun(photo: DocxPhoto, alt: string): ImageRun {
  const options = {
    type: "jpg" as const,
    data: photo.data,
    transformation: { width: PHOTO_PX, height: PHOTO_PX },
    altText: { name: alt, description: alt, title: alt },
    // Floats at the top-left of the text column with the name, headline and
    // contact lines wrapping beside it, like the printed header. Floating
    // keeps it out of the text flow, so it never adds a page.
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, offset: 0 },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 },
      wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.RIGHT },
      margins: { right: 6 * EMU_PER_MM, bottom: 2 * EMU_PER_MM },
    },
  };
  return photo.shape === "circle" ? new EllipseImageRun(options) : new ImageRun(options);
}

/** `language`: the CV's stored outputLanguage (#641); null keeps the
 *  English labels and raw dates older CVs have always exported with.
 *  `photo`: the candidate's CV photo when this CV shows it — never part of
 *  `content`.
 *  `skills`: the skills layout, resolved from the CV's stored choice the
 *  same way the preview resolves it (lib/tailoring/skillsLayout.ts).
 *  Omitted, the automatic layout is used. */
export function buildTailoredResumeDocx(
  content: TailoredResumeContent,
  language: string | null = null,
  photo: DocxPhoto | null = null,
  skills?: SkillsDisplay | null,
): Document {
  const labels = templateLabels(language);
  // Paragraphs go into the current section. The compact skills layout is
  // its own continuous three-column section (Word and LibreOffice balance
  // the columns at its end), so the rest of the CV stays one column and the
  // text stays a plain, ATS-readable flow — no table.
  const sections: { children: Paragraph[]; columns?: number }[] = [{ children: [] }];
  let children = sections[0]!.children;
  const skillsDisplay =
    skills === undefined ? resolveSkillsDisplay({ skills: content.skills, layout: null, paragraph: null }) : skills;

  const photoImage = photo ? photoRun(photo, photoAltText(content.fullName, labels)) : null;
  if (content.fullName || photoImage) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.LEFT,
        children: [
          ...(photoImage ? [photoImage] : []),
          ...(content.fullName ? [new TextRun({ text: content.fullName, bold: true })] : []),
        ],
      }),
    );
  }
  if (content.headline) {
    children.push(new Paragraph({ children: [new TextRun({ text: content.headline, italics: true })] }));
  }
  const contact = [content.email, content.phone, content.location].filter(Boolean).join("  ·  ");
  const profileLinks = headerLinks(content.links);
  if (contact) {
    children.push(
      new Paragraph({
        spacing: { after: profileLinks.length > 0 ? 0 : 120 },
        children: [new TextRun({ text: contact, size: 20 })],
      }),
    );
  }
  if (profileLinks.length > 0) {
    const runs: (TextRun | ExternalHyperlink)[] = [];
    profileLinks.forEach((link, index) => {
      if (index > 0) runs.push(new TextRun({ text: "  ·  ", size: 20 }));
      runs.push(hyperlink(linkText(link), link.url));
    });
    children.push(new Paragraph({ spacing: { after: 120 }, children: runs }));
  }

  if (content.summary) {
    children.push(heading(labels.summary));
    children.push(new Paragraph({ children: [new TextRun({ text: content.summary })] }));
  }

  if (skillsDisplay) {
    children.push(heading(labels.skills));
    if (skillsDisplay.layout === "paragraph") {
      children.push(new Paragraph({ children: [new TextRun({ text: skillsDisplay.paragraph })] }));
    } else if (skillsDisplay.layout === "columns") {
      const columnSection = { children: [] as Paragraph[], columns: 3 };
      for (const skill of skillsDisplay.skills) {
        columnSection.children.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: `▪  ${skill}` })] }));
      }
      sections.push(columnSection, { children: [] });
      children = sections.at(-1)!.children;
    } else {
      for (const { category, skills: names } of skillsDisplay.groups) {
        const runs = category
          ? [
              new TextRun({ text: `${labels.skillCategories[category as SkillCategory]}: `, bold: true }),
              new TextRun({ text: names.join(", ") }),
            ]
          : [new TextRun({ text: names.join(", ") })];
        children.push(new Paragraph({ spacing: { after: 60 }, children: runs }));
      }
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

  const products = productLinks(content.links);
  if (products.length > 0) {
    children.push(heading(labels.products));
    for (const link of products) {
      const runs: (TextRun | ExternalHyperlink)[] = [];
      if (link.label) runs.push(new TextRun({ text: `${link.label} — `, bold: true }));
      runs.push(hyperlink(displayUrl(link.url), link.url));
      children.push(new Paragraph({ bullet: { level: 0 }, children: runs }));
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

  if (content.languages.length > 0) {
    children.push(heading(labels.languages));
    children.push(new Paragraph({ children: [new TextRun({ text: formatSpokenLanguages(content.languages, language, "  ·  ") })] }));
  }

  return new Document({
    sections: sections
      .filter((section, index) => index === 0 || section.children.length > 0)
      .map((section, index) => ({
        // The first section starts the document; every later one continues
        // on the same page.
        properties: {
          ...(index > 0 ? { type: SectionType.CONTINUOUS } : {}),
          ...(section.columns ? { column: { count: section.columns, space: 340, equalWidth: true } } : {}),
        },
        children: section.children,
      })),
  });
}

export function renderTailoredResumeDocx(
  content: TailoredResumeContent,
  language: string | null = null,
  photo: DocxPhoto | null = null,
  skills?: SkillsDisplay | null,
): Promise<Buffer> {
  return Packer.toBuffer(buildTailoredResumeDocx(content, language, photo, skills));
}
