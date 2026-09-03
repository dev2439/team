import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import {
  closeLastJobPeriod,
  formatHourlyRate,
  parseOverview,
  splitJobDescription,
} from "./overview.ts";
import type { ResumeProfile } from "./types.ts";

function textParagraph(text: string) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: "Calibri", size: 22 })],
  });
}

function sectionHeading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 4 },
    },
    children: [new TextRun({ text, bold: true, font: "Calibri", size: 24 })],
  });
}

function subHeading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 160, after: 40 },
    children: [new TextRun({ text, bold: true, font: "Calibri", size: 24 })],
  });
}

function metaLine(text: string) {
  return new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text, font: "Calibri", size: 22 })],
  });
}

function noteLine(text: string) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, italics: true, font: "Calibri", size: 20 })],
  });
}

function bullet(text: string) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: `• ${text}`, font: "Calibri", size: 22 })],
  });
}

export async function buildResumeDocx(profile: ResumeProfile): Promise<Buffer> {
  const { hooks, blocks } = parseOverview(profile.overview);
  const skills = profile.skills.slice(0, 20).filter(Boolean);
  const jobs = profile.employment.slice(0, 3);
  const education = profile.education;
  const title = profile.title || "Professional Profile";
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: "Professional Title", bold: true, font: "Calibri", size: 20 })],
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
      children: [new TextRun({ text: title, bold: true, font: "Calibri", size: 32 })],
    }),
    sectionHeading("Hourly Rate"),
    textParagraph(formatHourlyRate(profile.hourlyRate)),
    sectionHeading("Skills"),
    textParagraph(skills.join(", ")),
    sectionHeading("Languages"),
    textParagraph("English — Fluent"),
    sectionHeading("Overview"),
  );

  for (const hook of hooks) {
    children.push(textParagraph(hook));
  }

  for (const block of blocks) {
    if (block.type === "heading") {
      children.push(subHeading(block.text));
    } else if (block.type === "list") {
      for (const item of block.items) {
        children.push(bullet(item));
      }
    } else {
      children.push(textParagraph(block.text));
    }
  }

  children.push(
    sectionHeading("Employment History"),
    noteLine("Illustrative employment history. Replace with actual history."),
  );

  jobs.forEach((job, jobIndex) => {
    const period =
      jobIndex === jobs.length - 1 ? closeLastJobPeriod(job.period) : job.period;
    const { summary, bullets } = splitJobDescription(job.description);
    children.push(subHeading(job.role || "Role"));
    if (job.company) children.push(metaLine(job.company));
    if (job.location) children.push(metaLine(job.location));
    if (period) children.push(metaLine(period));
    if (summary) children.push(textParagraph(summary));
    for (const item of bullets) {
      children.push(bullet(item));
    }
  });

  children.push(
    sectionHeading("Education"),
    noteLine("Illustrative education. Replace with actual education."),
  );

  for (const entry of education.slice(0, 2)) {
    const educationNote = entry.description
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/illustrative education/i.test(line))
      .join(" ");
    children.push(subHeading(entry.university || "University"));
    if (entry.degree) children.push(metaLine(entry.degree));
    if (entry.period) children.push(metaLine(entry.period));
    if (educationNote) children.push(textParagraph(educationNote));
  }

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(document));
}
