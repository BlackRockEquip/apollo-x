import { z } from "zod";
import type { Prisma, TrainingEmployee } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { TrainingError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import { notifyAdminsAndManagers, notifyUser } from "@/lib/notifications/service";
import { audit, can, checkId, iso, myEmployee, notFound, requireTraining, settingsFor, userNames } from "@/lib/training/access";
import { lessonOrder } from "@/lib/training/content";
import {
  attemptsLeft, certificateNumber, chaptersOf, FINAL_QUIZ_SIZE, fullName, heartbeatSeconds, markQuiz, MIN_FINAL_QUESTIONS, nextCardBox, PRE_ASSESSMENT_SIZE, revisionLabel, shuffle, addDays,
} from "@/lib/training/model";

// ---------------------------------------------------------------------------
// Learner side (2026-11-28): catalogue, course page, lesson reader, knowledge checks, pre-assessment, final quiz, acknowledgement,
// mentor questions and revision cards. The signed-in user takes courses through the employee profile linked to their login.
// Start time = the first lesson opened; end time = the final quiz passed (or the course acknowledged). Every quiz attempt is kept.
// ---------------------------------------------------------------------------

function learnerCtx(ctx: RequestContext, intent: "READ" | "WRITE" = "READ") {
  return requireTraining(ctx, "TRAINING_VIEW", intent);
}

async function requireEmployee(ctx: RequestContext): Promise<TrainingEmployee> {
  const e = await myEmployee(ctx);
  if (!e) throw new TrainingError("NO_PROFILE", "Your login is not linked to an employee training profile yet. Ask a Company Admin to link it (Tech Training > Employees).", 403);
  return e;
}

async function visibleCourse(companyId: string, courseId: string, employeeId: string | null, preview: boolean) {
  checkId(courseId, "course");
  const c = await prisma.trainingCourse.findFirst({ where: { id: courseId, companyId } });
  if (!c) notFound("course");
  if (c.status === "PUBLISHED") return c;
  if (c.status === "ARCHIVED" && employeeId) {
    const en = await prisma.trainingEnrolment.findUnique({ where: { employeeId_courseId: { employeeId, courseId } } });
    if (en && en.status !== "WITHDRAWN") return c;
  }
  if (preview && c.liveRevisionId) return c;
  notFound("course");
}

function pct(done: number, total: number) {
  return total ? Math.round((100 * done) / total) : 0;
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export async function catalogue(ctx: RequestContext) {
  const companyId = learnerCtx(ctx);
  const employee = await myEmployee(ctx);
  const position = employee?.positionId ? await prisma.trainingPosition.findUnique({ where: { id: employee.positionId } }) : null;
  const enrolments = employee ? await prisma.trainingEnrolment.findMany({ where: { employeeId: employee.id }, include: { progress: { where: { completedAt: { not: null } }, select: { lessonKey: true } } } }) : [];
  const courses = await prisma.trainingCourse.findMany({
    where: { companyId, OR: [{ status: "PUBLISHED" }, { status: "ARCHIVED", id: { in: enrolments.filter((e) => e.status !== "WITHDRAWN" && e.status !== "CERTIFIED" && e.status !== "ACKNOWLEDGED").map((e) => e.courseId) } }] },
    select: { id: true, code: true, title: true, group: true, status: true, completionMode: true, liveRevisionId: true, coverMime: true, finishBy: true },
    orderBy: [{ group: "asc" }, { title: "asc" }],
  });
  const revIds = courses.map((c) => c.liveRevisionId).filter((v): v is string => !!v);
  const lessons = await prisma.trainingLesson.findMany({ where: { revisionId: { in: revIds } }, select: { revisionId: true, stableKey: true, estMinutes: true, chapterTitle: true }, orderBy: lessonOrder });
  const byRev = new Map<string, typeof lessons>();
  for (const l of lessons) { const a = byRev.get(l.revisionId) ?? []; a.push(l); byRev.set(l.revisionId, a); }
  const certs = employee ? await prisma.trainingCertificate.findMany({ where: { employeeId: employee.id, status: { in: ["VALID", "PENDING"] } }, select: { courseId: true, status: true, certNo: true } }) : [];
  const items = courses.map((c) => {
    const ls = byRev.get(c.liveRevisionId ?? "") ?? [];
    const keys = new Set(ls.map((l) => l.stableKey));
    const en = enrolments.find((e) => e.courseId === c.id);
    const done = en ? en.progress.filter((p) => keys.has(p.lessonKey)).length : 0;
    const cert = certs.find((x) => x.courseId === c.id && x.status === "VALID") ?? certs.find((x) => x.courseId === c.id);
    return {
      id: c.id, code: c.code, title: c.title, group: c.group, archived: c.status === "ARCHIVED", finishBy: iso(c.finishBy), completionMode: c.completionMode, hasCover: !!c.coverMime,
      chapters: [...new Set(ls.map((l) => l.chapterTitle))].length, lessons: ls.length, minutes: ls.reduce((n, l) => n + l.estMinutes, 0),
      done, pct: pct(done, ls.length), status: en?.status ?? null, dueDate: iso(en?.dueDate), required: !!position?.requiredCourseIds.includes(c.id), updateRequired: !!en?.updateRequired,
      certificate: cert ? { certNo: cert.certNo, status: cert.status } : null,
    };
  });
  const last = enrolments.filter((e) => e.lastLessonKey && e.status === "IN_PROGRESS").sort((a, b) => (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0))[0];
  let resume: { courseId: string; courseTitle: string; lessonKey: string; lessonTitle: string } | null = null;
  if (last) {
    const course = courses.find((c) => c.id === last.courseId);
    const lesson = course?.liveRevisionId ? await prisma.trainingLesson.findFirst({ where: { revisionId: course.liveRevisionId, stableKey: last.lastLessonKey! }, select: { title: true } }) : null;
    if (course && lesson) resume = { courseId: course.id, courseTitle: course.title, lessonKey: last.lastLessonKey!, lessonTitle: lesson.title };
  }
  const cardsDue = employee ? await cardsDueCount(employee.id) : 0;
  return {
    employee: employee ? { id: employee.id, name: fullName(employee), position: position?.name ?? "" } : null,
    items, resume, cardsDue,
    totals: { lessons: items.reduce((n, i) => n + (i.status ? i.lessons : 0), 0), done: items.reduce((n, i) => n + i.done, 0), certificates: certs.filter((c) => c.status === "VALID").length, pending: certs.filter((c) => c.status === "PENDING").length },
    canPreview: can(ctx, "TRAINING_CONTENT_EDIT"),
  };
}

// ---------------------------------------------------------------------------
// Course page
// ---------------------------------------------------------------------------

export async function courseView(ctx: RequestContext, courseId: string) {
  const companyId = learnerCtx(ctx);
  const employee = await myEmployee(ctx);
  const course = await visibleCourse(companyId, courseId, employee?.id ?? null, can(ctx, "TRAINING_CONTENT_EDIT"));
  const revision = course.liveRevisionId ? await prisma.trainingRevision.findUnique({ where: { id: course.liveRevisionId } }) : null;
  if (!revision) notFound("course");
  const [lessons, questionCounts] = await Promise.all([
    prisma.trainingLesson.findMany({ where: { revisionId: revision.id }, orderBy: lessonOrder, select: { stableKey: true, chapterKey: true, chapterTitle: true, topicTitle: true, title: true, format: true, estMinutes: true, pages: true, safetyPoint: true, practicalTask: true, objective: true } }),
    prisma.trainingQuestion.groupBy({ by: ["scope", "chapterKey"], where: { revisionId: revision.id }, _count: true }),
  ]);
  const en = employee ? await prisma.trainingEnrolment.findUnique({ where: { employeeId_courseId: { employeeId: employee.id, courseId } }, include: { progress: true, attempts: { orderBy: { startedAt: "asc" } }, signoffs: true } }) : null;
  const done = new Set(en?.progress.filter((p) => p.completedAt).map((p) => p.lessonKey) ?? []);
  const finalCount = questionCounts.filter((q) => q.scope === "FINAL").reduce((n, q) => n + q._count, 0);
  const checks = new Map(questionCounts.filter((q) => q.scope === "CHECK").map((q) => [q.chapterKey, q._count]));
  const checkResults = new Map<string, { best: number; passed: boolean; tries: number }>();
  for (const a of en?.attempts.filter((a) => a.kind === "CHECK" && a.submittedAt) ?? []) {
    const cur = checkResults.get(a.chapterKey) ?? { best: 0, passed: false, tries: 0 };
    checkResults.set(a.chapterKey, { best: Math.max(cur.best, a.score ?? 0), passed: cur.passed || !!a.passed, tries: cur.tries + 1 });
  }
  const cert = employee ? await prisma.trainingCertificate.findFirst({ where: { employeeId: employee.id, courseId, status: { in: ["PENDING", "VALID", "REJECTED"] } }, orderBy: { requestedAt: "desc" } }) : null;
  const finals = en?.attempts.filter((a) => a.kind === "FINAL") ?? [];
  const allDone = lessons.length > 0 && lessons.every((l) => done.has(l.stableKey));
  const left = attemptsLeft(course.maxAttempts, en?.attemptsUsed ?? 0, en?.attemptsReset ?? 0);
  const quizBlockedBy =
    course.completionMode !== "QUIZ_CERTIFICATE" ? "MODE"
      : !employee ? "NO_PROFILE"
      : finalCount < MIN_FINAL_QUESTIONS ? "NO_QUIZ"
      : !allDone ? "LESSONS"
      : en?.status === "AWAITING_APPROVAL" ? "AWAITING"
      : en?.status === "CERTIFIED" && !en.updateRequired ? "CERTIFIED"
      : left <= 0 ? "NO_ATTEMPTS"
      : null;
  const changedSinceStart = en?.startedAt && revision.publishedAt && revision.publishedAt > en.startedAt && revision.whatChanged ? revision.whatChanged : null;
  const names = await userNames(en?.signoffs.map((s) => s.signedById) ?? []);
  return {
    course: { id: course.id, code: course.code, title: course.title, group: course.group, completionMode: course.completionMode, passMark: course.passMark, maxAttempts: course.maxAttempts, hasCover: !!course.coverMime, archived: course.status === "ARCHIVED", finishBy: iso(course.finishBy), revision: revisionLabel(revision), docNumber: course.docNumber },
    chapters: chaptersOf(lessons).map((ch) => ({
      key: ch.key, title: ch.title, checkQuestions: checks.get(ch.key) ?? 0, check: checkResults.get(ch.key) ?? null,
      lessons: ch.lessons.map((l) => ({ key: l.stableKey, title: l.title, topic: l.topicTitle, format: l.format, minutes: l.estMinutes, pages: l.pages.length, done: done.has(l.stableKey), safety: !!l.safetyPoint, practical: l.practicalTask ? { task: l.practicalTask, signedOff: en?.signoffs.find((s) => s.lessonKey === l.stableKey) ? { by: names.get(en!.signoffs.find((s) => s.lessonKey === l.stableKey)!.signedById) ?? "", at: iso(en!.signoffs.find((s) => s.lessonKey === l.stableKey)!.signedAt) } : null } : null })),
    })),
    objective: lessons[0]?.objective ?? "",
    totals: { lessons: lessons.length, done: lessons.filter((l) => done.has(l.stableKey)).length, minutesLeft: lessons.filter((l) => !done.has(l.stableKey)).reduce((n, l) => n + l.estMinutes, 0) },
    enrolment: en ? {
      id: en.id, status: en.status, startedAt: iso(en.startedAt), completedAt: iso(en.completedAt), dueDate: iso(en.dueDate), activeSeconds: en.activeSeconds, attemptsUsed: en.attemptsUsed, attemptsLeft: left, preScore: en.preScore,
      lastLessonKey: en.lastLessonKey, updateRequired: en.updateRequired, acknowledgedAt: iso(en.acknowledgedAt),
      attempts: finals.map((a) => ({ no: a.attemptNo, startedAt: iso(a.startedAt), submittedAt: iso(a.submittedAt), seconds: a.durationSeconds, score: a.score, passed: a.passed })),
    } : null,
    quiz: { questions: Math.min(finalCount, FINAL_QUIZ_SIZE), available: finalCount >= MIN_FINAL_QUESTIONS, blockedBy: quizBlockedBy, preAvailable: !!employee && finalCount >= MIN_FINAL_QUESTIONS && (en?.preScore ?? null) === null && done.size === 0 },
    certificate: cert ? { certNo: cert.certNo, status: cert.status, requestedAt: iso(cert.requestedAt), decidedAt: iso(cert.decidedAt), comment: cert.decisionComment } : null,
    changedSinceStart,
    canAcknowledge: course.completionMode === "ACKNOWLEDGE" && allDone && !!en && en.status !== "ACKNOWLEDGED",
    hasProfile: !!employee,
  };
}

async function ensureEnrolment(ctx: RequestContext, companyId: string, employee: TrainingEmployee, course: { id: string; liveRevisionId: string | null; title: string }) {
  const existing = await prisma.trainingEnrolment.findUnique({ where: { employeeId_courseId: { employeeId: employee.id, courseId: course.id } } });
  const now = new Date();
  if (existing && existing.status !== "WITHDRAWN") {
    if (!existing.startedAt) {
      const started = await prisma.trainingEnrolment.update({ where: { id: existing.id }, data: { startedAt: now, status: existing.status === "ASSIGNED" ? "IN_PROGRESS" : existing.status, lastSeenAt: now } });
      await audit(ctx, "TrainingEnrolment", existing.id, "TRAINING_COURSE_STARTED", { employeeId: employee.id, courseId: course.id, course: course.title, startedAt: now.toISOString() });
      return started;
    }
    return existing;
  }
  const en = existing
    ? await prisma.trainingEnrolment.update({ where: { id: existing.id }, data: { status: "IN_PROGRESS", startedAt: existing.startedAt ?? now, withdrawnAt: null, withdrawnReason: null, revisionId: course.liveRevisionId, lastSeenAt: now } })
    : await prisma.trainingEnrolment.create({ data: { companyId, employeeId: employee.id, courseId: course.id, revisionId: course.liveRevisionId, status: "IN_PROGRESS", startedAt: now, lastSeenAt: now } });
  await audit(ctx, "TrainingEnrolment", en.id, "TRAINING_COURSE_STARTED", { employeeId: employee.id, courseId: course.id, course: course.title, startedAt: now.toISOString(), selfEnrolled: !existing });
  return en;
}

export async function startCourse(ctx: RequestContext, courseId: string) {
  const companyId = learnerCtx(ctx, "WRITE");
  const employee = await requireEmployee(ctx);
  const course = await visibleCourse(companyId, courseId, employee.id, false);
  const en = await ensureEnrolment(ctx, companyId, employee, course);
  return { enrolmentId: en.id };
}

// ---------------------------------------------------------------------------
// Lesson reader
// ---------------------------------------------------------------------------

export async function lessonView(ctx: RequestContext, courseId: string, lessonKey: string) {
  const companyId = learnerCtx(ctx);
  const employee = await myEmployee(ctx);
  const preview = can(ctx, "TRAINING_CONTENT_EDIT");
  const course = await visibleCourse(companyId, courseId, employee?.id ?? null, preview);
  if (!course.liveRevisionId) notFound("lesson");
  const lessons = await prisma.trainingLesson.findMany({ where: { revisionId: course.liveRevisionId }, orderBy: lessonOrder, select: { stableKey: true, title: true, chapterKey: true, chapterTitle: true } });
  const idx = lessons.findIndex((l) => l.stableKey === lessonKey);
  if (idx < 0) notFound("lesson");
  const lesson = await prisma.trainingLesson.findFirst({ where: { revisionId: course.liveRevisionId, stableKey: lessonKey } });
  if (!lesson) notFound("lesson");
  let progress = null;
  let enrolmentId: string | null = null;
  let signoff = null;
  // Opening a lesson starts the course (start date and time) for someone with a profile; preview without a profile records nothing.
  if (employee && ctx.moduleAccess.get("TECH_TRAINING") === "FULL" && !(ctx.supportAccessId && ctx.supportMode === "READ_ONLY")) {
    const en = await ensureEnrolment(ctx, companyId, employee, course);
    enrolmentId = en.id;
    await prisma.trainingEnrolment.update({ where: { id: en.id }, data: { lastLessonKey: lessonKey } });
    progress = await prisma.trainingProgress.findUnique({ where: { enrolmentId_lessonKey: { enrolmentId: en.id, lessonKey } } });
    const s = await prisma.trainingSignoff.findUnique({ where: { enrolmentId_lessonKey: { enrolmentId: en.id, lessonKey } } });
    if (s) signoff = { at: iso(s.signedAt), by: (await userNames([s.signedById])).get(s.signedById) ?? "", jobRef: s.jobRef, comment: s.comment };
  }
  const doneKeys = enrolmentId ? new Set((await prisma.trainingProgress.findMany({ where: { enrolmentId, completedAt: { not: null } }, select: { lessonKey: true } })).map((p) => p.lessonKey)) : new Set<string>();
  const questions = await prisma.trainingMentorQuestion.findMany({ where: { courseId, lessonKey, OR: [{ answer: { not: null } }, ...(employee ? [{ employeeId: employee.id }] : [])] }, orderBy: { createdAt: "desc" }, take: 30 });
  const names = await userNames(questions.map((q) => q.answeredById));
  const chapter = lessons.filter((l) => l.chapterKey === lesson.chapterKey);
  return {
    course: { id: course.id, title: course.title, archived: course.status === "ARCHIVED" },
    lesson: { key: lesson.stableKey, title: lesson.title, chapterKey: lesson.chapterKey, chapterTitle: lesson.chapterTitle, topic: lesson.topicTitle, format: lesson.format, objective: lesson.objective, pages: lesson.pages, pageImages: lesson.pages.map((_, i) => lesson.pageImages[i] ?? ""), pdfAssetId: lesson.pdfAssetId, videoUrl: lesson.videoUrl, safetyPoint: lesson.safetyPoint, practicalTask: lesson.practicalTask, minutes: lesson.estMinutes },
    outline: chapter.map((l) => ({ key: l.stableKey, title: l.title, done: doneKeys.has(l.stableKey) })),
    prev: idx > 0 ? lessons[idx - 1].stableKey : null,
    next: idx < lessons.length - 1 ? lessons[idx + 1].stableKey : null,
    nextIsNewChapter: idx < lessons.length - 1 && lessons[idx + 1].chapterKey !== lesson.chapterKey,
    position: { index: idx + 1, total: lessons.length },
    progress: progress ? { pagesSeen: progress.pagesSeen, done: !!progress.completedAt, safetyConfirmed: !!progress.safetyConfirmedAt } : null,
    tracking: !!enrolmentId,
    signoff,
    mentor: questions.map((q) => ({ id: q.id, question: q.question, answer: q.answer, answeredBy: q.answeredById ? names.get(q.answeredById) ?? "" : null, answeredAt: iso(q.answeredAt), mine: q.employeeId === employee?.id, askedAt: iso(q.createdAt) })),
    preview: !employee,
  };
}

async function myEnrolment(ctx: RequestContext, courseId: string) {
  const companyId = learnerCtx(ctx, "WRITE");
  const employee = await requireEmployee(ctx);
  checkId(courseId, "course");
  const en = await prisma.trainingEnrolment.findUnique({ where: { employeeId_courseId: { employeeId: employee.id, courseId } }, include: { course: true } });
  if (!en || en.companyId !== companyId || en.status === "WITHDRAWN") throw new TrainingError("NOT_STARTED", "Open the course first.", 409);
  return { companyId, employee, en };
}

/** Heartbeat from the lesson reader: the page reached, and active learning time (capped, so an open tab does not count). */
export async function recordPage(ctx: RequestContext, courseId: string, lessonKey: string, raw: unknown) {
  const { companyId, en } = await myEnrolment(ctx, courseId);
  const input = z.object({ page: z.number().int().min(0).max(200), seconds: z.number().min(0).max(600).optional().default(0) }).parse(raw);
  const now = new Date();
  const add = heartbeatSeconds(en.lastSeenAt, now, input.seconds);
  await prisma.trainingEnrolment.update({ where: { id: en.id }, data: { activeSeconds: { increment: add }, lastSeenAt: now, lastLessonKey: lessonKey, lastPage: input.page } });
  const existing = await prisma.trainingProgress.findUnique({ where: { enrolmentId_lessonKey: { enrolmentId: en.id, lessonKey } } });
  if (!existing) await prisma.trainingProgress.create({ data: { companyId, enrolmentId: en.id, lessonKey, revisionId: en.revisionId, pagesSeen: input.page + 1 } });
  else if (input.page + 1 > existing.pagesSeen) await prisma.trainingProgress.update({ where: { id: existing.id }, data: { pagesSeen: input.page + 1 } });
  return { ok: true };
}

export async function completeLesson(ctx: RequestContext, courseId: string, lessonKey: string, raw: unknown) {
  const { companyId, employee, en } = await myEnrolment(ctx, courseId);
  const input = z.object({ safetyConfirmed: z.boolean().optional().default(false) }).parse(raw ?? {});
  const lesson = en.course.liveRevisionId ? await prisma.trainingLesson.findFirst({ where: { revisionId: en.course.liveRevisionId, stableKey: lessonKey } }) : null;
  if (!lesson) notFound("lesson");
  if (lesson.safetyPoint && !input.safetyConfirmed) throw new TrainingError("SAFETY_CONFIRM", "Tick the safety point to confirm you have read and understood it.");
  const now = new Date();
  await prisma.trainingProgress.upsert({
    where: { enrolmentId_lessonKey: { enrolmentId: en.id, lessonKey } },
    create: { companyId, enrolmentId: en.id, lessonKey, revisionId: en.revisionId, pagesSeen: lesson.pages.length, completedAt: now, safetyConfirmedAt: lesson.safetyPoint ? now : null },
    update: { completedAt: now, pagesSeen: lesson.pages.length, ...(lesson.safetyPoint ? { safetyConfirmedAt: now } : {}) },
  });
  if (en.status === "ASSIGNED") await prisma.trainingEnrolment.update({ where: { id: en.id }, data: { status: "IN_PROGRESS" } });
  await audit(ctx, "TrainingProgress", en.id, "TRAINING_LESSON_COMPLETED", { employeeId: employee.id, courseId, lessonKey, lesson: lesson.title, safetyConfirmed: !!lesson.safetyPoint });
  const total = await prisma.trainingLesson.count({ where: { revisionId: en.course.liveRevisionId! } });
  const liveKeys = (await prisma.trainingLesson.findMany({ where: { revisionId: en.course.liveRevisionId! }, select: { stableKey: true } })).map((l) => l.stableKey);
  const done = await prisma.trainingProgress.count({ where: { enrolmentId: en.id, completedAt: { not: null }, lessonKey: { in: liveKeys } } });
  return { done, total, allDone: done >= total };
}

export async function acknowledgeCourse(ctx: RequestContext, courseId: string, raw: unknown) {
  const { employee, en } = await myEnrolment(ctx, courseId);
  z.object({ confirm: z.literal(true) }).parse(raw);
  if (en.course.completionMode !== "ACKNOWLEDGE") throw new TrainingError("MODE", "This course is completed with a quiz.");
  const keys = (await prisma.trainingLesson.findMany({ where: { revisionId: en.course.liveRevisionId! }, select: { stableKey: true } })).map((l) => l.stableKey);
  const done = await prisma.trainingProgress.count({ where: { enrolmentId: en.id, completedAt: { not: null }, lessonKey: { in: keys } } });
  if (done < keys.length) throw new TrainingError("LESSONS", "Finish every lesson before you acknowledge the course.");
  const now = new Date();
  await prisma.trainingEnrolment.update({ where: { id: en.id }, data: { status: "ACKNOWLEDGED", acknowledgedAt: now, completedAt: now, updateRequired: false } });
  await audit(ctx, "TrainingEnrolment", en.id, "TRAINING_COURSE_ACKNOWLEDGED", { employeeId: employee.id, courseId, course: en.course.title, completedAt: now.toISOString(), startedAt: iso(en.startedAt), activeSeconds: en.activeSeconds });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Quizzes: pre-assessment, knowledge checks, final quiz
// ---------------------------------------------------------------------------

const startQuizInput = z.object({ kind: z.enum(["FINAL", "PRE", "CHECK"]), chapterKey: z.string().max(80).optional().default("") });

export async function startQuiz(ctx: RequestContext, courseId: string, raw: unknown) {
  const { companyId, employee, en } = await myEnrolment(ctx, courseId);
  const input = startQuizInput.parse(raw);
  const course = en.course;
  if (!course.liveRevisionId) notFound("course");
  const pool = await prisma.trainingQuestion.findMany({ where: { revisionId: course.liveRevisionId, scope: input.kind === "CHECK" ? "CHECK" : "FINAL", ...(input.kind === "CHECK" ? { chapterKey: input.chapterKey } : {}) } });
  if (input.kind === "CHECK" && !pool.length) throw new TrainingError("NO_CHECK", "This chapter has no knowledge check.");
  if (input.kind !== "CHECK" && pool.length < MIN_FINAL_QUESTIONS) throw new TrainingError("NO_QUIZ", "The final quiz for this course is still being prepared. Your lessons are saved.");
  const previous = await prisma.trainingQuizAttempt.count({ where: { enrolmentId: en.id, kind: input.kind, ...(input.kind === "CHECK" ? { chapterKey: input.chapterKey } : {}) } });
  if (input.kind === "PRE") {
    if (en.preScore !== null) throw new TrainingError("PRE_DONE", "You have already done the pre-assessment.");
    const anyDone = await prisma.trainingProgress.count({ where: { enrolmentId: en.id, completedAt: { not: null } } });
    if (anyDone) throw new TrainingError("PRE_LATE", "The pre-assessment is only offered before the first lesson is finished.");
  }
  if (input.kind === "FINAL") {
    if (course.completionMode !== "QUIZ_CERTIFICATE") throw new TrainingError("MODE", "This course is completed by acknowledging it, not with a quiz.");
    if (en.status === "AWAITING_APPROVAL") throw new TrainingError("AWAITING", "You have passed. Your certificate is waiting for your manager's approval.");
    if (en.status === "CERTIFIED" && !en.updateRequired) throw new TrainingError("CERTIFIED", "You already hold the certificate for this course.");
    const keys = (await prisma.trainingLesson.findMany({ where: { revisionId: course.liveRevisionId }, select: { stableKey: true } })).map((l) => l.stableKey);
    const done = await prisma.trainingProgress.count({ where: { enrolmentId: en.id, completedAt: { not: null }, lessonKey: { in: keys } } });
    if (done < keys.length) throw new TrainingError("LESSONS", `Finish every lesson first (${done} of ${keys.length} done).`);
    if (attemptsLeft(course.maxAttempts, en.attemptsUsed, en.attemptsReset) <= 0) throw new TrainingError("NO_ATTEMPTS", "You have used all your attempts. Your manager or a Company Admin can give you more after going through the lessons with you.");
  }
  const size = input.kind === "FINAL" ? FINAL_QUIZ_SIZE : input.kind === "PRE" ? PRE_ASSESSMENT_SIZE : pool.length;
  const picked = shuffle(pool).slice(0, size);
  const attempt = await prisma.$transaction(async (tx) => {
    // A final attempt counts as soon as it starts: walking away from a quiz is still an attempt on the record.
    if (input.kind === "FINAL") await tx.trainingEnrolment.update({ where: { id: en.id }, data: { attemptsUsed: { increment: 1 } } });
    return tx.trainingQuizAttempt.create({ data: { companyId, enrolmentId: en.id, employeeId: employee.id, courseId, revisionId: course.liveRevisionId!, kind: input.kind, chapterKey: input.chapterKey, attemptNo: previous + 1, questionIds: picked.map((q) => q.id) } });
  });
  if (input.kind === "FINAL") await audit(ctx, "TrainingQuizAttempt", attempt.id, "TRAINING_QUIZ_STARTED", { employeeId: employee.id, courseId, course: course.title, attemptNo: attempt.attemptNo, startedAt: attempt.startedAt.toISOString() });
  return {
    attemptId: attempt.id, kind: input.kind, attemptNo: attempt.attemptNo, passMark: input.kind === "FINAL" ? course.passMark : null,
    questions: picked.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options, multi: q.answer.length > 1 })),
  };
}

