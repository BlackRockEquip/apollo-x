import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { TrainingError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import { requireTraining } from "@/lib/training/access";
import { importPrototype, prototypeOutline } from "@/lib/training/courses";
import { htmlToSections, isPrototypeCourse, lessonsFromSections, sectionsFromPlainText, wordCount, type PrototypeCourse, type PrototypeImagePack } from "@/lib/training/model";

// ---------------------------------------------------------------------------
// Adding training material (2026-11-28): Word, PDF and text files are turned into chapters and lessons for a preview; nothing is
// saved until the course is created. The Cat Basics courses from the Service Tech Training prototype ship with the app
// (training-seed/cat-basics) and can be imported in one click.
// ---------------------------------------------------------------------------

const MAX_DOC_BYTES = 25_000_000;
const SEED_DIR = path.join(process.cwd(), "training-seed", "cat-basics");

const docInput = z.object({ fileName: z.string().trim().min(1).max(200), dataBase64: z.string().min(1) });

export async function previewDocument(ctx: RequestContext, raw: unknown) {
  requireTraining(ctx, "TRAINING_CONTENT_EDIT", "WRITE");
  const input = docInput.parse(raw);
  const bytes = Buffer.from(input.dataBase64, "base64");
  if (bytes.length > MAX_DOC_BYTES) throw new TrainingError("FILE_TOO_BIG", "That file is larger than 25 MB.");
  const name = input.fileName.toLowerCase();
  const title = input.fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  let sections: Array<{ level: number; title: string; body: string }>;
  let images = 0;
  let pdfPages = 0;
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ buffer: bytes });
    images = (result.value.match(/<img\b/gi) ?? []).length;
    sections = htmlToSections(result.value);
  } else if (name.endsWith(".pdf")) {
    // @ts-expect-error — the lib entry has no type declarations of its own (see rfq/quote-extraction.ts for why this entry is used)
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as typeof import("pdf-parse");
    let text = "";
    try {
      const result = await pdfParse(bytes);
      pdfPages = result.numpages ?? 0;
      text = result.text || "";
    } catch {
      throw new TrainingError("PDF_UNREADABLE", "The text of this PDF could not be read. Use \"Write in Flo X\" and attach the PDF as a Document lesson instead.");
    }
    sections = sectionsFromPlainText(text);
  } else if (name.endsWith(".txt") || name.endsWith(".md")) {
    const text = bytes.toString("utf8");
    sections = name.endsWith(".md") ? markdownSections(text) : sectionsFromPlainText(text);
  } else {
    throw new TrainingError("FILE_TYPE", "Add a Word (.docx), PDF, text (.txt) or Markdown (.md) file.");
  }
  const { lessons, warnings } = lessonsFromSections(sections, title);
  if (images) warnings.unshift({ lesson: "Whole document", message: `${images} picture${images === 1 ? " was" : "s were"} not imported. Add ${images === 1 ? "it" : "them"} to the lessons in the editor (Image button).` });
  if (name.endsWith(".pdf") && !lessons.some((l) => l.pages.some((p) => wordCount(p) > 5))) warnings.unshift({ lesson: "Whole document", message: "No text could be read from this PDF (it may be scanned pictures). Attach it as a PDF lesson instead." });
  const tables = lessons.reduce((n, l) => n + l.pages.reduce((m, p) => m + (p.match(/^\|.*\|\s*$/gm) ? 1 : 0), 0), 0);
  const chapters = [...new Set(lessons.map((l) => l.chapterKey))].length;
  return { title, lessons, warnings, stats: { chapters, lessons: lessons.length, tables, images, pdfPages, words: lessons.reduce((n, l) => n + l.pages.reduce((m, p) => m + wordCount(p), 0), 0) } };
}

function markdownSections(text: string) {
  const out: Array<{ level: number; title: string; body: string }> = [{ level: 0, title: "", body: "" }];
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h && h[1].length <= 2) { out.push({ level: h[1].length, title: h[2].trim(), body: "" }); continue; }
    out[out.length - 1].body += `${line}\n`;
  }
  return out.map((s) => ({ ...s, body: s.body.trim() })).filter((s, i) => i > 0 || s.body);
}

// ---------------------------------------------------------------------------
// Cat Basics bundle
// ---------------------------------------------------------------------------

async function readSeedJson<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path.join(SEED_DIR, file), "utf8")) as T; } catch { return null; }
}

async function readSeedCover(id: string): Promise<string | null> {
  try { return `data:image/jpeg;base64,${(await readFile(path.join(SEED_DIR, "covers", `${id}.jpg`))).toString("base64")}`; } catch { return null; }
}

export async function catBundleStatus(ctx: RequestContext) {
  const companyId = requireTraining(ctx, "TRAINING_CONTENT_EDIT");
  const courses = (await readSeedJson<PrototypeCourse[]>("courses.json")) ?? [];
  const imported = await prisma.trainingCourse.findMany({ where: { companyId, importKey: { startsWith: "cat-basics:" } }, select: { importKey: true, id: true, title: true } });
  const items = [];
  for (const c of courses.filter(isPrototypeCourse)) {
    const hasImages = !!(await readSeedJson<PrototypeImagePack>(`img/${c.id}.json`));
    const done = imported.find((i) => i.importKey === `cat-basics:${c.id}`);
    items.push({ ...prototypeOutline(c), hasImages, importedCourseId: done?.id ?? null });
  }
  return { available: items.length > 0, items };
}

/** Import the Cat Basics courses not imported yet, published (they still need a final quiz before certificates can be requested). */
export async function importCatBundle(ctx: RequestContext, raw: unknown) {
  requireTraining(ctx, "TRAINING_CONTENT_EDIT", "WRITE");
  const ids = z.object({ ids: z.array(z.string()).max(20).optional() }).parse(raw ?? {}).ids;
  const status = await catBundleStatus(ctx);
  const courses = (await readSeedJson<PrototypeCourse[]>("courses.json")) ?? [];
  const results = [];
  for (const item of status.items) {
    if (item.importedCourseId || (ids && !ids.includes(item.id))) continue;
    const course = courses.find((c) => c.id === item.id)!;
    const images = await readSeedJson<PrototypeImagePack>(`img/${item.id}.json`);
    // The code is the prototype's course id (HYD-3...); if a course already uses it, the next free variant is taken.
    let code = item.id.toUpperCase();
    for (let n = 2; await prisma.trainingCourse.findFirst({ where: { companyId: ctx.companyId!, code: { equals: code, mode: "insensitive" } }, select: { id: true } }); n++) code = `${item.id.toUpperCase()}-${n}`;
    results.push(await importPrototype(ctx, { course, images, cover: await readSeedCover(item.id), code, publish: true }, `cat-basics:${item.id}`));
  }
  return { imported: results };
}
