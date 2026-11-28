import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { TrainingError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import { notifyAdminsAndManagers, notifyUser } from "@/lib/notifications/service";
import { audit, can, canWrite, checkId, iso, notFound, requireTraining, settingsFor, userNames } from "@/lib/training/access";
import { cleanLesson, contentInput, lessonOrder, lessonRows, questionRows, toDraftLesson, toDraftQuestion, videoUrlOk } from "@/lib/training/content";
import {
  addMonths, chaptersOf, courseCodeOk, diffLessons, lessonsFromPrototype, MIN_FINAL_QUESTIONS, nextRevisionNumber, questionsSignature, revisionLabel,
  type DraftLesson, type DraftQuestion, type PrototypeCourse, type PrototypeImagePack,
} from "@/lib/training/model";

// ---------------------------------------------------------------------------
// Course manager (2026-11-28). Every change, from a typo to a new course, is a draft until a manager or Company Admin publishes it:
//   Draft -> In review -> Published (live) -> earlier revisions kept (Superseded)
// A published course can be archived (and restored), never deleted: it holds training records. Only a course that was never
// published can be deleted. Rolling back republishes an earlier revision as a new one, so nothing is overwritten.
// ---------------------------------------------------------------------------

const MAX_ASSET_BYTES = 12_000_000;
const ASSET_MIMES = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"];

function editor(ctx: RequestContext, intent: "READ" | "WRITE" = "READ") {
  return requireTraining(ctx, "TRAINING_CONTENT_EDIT", intent);
}

async function courseOr404(companyId: string, id: string) {
  checkId(id, "course");
  const c = await prisma.trainingCourse.findFirst({ where: { id, companyId } });
  if (!c) notFound("course");
  return c;
}

async function draftOf(courseId: string) {
  return prisma.trainingRevision.findFirst({ where: { courseId, status: { in: ["DRAFT", "IN_REVIEW"] } }, orderBy: { createdAt: "desc" } });
}

async function revisionContent(revisionId: string): Promise<{ lessons: DraftLesson[]; questions: DraftQuestion[] }> {
  const [lessons, questions] = await Promise.all([
    prisma.trainingLesson.findMany({ where: { revisionId }, orderBy: lessonOrder }),
    prisma.trainingQuestion.findMany({ where: { revisionId }, orderBy: { ordinal: "asc" } }),
  ]);
  return { lessons: lessons.map(toDraftLesson), questions: questions.map(toDraftQuestion) };
}

function formatSummary(lessons: Array<{ format: string; pageImages: string[] }>): string {
  if (!lessons.length) return "Empty";
  const has = (f: string) => lessons.some((l) => l.format === f);
  const images = lessons.some((l) => l.format === "TEXT_IMAGES" || l.pageImages.some(Boolean));
  const parts = ["Text"];
  if (images) parts.push("diagrams");
  if (has("PDF")) parts.push("PDF");
  if (has("VIDEO")) parts.push("video");
  return parts.length === 1 ? "Text only" : parts.join(" + ");
}

// ---------------------------------------------------------------------------
// List and editor data
// ---------------------------------------------------------------------------

export async function listCourses(ctx: RequestContext) {
  const companyId = editor(ctx);
  const courses = await prisma.trainingCourse.findMany({
    where: { companyId },
    orderBy: [{ status: "asc" }, { group: "asc" }, { title: "asc" }],
    select: {
      id: true, code: true, title: true, group: true, status: true, completionMode: true, liveRevisionId: true, updatedAt: true, nextReviewAt: true, ownerUserId: true, docNumber: true, importKey: true, archivedAt: true, coverMime: true,
      revisions: { select: { id: true, major: true, minor: true, status: true, updatedAt: true }, orderBy: { createdAt: "desc" } },
    },
  });
  const liveIds = courses.map((c) => c.liveRevisionId).filter((v): v is string => !!v);
  const draftIds = courses.map((c) => c.revisions.find((r) => r.status === "DRAFT" || r.status === "IN_REVIEW")?.id).filter((v): v is string => !!v);
  const [lessons, finals, learners, owners] = await Promise.all([
    prisma.trainingLesson.findMany({ where: { revisionId: { in: [...liveIds, ...draftIds] } }, select: { revisionId: true, format: true, pageImages: true } }),
    prisma.trainingQuestion.groupBy({ by: ["revisionId"], where: { revisionId: { in: liveIds }, scope: "FINAL" }, _count: true }),
    prisma.trainingEnrolment.groupBy({ by: ["courseId"], where: { companyId, status: { in: ["ASSIGNED", "IN_PROGRESS", "AWAITING_APPROVAL"] } }, _count: true }),
    userNames(courses.map((c) => c.ownerUserId)),
  ]);
  const byRev = new Map<string, Array<{ format: string; pageImages: string[] }>>();
  for (const l of lessons) { const arr = byRev.get(l.revisionId) ?? []; arr.push(l); byRev.set(l.revisionId, arr); }
  const now = new Date();
  return {
    items: courses.map((c) => {
      const live = c.revisions.find((r) => r.id === c.liveRevisionId) ?? null;
      const draft = c.revisions.find((r) => r.status === "DRAFT" || r.status === "IN_REVIEW") ?? null;
      const ls = byRev.get(live?.id ?? draft?.id ?? "") ?? [];
      const finalCount = finals.find((f) => f.revisionId === c.liveRevisionId)?._count ?? 0;
      return {
        id: c.id, code: c.code, title: c.title, group: c.group, status: c.status, completionMode: c.completionMode, docNumber: c.docNumber,
        liveRevision: live ? revisionLabel(live) : null, draftStatus: draft?.status ?? null, draftId: draft?.id ?? null,
        lessons: ls.length, format: formatSummary(ls), learners: learners.find((l) => l.courseId === c.id)?._count ?? 0,
        quizMissing: c.status === "PUBLISHED" && c.completionMode === "QUIZ_CERTIFICATE" && finalCount < MIN_FINAL_QUESTIONS,
        imagesMissing: !!c.importKey && ls.length > 0 && !ls.some((l) => l.pageImages.some(Boolean)),
        reviewDue: c.status === "PUBLISHED" && !!c.nextReviewAt && c.nextReviewAt < addMonths(now, 1), reviewOverdue: c.status === "PUBLISHED" && !!c.nextReviewAt && c.nextReviewAt < now,
        nextReviewAt: iso(c.nextReviewAt), owner: c.ownerUserId ? owners.get(c.ownerUserId) ?? "" : "", updatedAt: iso(c.updatedAt), hasCover: !!c.coverMime, archivedAt: iso(c.archivedAt),
      };
    }),
    canPublish: canWrite(ctx, "TRAINING_CONTENT_EDIT"),
  };
}

export async function courseEditor(ctx: RequestContext, courseId: string) {
  const companyId = editor(ctx);
  const course = await courseOr404(companyId, courseId);
  const revisions = await prisma.trainingRevision.findMany({ where: { courseId }, orderBy: { createdAt: "desc" } });
  const live = revisions.find((r) => r.id === course.liveRevisionId) ?? null;
  const draft = revisions.find((r) => r.status === "DRAFT" || r.status === "IN_REVIEW") ?? null;
  const [liveContent, draftContent, names, assets, members, enrolCounts, certCount, positions] = await Promise.all([
    live ? revisionContent(live.id) : Promise.resolve(null),
    draft ? revisionContent(draft.id) : Promise.resolve(null),
    userNames(revisions.flatMap((r) => [r.createdById, r.submittedById, r.publishedById]).concat([course.ownerUserId, course.archivedById])),
    prisma.trainingAsset.findMany({ where: { courseId }, select: { id: true, name: true, mime: true }, orderBy: { createdAt: "asc" } }),
    prisma.companyMembership.findMany({ where: { companyId, status: "ACTIVE", role: { in: ["COMPANY_ADMIN", "MANAGER"] } }, select: { userId: true, user: { select: { displayName: true } } } }),
    prisma.trainingEnrolment.groupBy({ by: ["status"], where: { courseId }, _count: true }),
    prisma.trainingCertificate.count({ where: { courseId, status: "VALID" } }),
    prisma.trainingPosition.findMany({ where: { companyId, requiredCourseIds: { has: courseId } }, select: { id: true, name: true } }),
  ]);
  const diff = liveContent && draftContent ? diffLessons(liveContent.lessons, draftContent.lessons) : null;
  return {
    course: {
      id: course.id, code: course.code, title: course.title, group: course.group, status: course.status, completionMode: course.completionMode, passMark: course.passMark, maxAttempts: course.maxAttempts,
      ownerUserId: course.ownerUserId, owner: course.ownerUserId ? names.get(course.ownerUserId) ?? "" : "", reviewMonths: course.reviewMonths, nextReviewAt: iso(course.nextReviewAt), docNumber: course.docNumber,
      hasCover: !!course.coverMime, importKey: course.importKey, archivedAt: iso(course.archivedAt), archiveReason: course.archiveReason, archivedBy: course.archivedById ? names.get(course.archivedById) ?? "" : "",
    },
    live: live ? { id: live.id, label: revisionLabel(live), publishedAt: iso(live.publishedAt), ...liveContent! } : null,
    draft: draft ? { id: draft.id, status: draft.status, reviewComment: draft.reviewComment, changeLevel: draft.changeLevel, whatChanged: draft.whatChanged ?? "", submittedBy: draft.submittedById ? names.get(draft.submittedById) ?? "" : "", submittedAt: iso(draft.submittedAt), updatedAt: iso(draft.updatedAt), ...draftContent! } : null,
    diff: diff ? { changes: diff.changes, removed: diff.removed.map((l) => ({ stableKey: l.stableKey, title: l.title })), counts: diff.counts, questionsChanged: questionsSignature(liveContent!.questions) !== questionsSignature(draftContent!.questions) } : null,
    history: revisions.filter((r) => r.status === "PUBLISHED" || r.status === "SUPERSEDED").map((r) => ({ id: r.id, label: revisionLabel(r), status: r.status, changeLevel: r.changeLevel, whatChanged: r.whatChanged ?? "", publishedAt: iso(r.publishedAt), publishedBy: r.publishedById ? names.get(r.publishedById) ?? "" : "", author: r.createdById ? names.get(r.createdById) ?? "" : "" })),
    assets,
    owners: members.map((m) => ({ userId: m.userId, name: m.user.displayName })),
    impact: { inProgress: enrolCounts.filter((g) => ["ASSIGNED", "IN_PROGRESS", "AWAITING_APPROVAL"].includes(g.status)).reduce((n, g) => n + g._count, 0), certified: certCount, positions },
    canPublish: canWrite(ctx, "TRAINING_CONTENT_EDIT"),
  };
}

// ---------------------------------------------------------------------------
// Create, settings, copy
// ---------------------------------------------------------------------------

const settingsInput = z.object({
  title: z.string().trim().min(2, "Give the course a title.").max(160),
  group: z.string().trim().min(1, "Pick or type a group.").max(60),
  docNumber: z.string().trim().max(60).optional().default(""),
  ownerUserId: z.string().trim().nullable().optional(),
  reviewMonths: z.number().int().min(1).max(60).optional().default(12),
  completionMode: z.enum(["QUIZ_CERTIFICATE", "ACKNOWLEDGE"]).optional().default("QUIZ_CERTIFICATE"),
  passMark: z.number().int().min(1).max(100).optional(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
});

const createInput = settingsInput.extend({
  code: z.string().trim(),
  requiredPositionIds: z.array(z.string()).max(100).optional().default([]),
  copyFromCourseId: z.string().optional().nullable(),
  lessons: contentInput.shape.lessons.optional(),
  pdfAttachment: z.object({ name: z.string().max(200), base64: z.string() }).optional().nullable(),
});

async function assertOwner(companyId: string, userId: string | null | undefined) {
  if (!userId) return;
  const m = await prisma.companyMembership.findFirst({ where: { companyId, userId, status: "ACTIVE" } });
  if (!m) throw new TrainingError("OWNER_UNKNOWN", "The course owner must be a user of this company.");
}

async function assertCode(companyId: string, code: string, exceptId?: string) {
  if (!courseCodeOk(code)) throw new TrainingError("CODE_INVALID", "Course code: letters, numbers and dashes only, up to 24 characters (e.g. SAF-2).");
  const clash = await prisma.trainingCourse.findFirst({ where: { companyId, code: { equals: code, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (clash) throw new TrainingError("CODE_TAKEN", `The code ${code} is already used by "${clash.title}".`, 409);
}

function docNumberFor(code: string) {
  return `TRN-${code.toUpperCase()}`;
}

async function storeAsset(companyId: string, courseId: string, name: string, mime: string, data: Buffer, tx: Prisma.TransactionClient = prisma) {
  if (!ASSET_MIMES.includes(mime)) throw new TrainingError("FILE_TYPE", "Only PNG, JPEG, GIF, WebP images and PDF documents can be added.");
  if (data.length > MAX_ASSET_BYTES) throw new TrainingError("FILE_TOO_BIG", "That file is larger than 12 MB.");
  const sha256 = createHash("sha256").update(data).digest("hex");
  const existing = await tx.trainingAsset.findFirst({ where: { courseId, sha256 }, select: { id: true } });
  if (existing) return existing.id;
  const row = await tx.trainingAsset.create({ data: { companyId, courseId, name: name.slice(0, 200), mime, data, sha256 } });
  return row.id;
}

function dataUrlParts(dataUrl: string): { mime: string; data: Buffer } | null {
  const m = /^data:([a-z0-9.+/-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1].toLowerCase(), data: Buffer.from(m[2], "base64") };
}

export async function createCourse(ctx: RequestContext, raw: unknown) {
  const companyId = editor(ctx, "WRITE");
  const input = createInput.parse(raw);
  await assertCode(companyId, input.code);
  await assertOwner(companyId, input.ownerUserId);
  const settings = await settingsFor(companyId);
  let source: { lessons: DraftLesson[]; questions: DraftQuestion[] } = { lessons: [], questions: [] };
  let copyFrom: string | null = null;
  if (input.copyFromCourseId) {
    const from = await courseOr404(companyId, input.copyFromCourseId);
    const rev = from.liveRevisionId ?? (await draftOf(from.id))?.id;
    if (rev) source = await revisionContent(rev);
    copyFrom = from.id;
  } else if (input.lessons?.length) {
    source.lessons = input.lessons.map(cleanLesson);
  }
  const course = await prisma.$transaction(async (tx) => {
    const c = await tx.trainingCourse.create({
      data: {
        companyId, code: input.code, title: input.title, group: input.group, docNumber: input.docNumber || docNumberFor(input.code), status: "DRAFT", completionMode: input.completionMode,
        passMark: input.passMark ?? settings.defaultPassMark, maxAttempts: input.maxAttempts ?? settings.defaultMaxAttempts, ownerUserId: input.ownerUserId || ctx.userId, reviewMonths: input.reviewMonths, createdById: ctx.userId,
      },
    });
    const rev = await tx.trainingRevision.create({ data: { companyId, courseId: c.id, major: 0, minor: 0, status: "DRAFT", createdById: ctx.userId } });
    let lessons = source.lessons;
    if (copyFrom) {
      // Assets belong to a course: copy the ones the lessons use and point the copies at them.
      const used = new Set(lessons.flatMap((l) => [...l.pageImages, l.pdfAssetId ?? ""]).filter(Boolean));
      const assets = await tx.trainingAsset.findMany({ where: { courseId: copyFrom, id: { in: [...used] } } });
      const map = new Map<string, string>();
      for (const a of assets) map.set(a.id, (await tx.trainingAsset.create({ data: { companyId, courseId: c.id, name: a.name, mime: a.mime, data: a.data, sha256: a.sha256 } })).id);
      lessons = lessons.map((l) => ({ ...l, pageImages: l.pageImages.map((id) => (id ? map.get(id) ?? "" : "")), pdfAssetId: l.pdfAssetId ? map.get(l.pdfAssetId) ?? null : null }));
    }
    if (input.pdfAttachment) {
      const data = Buffer.from(input.pdfAttachment.base64, "base64");
      const assetId = await storeAsset(companyId, c.id, input.pdfAttachment.name, "application/pdf", data, tx);
      lessons = [{ stableKey: `l-${c.id.slice(-8)}`, chapterKey: `ch-${c.id.slice(-8)}`, chapterTitle: input.title, topicTitle: "", title: input.pdfAttachment.name.replace(/\.pdf$/i, ""), format: "PDF", objective: "", pages: [""], pageImages: [""], pdfAssetId: assetId, videoUrl: null, safetyPoint: "", practicalTask: "", estMinutes: 15 }, ...lessons];
    }
    if (lessons.length) await tx.trainingLesson.createMany({ data: lessonRows(companyId, rev.id, lessons) });
    if (source.questions.length) await tx.trainingQuestion.createMany({ data: questionRows(companyId, rev.id, source.questions) });
    for (const pid of input.requiredPositionIds) {
      const p = await tx.trainingPosition.findFirst({ where: { id: pid, companyId } });
      if (p && !p.requiredCourseIds.includes(c.id)) await tx.trainingPosition.update({ where: { id: p.id }, data: { requiredCourseIds: [...p.requiredCourseIds, c.id] } });
    }
    return c;
  });
  await audit(ctx, "TrainingCourse", course.id, "TRAINING_COURSE_CREATED", { courseId: course.id, code: course.code, title: course.title, copiedFrom: copyFrom, lessons: source.lessons.length, pdf: !!input.pdfAttachment });
  return { id: course.id };
}

export async function updateCourseSettings(ctx: RequestContext, courseId: string, raw: unknown) {
  const companyId = editor(ctx, "WRITE");
  const course = await courseOr404(companyId, courseId);
  const input = settingsInput.extend({ code: z.string().trim().optional() }).parse(raw);
  if (input.code && input.code !== course.code) {
    if (course.status !== "DRAFT") throw new TrainingError("CODE_LOCKED", "The code of a published course cannot change: certificates carry it.");
    await assertCode(companyId, input.code, courseId);
  }
  await assertOwner(companyId, input.ownerUserId);
  const data = {
    title: input.title, group: input.group, docNumber: input.docNumber || course.docNumber, ownerUserId: input.ownerUserId || null, reviewMonths: input.reviewMonths,
    completionMode: input.completionMode, passMark: input.passMark ?? course.passMark, maxAttempts: input.maxAttempts ?? course.maxAttempts, ...(input.code ? { code: input.code } : {}),
    nextReviewAt: course.status === "PUBLISHED" && input.reviewMonths !== course.reviewMonths ? addMonths(new Date(), input.reviewMonths) : course.nextReviewAt,
  };
  await prisma.trainingCourse.update({ where: { id: courseId }, data });
  const changed = (Object.keys(data) as Array<keyof typeof data>).filter((k) => k !== "nextReviewAt" && String(course[k as keyof typeof course] ?? "") !== String(data[k] ?? ""));
  if (changed.length) await audit(ctx, "TrainingCourse", courseId, "TRAINING_COURSE_SETTINGS_UPDATED", { courseId, changed, title: input.title });
  return { ok: true };
}

export async function setCover(ctx: RequestContext, courseId: string, raw: unknown) {
  const companyId = editor(ctx, "WRITE");
  await courseOr404(companyId, courseId);
  const input = z.object({ dataUrl: z.string().nullable() }).parse(raw);
  if (!input.dataUrl) { await prisma.trainingCourse.update({ where: { id: courseId }, data: { coverData: null, coverMime: null } }); return { ok: true }; }
  const parts = dataUrlParts(input.dataUrl);
  if (!parts || !parts.mime.startsWith("image/") || parts.mime === "image/svg+xml") throw new TrainingError("FILE_TYPE", "The cover must be a PNG, JPEG or WebP image.");
  if (parts.data.length > 3_000_000) throw new TrainingError("FILE_TOO_BIG", "The cover image is larger than 3 MB.");
  await prisma.trainingCourse.update({ where: { id: courseId }, data: { coverData: parts.data, coverMime: parts.mime } });
  await audit(ctx, "TrainingCourse", courseId, "TRAINING_COURSE_COVER_SET", { courseId });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export async function startDraft(ctx: RequestContext, courseId: string) {
  const companyId = editor(ctx, "WRITE");
  const course = await courseOr404(companyId, courseId);
  if (course.status === "ARCHIVED") throw new TrainingError("ARCHIVED", "Restore the course before changing it.");
  const existing = await draftOf(courseId);
  if (existing) return { draftId: existing.id };
  if (!course.liveRevisionId) throw new TrainingError("NO_LIVE", "This course has nothing published to copy.");
  const content = await revisionContent(course.liveRevisionId);
  const rev = await prisma.$transaction(async (tx) => {
    const r = await tx.trainingRevision.create({ data: { companyId, courseId, major: 0, minor: 0, status: "DRAFT", createdById: ctx.userId } });
    if (content.lessons.length) await tx.trainingLesson.createMany({ data: lessonRows(companyId, r.id, content.lessons) });
    if (content.questions.length) await tx.trainingQuestion.createMany({ data: questionRows(companyId, r.id, content.questions) });
    return r;
  });
  await audit(ctx, "TrainingRevision", rev.id, "TRAINING_DRAFT_STARTED", { courseId, title: course.title });
  return { draftId: rev.id };
}

export async function saveDraft(ctx: RequestContext, courseId: string, raw: unknown) {
  const companyId = editor(ctx, "WRITE");
  const course = await courseOr404(companyId, courseId);
  const draft = await draftOf(courseId);
  if (!draft) throw new TrainingError("NO_DRAFT", "There is no draft to save. Click Edit draft first.", 409);
  const input = contentInput.parse(raw);
  const lessons = input.lessons.map(cleanLesson);
  const keys = new Set<string>();
  for (const l of lessons) {
    if (keys.has(l.stableKey)) throw new TrainingError("DUPLICATE_LESSON", `Two lessons share the key ${l.stableKey}. Reload the editor and try again.`);
    keys.add(l.stableKey);
    if (!videoUrlOk(l.videoUrl)) throw new TrainingError("VIDEO_URL", `"${l.title}": the video link must start with http:// or https://.`);
  }
  const assetIds = new Set(lessons.flatMap((l) => [...l.pageImages, l.pdfAssetId ?? ""]).filter(Boolean));
  if (assetIds.size) {
    const found = await prisma.trainingAsset.count({ where: { courseId, id: { in: [...assetIds] } } });
    if (found !== assetIds.size) throw new TrainingError("ASSET_UNKNOWN", "An image or PDF in a lesson belongs to another course. Upload it again here.");
  }
  const questions: DraftQuestion[] = input.questions.map((q) => ({ ...q, answer: [...new Set(q.answer)].filter((a) => a < q.options.length) }));
  for (const q of questions) if (!q.answer.length) throw new TrainingError("QUESTION_ANSWER", `Question "${q.prompt.slice(0, 60)}" needs a right answer.`);
  await prisma.$transaction(async (tx) => {
    await tx.trainingLesson.deleteMany({ where: { revisionId: draft.id } });
    await tx.trainingQuestion.deleteMany({ where: { revisionId: draft.id } });
    if (lessons.length) await tx.trainingLesson.createMany({ data: lessonRows(companyId, draft.id, lessons) });
    if (questions.length) await tx.trainingQuestion.createMany({ data: questionRows(companyId, draft.id, questions) });
    // Saving a draft that was sent for review takes it back to Draft: the reviewer must see the final version.
    await tx.trainingRevision.update({ where: { id: draft.id }, data: { status: "DRAFT", updatedAt: new Date() } });
    await tx.trainingCourse.update({ where: { id: courseId }, data: { updatedAt: new Date() } });
  });
  if (draft.status === "IN_REVIEW") await audit(ctx, "TrainingRevision", draft.id, "TRAINING_DRAFT_REOPENED", { courseId, title: course.title });
  return { ok: true, savedAt: new Date().toISOString() };
}

function publishProblems(course: { completionMode: string }, content: { lessons: DraftLesson[]; questions: DraftQuestion[] }): string[] {
  const problems: string[] = [];
  if (!content.lessons.length) problems.push("Add at least one lesson.");
  for (const l of content.lessons) {
    if (!l.title.trim()) problems.push("A lesson has no title.");
    if (l.format === "PDF" && !l.pdfAssetId) problems.push(`"${l.title}" is a PDF lesson with no PDF attached.`);
    else if (l.format === "VIDEO" && !l.videoUrl) problems.push(`"${l.title}" is a video lesson with no video link.`);
    else if (l.format !== "PDF" && l.format !== "VIDEO" && !l.pages.some((p) => p.trim())) problems.push(`"${l.title}" has no text.`);
  }
  if (course.completionMode === "QUIZ_CERTIFICATE") {
    const finals = content.questions.filter((q) => q.scope === "FINAL").length;
    if (finals < MIN_FINAL_QUESTIONS) problems.push(`The final quiz needs at least ${MIN_FINAL_QUESTIONS} questions (it has ${finals}). Or set the course to Read and acknowledge.`);
  }
  return [...new Set(problems)].slice(0, 12);
}

export async function submitDraft(ctx: RequestContext, courseId: string, raw: unknown) {
  const companyId = editor(ctx, "WRITE");
  const course = await courseOr404(companyId, courseId);
  const draft = await draftOf(courseId);
  if (!draft) throw new TrainingError("NO_DRAFT", "There is no draft to submit.", 409);
  const input = z.object({ changeLevel: z.enum(["MINOR", "MAJOR"]), whatChanged: z.string().trim().max(1000) }).parse(raw);
  if (course.liveRevisionId && input.whatChanged.length < 5) throw new TrainingError("WHAT_CHANGED", "Write a short note for learners on what changed.");
  const problems = publishProblems(course, await revisionContent(draft.id));
  if (problems.length) throw new TrainingError("NOT_READY", problems.join(" "));
  await prisma.trainingRevision.update({ where: { id: draft.id }, data: { status: "IN_REVIEW", changeLevel: input.changeLevel, whatChanged: input.whatChanged, submittedById: ctx.userId, submittedAt: new Date(), reviewComment: null } });
  await audit(ctx, "TrainingRevision", draft.id, "TRAINING_DRAFT_SUBMITTED", { courseId, title: course.title, changeLevel: input.changeLevel, whatChanged: input.whatChanged });
  await notifyAdminsAndManagers(companyId, "TRAINING_REVIEW_DUE", "Course waiting for review", `${ctx.displayName} sent "${course.title}" for review (${input.changeLevel.toLowerCase()} change).`, `/tech-training/manage/${courseId}`);
  return { ok: true };
}

export async function returnDraft(ctx: RequestContext, courseId: string, raw: unknown) {
  const companyId = editor(ctx, "WRITE");
  const course = await courseOr404(companyId, courseId);
  const draft = await draftOf(courseId);
  if (!draft || draft.status !== "IN_REVIEW") throw new TrainingError("NOT_IN_REVIEW", "This course is not waiting for review.", 409);
  const comment = z.object({ comment: z.string().trim().min(3, "Say what needs to change.").max(2000) }).parse(raw).comment;
  await prisma.trainingRevision.update({ where: { id: draft.id }, data: { status: "DRAFT", reviewComment: comment } });
  await audit(ctx, "TrainingRevision", draft.id, "TRAINING_DRAFT_RETURNED", { courseId, title: course.title }, comment);
  if (draft.submittedById && draft.submittedById !== ctx.userId) await notifyUser(companyId, draft.submittedById, "TRAINING_REVIEW_DUE", "Course sent back", `"${course.title}" was sent back: ${comment.slice(0, 200)}`, `/tech-training/manage/${courseId}`);
  return { ok: true };
}

export async function discardDraft(ctx: RequestContext, courseId: string) {
  const companyId = editor(ctx, "WRITE");
  const course = await courseOr404(companyId, courseId);
  const draft = await draftOf(courseId);
  if (!draft) throw new TrainingError("NO_DRAFT", "There is no draft to discard.", 409);
  if (!course.liveRevisionId) throw new TrainingError("ONLY_DRAFT", "This course has never been published. Delete the course instead.", 409);
  await prisma.trainingRevision.delete({ where: { id: draft.id } });
  await audit(ctx, "TrainingRevision", draft.id, "TRAINING_DRAFT_DISCARDED", { courseId, title: course.title });
  return { ok: true };
}

/** Publish the draft. Major changes reset the changed lessons for people part-way through, and can ask certificate holders to update. */
export async function publishDraft(ctx: RequestContext, courseId: string, raw: unknown) {
  const companyId = editor(ctx, "WRITE");
  const course = await courseOr404(companyId, courseId);
  if (course.status === "ARCHIVED") throw new TrainingError("ARCHIVED", "Restore the course before publishing.");
  const draft = await draftOf(courseId);
  if (!draft) throw new TrainingError("NO_DRAFT", "There is no draft to publish.", 409);
  const input = z.object({ changeLevel: z.enum(["MINOR", "MAJOR"]).optional(), whatChanged: z.string().trim().max(1000).optional(), askHoldersToUpdate: z.boolean().optional().default(false) }).parse(raw ?? {});
  const level = input.changeLevel ?? draft.changeLevel ?? "MINOR";
  const whatChanged = input.whatChanged ?? draft.whatChanged ?? "";
  const draftContent = await revisionContent(draft.id);
  const problems = publishProblems(course, draftContent);
  if (problems.length) throw new TrainingError("NOT_READY", problems.join(" "));
  const live = course.liveRevisionId ? await prisma.trainingRevision.findUnique({ where: { id: course.liveRevisionId } }) : null;
  if (live && whatChanged.length < 5) throw new TrainingError("WHAT_CHANGED", "Write a short note for learners on what changed.");
  const liveContent = live ? await revisionContent(live.id) : null;
  const num = nextRevisionNumber(live, live ? level : "MAJOR");
  const diff = liveContent ? diffLessons(liveContent.lessons, draftContent.lessons) : null;
  const changedKeys = diff ? Object.entries(diff.changes).filter(([, c]) => c !== "SAME").map(([k]) => k) : [];
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (live) await tx.trainingRevision.update({ where: { id: live.id }, data: { status: "SUPERSEDED" } });
    await tx.trainingRevision.update({ where: { id: draft.id }, data: { status: "PUBLISHED", major: num.major, minor: num.minor, changeLevel: live ? level : null, whatChanged: whatChanged || (live ? null : "First release"), publishedById: ctx.userId, publishedAt: now } });
    await tx.trainingCourse.update({ where: { id: courseId }, data: { status: "PUBLISHED", liveRevisionId: draft.id, nextReviewAt: addMonths(now, course.reviewMonths) } });
    await tx.trainingEnrolment.updateMany({ where: { courseId }, data: { revisionId: draft.id } });
    if (live && level === "MAJOR" && changedKeys.length) {
      // People part-way through redo the changed and new lessons; finished lessons that did not change stay finished.
      const open = await tx.trainingEnrolment.findMany({ where: { courseId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } }, select: { id: true } });
      await tx.trainingProgress.updateMany({ where: { enrolmentId: { in: open.map((e) => e.id) }, lessonKey: { in: changedKeys } }, data: { completedAt: null, safetyConfirmedAt: null, pagesSeen: 0 } });
      if (input.askHoldersToUpdate) {
        const holders = await tx.trainingEnrolment.findMany({ where: { courseId, status: "CERTIFIED" }, select: { id: true } });
        await tx.trainingProgress.updateMany({ where: { enrolmentId: { in: holders.map((e) => e.id) }, lessonKey: { in: changedKeys } }, data: { completedAt: null, safetyConfirmedAt: null, pagesSeen: 0 } });
        await tx.trainingEnrolment.updateMany({ where: { id: { in: holders.map((e) => e.id) } }, data: { updateRequired: true } });
      }
    }
  });
  await audit(ctx, "TrainingRevision", draft.id, "TRAINING_COURSE_PUBLISHED", { courseId, title: course.title, revision: revisionLabel(num), changeLevel: live ? level : "FIRST", whatChanged, changedLessons: changedKeys.length, askHoldersToUpdate: input.askHoldersToUpdate });
  if (live && level === "MAJOR" && input.askHoldersToUpdate) {
    const holders = await prisma.trainingEnrolment.findMany({ where: { courseId, status: "CERTIFIED" }, select: { employee: { select: { userId: true } } } });
    for (const h of holders) if (h.employee.userId) await notifyUser(companyId, h.employee.userId, "TRAINING_COURSE_ASSIGNED", "Course updated", `"${course.title}" changed (${revisionLabel(num)}). Please redo the updated lessons and the short quiz. Your certificate stays valid.`, `/tech-training/course/${courseId}`);
  }
  return { ok: true, revision: revisionLabel(num) };
}

export async function rollback(ctx: RequestContext, courseId: string, raw: unknown) {
  const companyId = editor(ctx, "WRITE");
  const course = await courseOr404(companyId, courseId);
  const revisionId = z.object({ revisionId: z.string() }).parse(raw).revisionId;
  if (await draftOf(courseId)) throw new TrainingError("DRAFT_OPEN", "Discard or publish the open draft before rolling back.", 409);
  const old = await prisma.trainingRevision.findFirst({ where: { id: revisionId, courseId, status: "SUPERSEDED" } });
  if (!old) throw new TrainingError("NOT_FOUND", "That revision cannot be rolled back to.", 404);
  const content = await revisionContent(old.id);
  await prisma.$transaction(async (tx) => {
    const r = await tx.trainingRevision.create({ data: { companyId, courseId, major: 0, minor: 0, status: "DRAFT", createdById: ctx.userId, changeLevel: "MINOR", whatChanged: `Rolled back to ${revisionLabel(old)}` } });
    if (content.lessons.length) await tx.trainingLesson.createMany({ data: lessonRows(companyId, r.id, content.lessons) });
    if (content.questions.length) await tx.trainingQuestion.createMany({ data: questionRows(companyId, r.id, content.questions) });
  });
  await audit(ctx, "TrainingCourse", courseId, "TRAINING_ROLLBACK_STARTED", { courseId, title: course.title, to: revisionLabel(old) });
  return publishDraft(ctx, courseId, { changeLevel: "MINOR", whatChanged: `Rolled back to ${revisionLabel(old)}` });
}

// ---------------------------------------------------------------------------
// Archive, restore, delete
// ---------------------------------------------------------------------------

export async function archiveImpact(ctx: RequestContext, courseId: string) {
  const companyId = editor(ctx);
  await courseOr404(companyId, courseId);
  const [inProgress, certified, positions, replacements] = await Promise.all([
    prisma.trainingEnrolment.count({ where: { courseId, status: { in: ["ASSIGNED", "IN_PROGRESS", "AWAITING_APPROVAL"] } } }),
    prisma.trainingCertificate.count({ where: { courseId, status: "VALID" } }),
    prisma.trainingPosition.findMany({ where: { companyId, requiredCourseIds: { has: courseId } }, select: { name: true } }),
    prisma.trainingCourse.findMany({ where: { companyId, status: "PUBLISHED", id: { not: courseId } }, select: { id: true, title: true, code: true }, orderBy: { title: "asc" } }),
  ]);
  return { inProgress, certified, positions: positions.map((p) => p.name), replacements };
}

export async function archiveCourse(ctx: RequestContext, courseId: string, raw: unknown) {
  const companyId = editor(ctx, "WRITE");
  const course = await courseOr404(companyId, courseId);
  if (course.status === "ARCHIVED") throw new TrainingError("ARCHIVED", "This course is already archived.", 409);
  const input = z.object({
    reason: z.string().trim().min(5, "Give a reason (it is kept in the audit log).").max(500),
    inProgress: z.enum(["FINISH", "MOVE", "STOP"]),
    finishBy: z.string().optional().nullable(),
    replacementCourseId: z.string().optional().nullable(),
  }).parse(raw);
  const finishBy = input.inProgress === "FINISH" && input.finishBy ? new Date(input.finishBy) : null;
  if (finishBy && Number.isNaN(finishBy.getTime())) throw new TrainingError("DATE_INVALID", "The finish-by date is not valid.");
  let replacement: { id: string; title: string; liveRevisionId: string | null } | null = null;
  if (input.inProgress === "MOVE") {
    if (!input.replacementCourseId) throw new TrainingError("REPLACEMENT", "Pick the course to move learners to.");
    replacement = await prisma.trainingCourse.findFirst({ where: { id: input.replacementCourseId, companyId, status: "PUBLISHED" }, select: { id: true, title: true, liveRevisionId: true } });
    if (!replacement) throw new TrainingError("REPLACEMENT", "The replacement must be a published course.");
  }
  const open = await prisma.trainingEnrolment.findMany({ where: { courseId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } }, include: { progress: true } });
  const replacementKeys = replacement?.liveRevisionId ? new Set((await prisma.trainingLesson.findMany({ where: { revisionId: replacement.liveRevisionId }, select: { stableKey: true } })).map((l) => l.stableKey)) : new Set<string>();
  await prisma.$transaction(async (tx) => {
    await tx.trainingCourse.update({ where: { id: courseId }, data: { status: "ARCHIVED", archivedAt: new Date(), archivedById: ctx.userId, archiveReason: input.reason, replacementCourseId: replacement?.id ?? null, finishBy } });
    const positions = await tx.trainingPosition.findMany({ where: { companyId, requiredCourseIds: { has: courseId } } });
    for (const p of positions) await tx.trainingPosition.update({ where: { id: p.id }, data: { requiredCourseIds: p.requiredCourseIds.filter((id) => id !== courseId).concat(replacement && !p.requiredCourseIds.includes(replacement.id) ? [replacement.id] : []) } });
    if (input.inProgress !== "FINISH") {
      for (const en of open) {
        await tx.trainingEnrolment.update({ where: { id: en.id }, data: { status: "WITHDRAWN", withdrawnAt: new Date(), withdrawnReason: input.inProgress === "MOVE" ? `Moved to ${replacement!.title}` : `Course archived: ${input.reason}` } });
        if (replacement) {
          const exists = await tx.trainingEnrolment.findUnique({ where: { employeeId_courseId: { employeeId: en.employeeId, courseId: replacement.id } } });
          if (exists) continue;
          const moved = await tx.trainingEnrolment.create({ data: { companyId, employeeId: en.employeeId, courseId: replacement.id, revisionId: replacement.liveRevisionId, assignedById: ctx.userId, dueDate: en.dueDate, startedAt: en.startedAt, activeSeconds: en.activeSeconds, status: en.startedAt ? "IN_PROGRESS" : "ASSIGNED" } });
          const keep = en.progress.filter((p) => p.completedAt && replacementKeys.has(p.lessonKey));
          if (keep.length) await tx.trainingProgress.createMany({ data: keep.map((p) => ({ companyId, enrolmentId: moved.id, lessonKey: p.lessonKey, revisionId: replacement!.liveRevisionId, pagesSeen: p.pagesSeen, safetyConfirmedAt: p.safetyConfirmedAt, completedAt: p.completedAt })) });
        }
      }
    }
  });
  await audit(ctx, "TrainingCourse", courseId, "TRAINING_COURSE_ARCHIVED", { courseId, title: course.title, inProgress: input.inProgress, learners: open.length, replacement: replacement?.title ?? null, finishBy: iso(finishBy) }, input.reason);
  return { ok: true };
}

export async function restoreCourse(ctx: RequestContext, courseId: string) {
  const companyId = editor(ctx, "WRITE");
  const course = await courseOr404(companyId, courseId);
  if (course.status !== "ARCHIVED") throw new TrainingError("NOT_ARCHIVED", "This course is not archived.", 409);
  await prisma.trainingCourse.update({ where: { id: courseId }, data: { status: course.liveRevisionId ? "PUBLISHED" : "DRAFT", archivedAt: null, archivedById: null, archiveReason: null, finishBy: null, nextReviewAt: course.liveRevisionId ? addMonths(new Date(), course.reviewMonths) : null } });
  await audit(ctx, "TrainingCourse", courseId, "TRAINING_COURSE_RESTORED", { courseId, title: course.title });
  return { ok: true };
}

export async function deleteCourse(ctx: RequestContext, courseId: string) {
  const companyId = editor(ctx, "WRITE");
  const course = await courseOr404(companyId, courseId);
  const everPublished = await prisma.trainingRevision.count({ where: { courseId, status: { in: ["PUBLISHED", "SUPERSEDED"] } } });
  const records = await prisma.trainingEnrolment.count({ where: { courseId } });
  if (everPublished || records) throw new TrainingError("HAS_RECORDS", "This course was published and holds training records, so it cannot be deleted. Archive it instead.", 409);
  await prisma.$transaction(async (tx) => {
    const positions = await tx.trainingPosition.findMany({ where: { companyId, requiredCourseIds: { has: courseId } } });
    for (const p of positions) await tx.trainingPosition.update({ where: { id: p.id }, data: { requiredCourseIds: p.requiredCourseIds.filter((id) => id !== courseId) } });
    await tx.trainingCourse.delete({ where: { id: courseId } });
  });
  await audit(ctx, "TrainingCourse", courseId, "TRAINING_COURSE_DELETED", { courseId, code: course.code, title: course.title });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Assets (images and PDFs used in lessons)
// ---------------------------------------------------------------------------

export async function uploadAsset(ctx: RequestContext, courseId: string, raw: unknown) {
  const companyId = editor(ctx, "WRITE");
  await courseOr404(companyId, courseId);
  const input = z.object({ name: z.string().trim().max(200), dataUrl: z.string() }).parse(raw);
  const parts = dataUrlParts(input.dataUrl);
  if (!parts) throw new TrainingError("FILE_TYPE", "The file could not be read.");
  const id = await storeAsset(companyId, courseId, input.name || "file", parts.mime, parts.data);
  return { id, mime: parts.mime, name: input.name };
}

/** An image or PDF of a course. Learners see the assets of published courses; course editors see every asset. */
export async function readAsset(ctx: RequestContext, assetId: string) {
  const companyId = requireTraining(ctx, "TRAINING_VIEW");
  checkId(assetId, "file");
  const asset = await prisma.trainingAsset.findFirst({ where: { id: assetId, companyId }, include: { course: { select: { status: true } } } });
  if (!asset) notFound("file");
  if (asset.course.status === "DRAFT" && !can(ctx, "TRAINING_CONTENT_EDIT")) notFound("file");
  return { mime: asset.mime, data: Buffer.from(asset.data), name: asset.name };
}

export async function readCover(ctx: RequestContext, courseId: string) {
  const companyId = requireTraining(ctx, "TRAINING_VIEW");
  checkId(courseId, "course");
  const c = await prisma.trainingCourse.findFirst({ where: { id: courseId, companyId }, select: { coverData: true, coverMime: true } });
  if (!c?.coverData || !c.coverMime) notFound("cover");
  return { mime: c.coverMime, data: Buffer.from(c.coverData) };
}

// ---------------------------------------------------------------------------
// Imports: the prototype's course folder (courses.json + image packs)
// ---------------------------------------------------------------------------

const prototypeInput = z.object({
  course: z.unknown(),
  images: z.unknown().optional().nullable(),
  cover: z.string().optional().nullable(),
  code: z.string().trim().optional(),
  publish: z.boolean().optional().default(false),
});

async function lessonsWithAssets(companyId: string, courseId: string, proto: PrototypeCourse, pack: PrototypeImagePack | null, tx: Prisma.TransactionClient) {
  const assetFor = new Map<string, string>();
  if (pack?.img && pack.pages) {
    for (const [name, dataUrl] of Object.entries(pack.img)) {
      const parts = typeof dataUrl === "string" ? dataUrlParts(dataUrl) : null;
      if (!parts || !parts.mime.startsWith("image/") || parts.mime === "image/svg+xml") continue;
      assetFor.set(name, await storeAsset(companyId, courseId, name, parts.mime, parts.data, tx));
    }
  }
  return lessonsFromPrototype(proto, (lessonId, page) => {
    const name = pack?.pages?.[`${lessonId}|${page}`];
    return name ? assetFor.get(name) ?? "" : "";
  });
}

export async function importPrototype(ctx: RequestContext, raw: unknown, importKey?: string) {
  const companyId = editor(ctx, "WRITE");
  const input = prototypeInput.parse(raw);
  const proto = input.course as PrototypeCourse;
  if (!proto || typeof proto !== "object" || typeof proto.id !== "string" || !Array.isArray(proto.chapters)) throw new TrainingError("FORMAT", "That file is not a course from the Service Tech Training folder (courses.json).");
  const pack = (input.images ?? null) as PrototypeImagePack | null;
  const code = (input.code || proto.id).toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
  await assertCode(companyId, code);
  const settings = await settingsFor(companyId);
  const now = new Date();
  const course = await prisma.$transaction(async (tx) => {
    const c = await tx.trainingCourse.create({
      data: {
        companyId, code, title: proto.title, group: proto.group || "General", docNumber: docNumberFor(code), status: input.publish ? "PUBLISHED" : "DRAFT", completionMode: "QUIZ_CERTIFICATE",
        passMark: settings.defaultPassMark, maxAttempts: settings.defaultMaxAttempts, ownerUserId: ctx.userId, reviewMonths: 12, importKey: importKey ?? `prototype:${proto.id}`, createdById: ctx.userId,
        ...(input.cover ? (() => { const p = dataUrlParts(input.cover!); return p && p.mime.startsWith("image/") ? { coverData: p.data, coverMime: p.mime } : {}; })() : {}),
        nextReviewAt: input.publish ? addMonths(now, 12) : null,
      },
    });
    const rev = await tx.trainingRevision.create({ data: { companyId, courseId: c.id, major: input.publish ? 1 : 0, minor: 0, status: input.publish ? "PUBLISHED" : "DRAFT", createdById: ctx.userId, publishedById: input.publish ? ctx.userId : null, publishedAt: input.publish ? now : null, whatChanged: input.publish ? "Imported from the Service Tech Training prototype" : null } });
    const lessons = await lessonsWithAssets(companyId, c.id, proto, pack, tx);
    // Lessons go in batches: the Cat courses have a few hundred pages each.
    const rows = lessonRows(companyId, rev.id, lessons);
    for (let i = 0; i < rows.length; i += 100) await tx.trainingLesson.createMany({ data: rows.slice(i, i + 100) });
    if (input.publish) await tx.trainingCourse.update({ where: { id: c.id }, data: { liveRevisionId: rev.id } });
    return { c, lessons: lessons.length, images: lessons.reduce((n, l) => n + l.pageImages.filter(Boolean).length, 0) };
  }, { timeout: 120_000, maxWait: 20_000 });
  await audit(ctx, "TrainingCourse", course.c.id, "TRAINING_COURSE_IMPORTED", { courseId: course.c.id, code, title: proto.title, lessons: course.lessons, images: course.images, published: input.publish });
  return { id: course.c.id, code, title: proto.title, lessons: course.lessons, images: course.images };
}

/** Add the diagrams of a prototype image pack to a course that was imported without them (no change to the text). */
export async function attachImagePack(ctx: RequestContext, courseId: string, raw: unknown) {
  const companyId = editor(ctx, "WRITE");
  const course = await courseOr404(companyId, courseId);
  const pack = z.object({ images: z.unknown() }).parse(raw).images as PrototypeImagePack;
  if (!pack?.pages || !pack?.img) throw new TrainingError("FORMAT", "That file is not an image pack (img/<course>.json) from the Service Tech Training folder.");
  const revisionIds = [course.liveRevisionId, (await draftOf(courseId))?.id].filter((v): v is string => !!v);
  let placed = 0;
  await prisma.$transaction(async (tx) => {
    const assetFor = new Map<string, string>();
    for (const [name, dataUrl] of Object.entries(pack.img)) {
      const parts = typeof dataUrl === "string" ? dataUrlParts(dataUrl) : null;
      if (parts && parts.mime.startsWith("image/") && parts.mime !== "image/svg+xml") assetFor.set(name, await storeAsset(companyId, courseId, name, parts.mime, parts.data, tx));
    }
    const lessons = await tx.trainingLesson.findMany({ where: { revisionId: { in: revisionIds } } });
    for (const l of lessons) {
      const images = l.pages.map((_, i) => { const n = pack.pages[`${l.stableKey}|${i}`]; return (n && assetFor.get(n)) || l.pageImages[i] || ""; });
      const count = images.filter(Boolean).length;
      if (count && JSON.stringify(images) !== JSON.stringify(l.pageImages)) {
        await tx.trainingLesson.update({ where: { id: l.id }, data: { pageImages: images, format: l.format === "TEXT" ? "TEXT_IMAGES" : l.format } });
        placed += count;
      }
    }
  }, { timeout: 120_000, maxWait: 20_000 });
  await audit(ctx, "TrainingCourse", courseId, "TRAINING_DIAGRAMS_ADDED", { courseId, title: course.title, placed });
  return { placed };
}

/** Outline for the "Import course folder" preview: what a prototype course holds. */
export function prototypeOutline(proto: PrototypeCourse) {
  const lessons = lessonsFromPrototype(proto);
  return { id: proto.id, title: proto.title, group: proto.group, chapters: chaptersOf(lessons).map((c) => ({ title: c.title, lessons: c.lessons.length })), lessons: lessons.length, pages: lessons.reduce((n, l) => n + l.pages.length, 0) };
}
