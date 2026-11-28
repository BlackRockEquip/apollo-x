import { z } from "zod";
import type { Prisma, TrainingLesson, TrainingQuestion } from "@prisma/client";
import type { DraftLesson, DraftQuestion } from "@/lib/training/model";
import { estimateMinutes } from "@/lib/training/model";

// Shared shapes for course content (draft save, imports, copies), kept apart from the services so both can use them.

export const lessonInput = z.object({
  stableKey: z.string().trim().min(1).max(80),
  chapterKey: z.string().trim().min(1).max(80),
  chapterTitle: z.string().trim().max(200).default("Chapter"),
  topicTitle: z.string().trim().max(200).optional().default(""),
  title: z.string().trim().max(200),
  format: z.enum(["TEXT", "TEXT_IMAGES", "PDF", "VIDEO"]).default("TEXT"),
  objective: z.string().max(4000).optional().default(""),
  pages: z.array(z.string().max(30000)).max(80).default([""]),
  pageImages: z.array(z.string().max(40)).max(80).optional().default([]),
  pdfAssetId: z.string().max(40).nullable().optional().default(null),
  videoUrl: z.string().trim().max(500).nullable().optional().default(null),
  safetyPoint: z.string().max(2000).optional().default(""),
  practicalTask: z.string().max(2000).optional().default(""),
  estMinutes: z.number().int().min(1).max(600).optional(),
});

export const questionInput = z.object({
  stableKey: z.string().trim().min(1).max(80),
  scope: z.enum(["FINAL", "CHECK"]).default("FINAL"),
  chapterKey: z.string().max(80).optional().default(""),
  lessonKey: z.string().max(80).optional().default(""),
  prompt: z.string().trim().max(2000),
  options: z.array(z.string().trim().max(500)).min(2).max(8),
  answer: z.array(z.number().int().min(0).max(7)).min(1).max(8),
  explanation: z.string().max(2000).optional().default(""),
});

export const contentInput = z.object({
  lessons: z.array(lessonInput).max(800),
  questions: z.array(questionInput).max(600).optional().default([]),
});

export function videoUrlOk(url: string | null | undefined): boolean {
  if (!url) return true;
  try { const u = new URL(url); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
}

export function cleanLesson(l: z.infer<typeof lessonInput>): DraftLesson {
  const pages = l.pages.length ? l.pages : [""];
  const pageImages = pages.map((_, i) => l.pageImages[i] ?? "");
  return {
    stableKey: l.stableKey, chapterKey: l.chapterKey, chapterTitle: l.chapterTitle || "Chapter", topicTitle: l.topicTitle ?? "", title: l.title || "Untitled lesson",
    format: l.format, objective: l.objective ?? "", pages, pageImages, pdfAssetId: l.pdfAssetId || null, videoUrl: l.videoUrl || null,
    safetyPoint: l.safetyPoint ?? "", practicalTask: l.practicalTask ?? "", estMinutes: l.estMinutes ?? estimateMinutes(pages),
  };
}

export function lessonRows(companyId: string, revisionId: string, lessons: DraftLesson[]): Prisma.TrainingLessonCreateManyInput[] {
  const chapterOrder = new Map<string, number>();
  return lessons.map((l, i) => {
    if (!chapterOrder.has(l.chapterKey)) chapterOrder.set(l.chapterKey, chapterOrder.size);
    return {
      companyId, revisionId, stableKey: l.stableKey, chapterKey: l.chapterKey, chapterTitle: l.chapterTitle, chapterOrder: chapterOrder.get(l.chapterKey)!, topicTitle: l.topicTitle,
      ordinal: i, title: l.title, format: l.format, objective: l.objective, pages: l.pages, pageImages: l.pageImages, pdfAssetId: l.pdfAssetId, videoUrl: l.videoUrl,
      safetyPoint: l.safetyPoint, practicalTask: l.practicalTask, estMinutes: l.estMinutes,
    };
  });
}

export function questionRows(companyId: string, revisionId: string, questions: DraftQuestion[]): Prisma.TrainingQuestionCreateManyInput[] {
  return questions.map((q, i) => ({ companyId, revisionId, stableKey: q.stableKey, scope: q.scope, chapterKey: q.chapterKey, lessonKey: q.lessonKey, prompt: q.prompt, options: q.options, answer: q.answer, explanation: q.explanation, ordinal: i }));
}

export function toDraftLesson(l: TrainingLesson): DraftLesson {
  return {
    stableKey: l.stableKey, chapterKey: l.chapterKey, chapterTitle: l.chapterTitle, topicTitle: l.topicTitle, title: l.title, format: l.format, objective: l.objective,
    pages: l.pages, pageImages: l.pages.map((_, i) => l.pageImages[i] ?? ""), pdfAssetId: l.pdfAssetId, videoUrl: l.videoUrl, safetyPoint: l.safetyPoint, practicalTask: l.practicalTask, estMinutes: l.estMinutes,
  };
}

export function toDraftQuestion(q: TrainingQuestion): DraftQuestion {
  return { stableKey: q.stableKey, scope: q.scope, chapterKey: q.chapterKey, lessonKey: q.lessonKey, prompt: q.prompt, options: q.options, answer: q.answer, explanation: q.explanation };
}

export const lessonOrder = [{ chapterOrder: "asc" as const }, { ordinal: "asc" as const }];