export async function submitQuiz(ctx: RequestContext, attemptId: string, raw: unknown) {
  const companyId = learnerCtx(ctx, "WRITE");
  const employee = await requireEmployee(ctx);
  checkId(attemptId, "quiz");
  const attempt = await prisma.trainingQuizAttempt.findFirst({ where: { id: attemptId, companyId, employeeId: employee.id }, include: { enrolment: { include: { course: true } } } });
  if (!attempt) notFound("quiz");
  if (attempt.submittedAt) throw new TrainingError("SUBMITTED", "This attempt was already handed in.", 409);
  const answers = z.object({ answers: z.record(z.string(), z.array(z.number().int().min(0).max(7)).max(8)) }).parse(raw).answers;
  const questions = await prisma.trainingQuestion.findMany({ where: { id: { in: attempt.questionIds } } });
  const ordered = attempt.questionIds.map((id) => questions.find((q) => q.id === id)).filter((q): q is NonNullable<typeof q> => !!q);
  const course = attempt.enrolment.course;
  const passMark = attempt.kind === "FINAL" ? course.passMark : attempt.kind === "CHECK" ? 67 : 0;
  const result = markQuiz(ordered.map((q) => ({ id: q.id, answer: q.answer, lessonKey: q.lessonKey })), answers, passMark);
  const now = new Date();
  const seconds = Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000);
  const lessonTitles = new Map((await prisma.trainingLesson.findMany({ where: { revisionId: attempt.revisionId, stableKey: { in: result.weakLessonKeys } }, select: { stableKey: true, title: true } })).map((l) => [l.stableKey, l.title]));
  const weak = result.weakLessonKeys.map((k) => ({ key: k, title: lessonTitles.get(k) ?? k })).filter((w) => lessonTitles.has(w.key));
  await prisma.trainingQuizAttempt.update({ where: { id: attempt.id }, data: { answers: answers as Prisma.InputJsonValue, score: result.score, passed: attempt.kind === "PRE" ? null : result.passed, weakLessons: weak as unknown as Prisma.InputJsonValue, submittedAt: now, durationSeconds: seconds } });
  // Revision cards come from what the learner has seen, starting tomorrow.
  await seedCards(companyId, employee.id, course.id, ordered.map((q) => q.stableKey));
  let certificate: { certNo: string } | null = null;
  const en = attempt.enrolment;
  if (attempt.kind === "PRE") {
    await prisma.trainingEnrolment.update({ where: { id: en.id }, data: { preScore: result.score } });
  } else if (attempt.kind === "FINAL") {
    await audit(ctx, "TrainingQuizAttempt", attempt.id, result.passed ? "TRAINING_QUIZ_PASSED" : "TRAINING_QUIZ_FAILED", { employeeId: employee.id, courseId: course.id, course: course.title, attemptNo: attempt.attemptNo, score: result.score, passMark, startedAt: attempt.startedAt.toISOString(), submittedAt: now.toISOString(), durationSeconds: seconds, weakLessons: weak.map((w) => w.title) });
    if (result.passed) certificate = await requestCertificate(ctx, companyId, employee, en.id, course, attempt.id, attempt.revisionId, now);
  }
  const review = attempt.kind === "FINAL" ? null : ordered.map((q) => ({ id: q.id, correct: !result.wrongIds.includes(q.id), answer: q.answer, explanation: q.explanation }));
  const fresh = await prisma.trainingEnrolment.findUnique({ where: { id: en.id } });
  return {
    kind: attempt.kind, score: result.score, correct: result.correct, total: result.total, passed: result.passed, passMark, weakLessons: weak, review, certificate,
    attemptsLeft: fresh ? attemptsLeft(course.maxAttempts, fresh.attemptsUsed, fresh.attemptsReset) : 0, seconds,
  };
}

async function requestCertificate(ctx: RequestContext, companyId: string, employee: TrainingEmployee, enrolmentId: string, course: { id: string; code: string; title: string }, attemptId: string, revisionId: string, now: Date) {
  const settings = await settingsFor(companyId);
  const prefix = settings.certificatePrefix || ctx.companyInternalCode || "FX";
  let certNo = certificateNumber(prefix, course.code, now);
  for (let i = 0; i < 5 && (await prisma.trainingCertificate.findUnique({ where: { certNo } })); i++) certNo = certificateNumber(prefix, course.code, now);
  await prisma.$transaction([
    prisma.trainingEnrolment.update({ where: { id: enrolmentId }, data: { status: "AWAITING_APPROVAL", completedAt: now } }),
    prisma.trainingCertificate.create({ data: { companyId, certNo, employeeId: employee.id, courseId: course.id, revisionId, enrolmentId, attemptId, status: "PENDING", requestedAt: now } }),
  ]);
  await audit(ctx, "TrainingCertificate", certNo, "TRAINING_CERTIFICATE_REQUESTED", { employeeId: employee.id, courseId: course.id, course: course.title, certNo, completedAt: now.toISOString() });
  const message = `${fullName(employee)} passed "${course.title}". The certificate is waiting for your approval.`;
  if (employee.managerUserId) await notifyUser(companyId, employee.managerUserId, "TRAINING_CERTIFICATE_REQUESTED", "Certificate to approve", message, "/tech-training/approvals");
  else await notifyAdminsAndManagers(companyId, "TRAINING_CERTIFICATE_REQUESTED", "Certificate to approve", message, "/tech-training/approvals");
  return { certNo };
}

// ---------------------------------------------------------------------------
// Mentor questions
// ---------------------------------------------------------------------------

export async function askMentor(ctx: RequestContext, courseId: string, lessonKey: string, raw: unknown) {
  const companyId = learnerCtx(ctx, "WRITE");
  const employee = await requireEmployee(ctx);
  const course = await visibleCourse(companyId, courseId, employee.id, false);
  const question = z.object({ question: z.string().trim().min(5, "Type your question.").max(1500) }).parse(raw).question;
  const lesson = course.liveRevisionId ? await prisma.trainingLesson.findFirst({ where: { revisionId: course.liveRevisionId, stableKey: lessonKey }, select: { title: true } }) : null;
  if (!lesson) notFound("lesson");
  const q = await prisma.trainingMentorQuestion.create({ data: { companyId, courseId, lessonKey, employeeId: employee.id, question } });
  await audit(ctx, "TrainingMentorQuestion", q.id, "TRAINING_MENTOR_QUESTION_ASKED", { employeeId: employee.id, courseId, lesson: lesson.title });
  const msg = `${fullName(employee)} asked about "${lesson.title}" (${course.title}).`;
  if (employee.managerUserId) await notifyUser(companyId, employee.managerUserId, "TRAINING_MENTOR_QUESTION", "Training question", msg, "/tech-training/approvals?tab=mentor");
  else await notifyAdminsAndManagers(companyId, "TRAINING_MENTOR_QUESTION", "Training question", msg, "/tech-training/approvals?tab=mentor");
  return { id: q.id };
}

// ---------------------------------------------------------------------------
// Revision cards (spaced review of courses already done)
// ---------------------------------------------------------------------------

async function seedCards(companyId: string, employeeId: string, courseId: string, questionKeys: string[]) {
  if (!questionKeys.length) return;
  const existing = new Set((await prisma.trainingCardReview.findMany({ where: { employeeId, questionKey: { in: questionKeys } }, select: { questionKey: true } })).map((c) => c.questionKey));
  const fresh = questionKeys.filter((k) => !existing.has(k));
  if (fresh.length) await prisma.trainingCardReview.createMany({ data: fresh.map((questionKey) => ({ companyId, employeeId, questionKey, courseId, box: 1, dueAt: addDays(new Date(), 1) })), skipDuplicates: true });
}

async function cardsDueCount(employeeId: string) {
  return prisma.trainingCardReview.count({ where: { employeeId, dueAt: { lte: new Date() } } });
}

export async function cardsDue(ctx: RequestContext) {
  const companyId = learnerCtx(ctx);
  const employee = await requireEmployee(ctx);
  const due = await prisma.trainingCardReview.findMany({ where: { employeeId: employee.id, dueAt: { lte: new Date() } }, orderBy: { dueAt: "asc" }, take: 10 });
  const courses = await prisma.trainingCourse.findMany({ where: { companyId, id: { in: [...new Set(due.map((d) => d.courseId))] } }, select: { id: true, title: true, liveRevisionId: true } });
  const cards = [];
  for (const d of due) {
    const course = courses.find((c) => c.id === d.courseId);
    if (!course?.liveRevisionId) continue;
    const q = await prisma.trainingQuestion.findFirst({ where: { revisionId: course.liveRevisionId, stableKey: d.questionKey } });
    if (!q) { await prisma.trainingCardReview.delete({ where: { id: d.id } }); continue; }
    cards.push({ questionKey: d.questionKey, course: course.title, prompt: q.prompt, options: q.options, multi: q.answer.length > 1, box: d.box });
  }
  return { cards, total: await cardsDueCount(employee.id) };
}

export async function answerCard(ctx: RequestContext, raw: unknown) {
  learnerCtx(ctx, "WRITE");
  const employee = await requireEmployee(ctx);
  const input = z.object({ questionKey: z.string().max(80), given: z.array(z.number().int().min(0).max(7)).max(8) }).parse(raw);
  const card = await prisma.trainingCardReview.findUnique({ where: { employeeId_questionKey: { employeeId: employee.id, questionKey: input.questionKey } } });
  if (!card) notFound("card");
  const course = await prisma.trainingCourse.findUnique({ where: { id: card.courseId }, select: { liveRevisionId: true } });
  const q = course?.liveRevisionId ? await prisma.trainingQuestion.findFirst({ where: { revisionId: course.liveRevisionId, stableKey: input.questionKey } }) : null;
  if (!q) notFound("card");
  const correct = markQuiz([{ id: q.id, answer: q.answer, lessonKey: q.lessonKey }], { [q.id]: input.given }, 100).passed;
  const next = nextCardBox(card.box, correct);
  await prisma.trainingCardReview.update({ where: { id: card.id }, data: { box: next.box, dueAt: addDays(new Date(), next.days) } });
  return { correct, answer: q.answer, explanation: q.explanation, nextInDays: next.days };
}
