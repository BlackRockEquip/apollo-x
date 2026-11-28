import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { readStoredBlob } from "@/lib/attachments/blob-store";
import { TrainingError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import { notifyCompanyAdmins, notifyUser } from "@/lib/notifications/service";
import { audit, can, checkId, iso, myEmployee, notFound, requireTraining, settingsFor, userNames } from "@/lib/training/access";
import { lessonOrder } from "@/lib/training/content";
import { addDays, attemptsLeft, formatElapsed, fullName, maskIdNumber, revisionLabel, workingDaysBetween } from "@/lib/training/model";

// ---------------------------------------------------------------------------
// Approvals (2026-11-28). Passing the final quiz creates a PENDING certificate; the employee's manager or a Company Admin approves
// it (or sends it back with a comment). Nobody approves their own certificate, and a Manager approves only their own team (or
// people with no manager set). Also here: practical sign-offs, mentor answers and the 30-day effectiveness review (ISO 9001 7.2 c).
// ---------------------------------------------------------------------------

function approver(ctx: RequestContext, intent: "READ" | "WRITE" = "READ") {
  return requireTraining(ctx, "TRAINING_APPROVE", intent);
}

const isAdmin = (ctx: RequestContext) => ctx.tenantRole === "COMPANY_ADMIN";

function assertMayDecide(ctx: RequestContext, employee: { userId: string | null; managerUserId: string | null }) {
  if (employee.userId && employee.userId === ctx.userId) throw new TrainingError("OWN_RECORD", "You cannot approve or sign off your own training. Ask another manager or a Company Admin.", 403);
  if (!isAdmin(ctx) && employee.managerUserId && employee.managerUserId !== ctx.userId) throw new TrainingError("NOT_YOUR_TEAM", "This person reports to another manager. Their manager or a Company Admin decides.", 403);
}

/** Pending certificates older than the escalation period go to the Company Admins once. */
async function escalate(companyId: string) {
  const settings = await settingsFor(companyId);
  const pending = await prisma.trainingCertificate.findMany({ where: { companyId, status: "PENDING", escalatedAt: null }, include: { employee: true, course: { select: { title: true } } } });
  const now = new Date();
  for (const c of pending) {
    if (workingDaysBetween(c.requestedAt, now) < settings.escalationDays) continue;
    await prisma.trainingCertificate.update({ where: { id: c.id }, data: { escalatedAt: now } });
    await notifyCompanyAdmins(companyId, "TRAINING_CERTIFICATE_REQUESTED", "Certificate approval overdue", `${fullName(c.employee)}'s certificate for "${c.course.title}" has waited more than ${settings.escalationDays} working days.`, "/tech-training/approvals");
  }
}

export async function approvalQueue(ctx: RequestContext) {
  const companyId = approver(ctx);
  await escalate(companyId).catch(() => {});
  const certs = await prisma.trainingCertificate.findMany({ where: { companyId, status: "PENDING" }, include: { employee: { include: { position: { select: { name: true } } } }, course: { select: { title: true, code: true, maxAttempts: true, passMark: true } } }, orderBy: { requestedAt: "asc" } });
  const enrolments = await prisma.trainingEnrolment.findMany({ where: { id: { in: certs.map((c) => c.enrolmentId) } }, select: { id: true, attemptsUsed: true, startedAt: true, completedAt: true } });
  const items = certs.map((c) => {
    const en = enrolments.find((e) => e.id === c.enrolmentId);
    const mine = !c.employee.managerUserId || c.employee.managerUserId === ctx.userId || isAdmin(ctx);
    return {
      certId: c.id, certNo: c.certNo, employee: fullName(c.employee), position: c.employee.position?.name ?? "", course: c.course.title, requestedAt: iso(c.requestedAt),
      attempts: en?.attemptsUsed ?? 0, elapsed: formatElapsed(en?.startedAt, en?.completedAt), escalated: !!c.escalatedAt, canDecide: mine && c.employee.userId !== ctx.userId,
    };
  });
  const [signoffs, mentor, reviews] = await Promise.all([signoffsDue(ctx, companyId), mentorQueue(companyId), reviewsDue(companyId)]);
  return { items, signoffs, mentor, reviews, isAdmin: isAdmin(ctx) };
}

export async function certificateReview(ctx: RequestContext, certId: string) {
  const companyId = approver(ctx);
  checkId(certId, "certificate");
  const c = await prisma.trainingCertificate.findFirst({ where: { id: certId, companyId }, include: { employee: { include: { position: { select: { name: true } } } }, course: true } });
  if (!c) notFound("certificate");
  const en = await prisma.trainingEnrolment.findUnique({ where: { id: c.enrolmentId }, include: { attempts: { orderBy: { startedAt: "asc" } }, progress: true, signoffs: true } });
  if (!en) notFound("certificate");
  const revision = await prisma.trainingRevision.findUnique({ where: { id: c.revisionId } });
  const lessons = await prisma.trainingLesson.findMany({ where: { revisionId: c.revisionId }, orderBy: lessonOrder, select: { stableKey: true, title: true, chapterKey: true, chapterTitle: true, practicalTask: true, safetyPoint: true } });
  const done = new Set(en.progress.filter((p) => p.completedAt).map((p) => p.lessonKey));
  const safety = new Set(en.progress.filter((p) => p.safetyConfirmedAt).map((p) => p.lessonKey));
  const names = await userNames([c.employee.managerUserId, ...en.signoffs.map((s) => s.signedById)]);
  const signer = await prisma.trainingSigner.findUnique({ where: { companyId_userId: { companyId, userId: ctx.userId } } });
  const checks = new Map<string, { best: number; tries: number; title: string }>();
  for (const a of en.attempts.filter((a) => a.kind === "CHECK" && a.submittedAt)) {
    const cur = checks.get(a.chapterKey) ?? { best: 0, tries: 0, title: lessons.find((l) => l.chapterKey === a.chapterKey)?.chapterTitle ?? a.chapterKey };
    checks.set(a.chapterKey, { ...cur, best: Math.max(cur.best, a.score ?? 0), tries: cur.tries + 1 });
  }
  return {
    certId: c.id, certNo: c.certNo, status: c.status, requestedAt: iso(c.requestedAt), escalated: !!c.escalatedAt,
    employee: { id: c.employee.id, name: fullName(c.employee), position: c.employee.position?.name ?? "", idNumber: can(ctx, "TRAINING_EMPLOYEES_MANAGE") ? c.employee.idNumber : maskIdNumber(c.employee.idNumber), manager: c.employee.managerUserId ? names.get(c.employee.managerUserId) ?? "" : "" },
    course: { id: c.course.id, title: c.course.title, code: c.course.code, revision: revision ? revisionLabel(revision) : "", docNumber: c.course.docNumber, passMark: c.course.passMark, maxAttempts: c.course.maxAttempts },
    timing: { startedAt: iso(en.startedAt), completedAt: iso(en.completedAt), elapsed: formatElapsed(en.startedAt, en.completedAt), activeSeconds: en.activeSeconds },
    preScore: en.preScore,
    attempts: en.attempts.filter((a) => a.kind === "FINAL").map((a) => ({ no: a.attemptNo, startedAt: iso(a.startedAt), submittedAt: iso(a.submittedAt), seconds: a.durationSeconds, score: a.score, passed: a.passed, weak: Array.isArray(a.weakLessons) ? (a.weakLessons as Array<{ title: string }>).map((w) => w.title) : [] })),
    attemptsUsed: en.attemptsUsed, attemptsLeft: attemptsLeft(c.course.maxAttempts, en.attemptsUsed, en.attemptsReset),
    lessons: { total: lessons.length, done: lessons.filter((l) => done.has(l.stableKey)).length, safetyPoints: lessons.filter((l) => l.safetyPoint).length, safetyConfirmed: lessons.filter((l) => l.safetyPoint && safety.has(l.stableKey)).length },
    checks: [...checks.values()],
    practical: lessons.filter((l) => l.practicalTask).map((l) => { const s = en.signoffs.find((x) => x.lessonKey === l.stableKey); return { lessonKey: l.stableKey, lesson: l.title, task: l.practicalTask, signedBy: s ? names.get(s.signedById) ?? "" : null, signedAt: iso(s?.signedAt), jobRef: s?.jobRef ?? "" }; }),
    enrolmentId: en.id,
    signAs: { name: ctx.displayName, title: signer?.title || (ctx.tenantRole === "COMPANY_ADMIN" ? "Company Admin" : "Manager"), hasSignature: !!signer?.signatureData },
    canDecide: c.status === "PENDING" && (() => { try { assertMayDecide(ctx, c.employee); return true; } catch { return false; } })(),
    whyNot: c.employee.userId === ctx.userId ? "This is your own certificate." : !isAdmin(ctx) && c.employee.managerUserId && c.employee.managerUserId !== ctx.userId ? "This person reports to another manager." : null,
  };
}

const decisionInput = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().trim().max(2000).optional().default(""),
  checklist: z.record(z.string(), z.boolean()).optional().default({}),
});

export async function decideCertificate(ctx: RequestContext, certId: string, raw: unknown) {
  const companyId = approver(ctx, "WRITE");
  checkId(certId, "certificate");
  const input = decisionInput.parse(raw);
  const c = await prisma.trainingCertificate.findFirst({ where: { id: certId, companyId }, include: { employee: true, course: { select: { title: true, id: true } } } });
  if (!c) notFound("certificate");
  if (c.status !== "PENDING") throw new TrainingError("DECIDED", "This certificate has already been decided.", 409);
  assertMayDecide(ctx, c.employee);
  const now = new Date();
  if (input.decision === "REJECT") {
    if (input.comment.length < 5) throw new TrainingError("COMMENT", "Say why it is sent back, so the employee knows what to do.");
    await prisma.$transaction([
      prisma.trainingCertificate.update({ where: { id: c.id }, data: { status: "REJECTED", decidedById: ctx.userId, decidedAt: now, decisionComment: input.comment, checklist: input.checklist } }),
      prisma.trainingEnrolment.update({ where: { id: c.enrolmentId }, data: { status: "IN_PROGRESS" } }),
    ]);
    await audit(ctx, "TrainingCertificate", c.certNo, "TRAINING_CERTIFICATE_REJECTED", { employeeId: c.employeeId, courseId: c.courseId, course: c.course.title, certNo: c.certNo, checklist: input.checklist }, input.comment);
    if (c.employee.userId) await notifyUser(companyId, c.employee.userId, "TRAINING_CERTIFICATE_DECIDED", "Certificate sent back", `Your certificate for "${c.course.title}" was sent back: ${input.comment.slice(0, 200)}`, `/tech-training/course/${c.courseId}`);
    return { ok: true, status: "REJECTED" };
  }
  const settings = await settingsFor(companyId);
  const signer = await prisma.trainingSigner.findUnique({ where: { companyId_userId: { companyId, userId: ctx.userId } } });
  await prisma.$transaction([
    prisma.trainingCertificate.update({
      where: { id: c.id },
      data: {
        status: "VALID", decidedById: ctx.userId, decidedAt: now, decisionComment: input.comment || null, checklist: input.checklist,
        signatoryName: ctx.displayName, signatoryTitle: signer?.title || (ctx.tenantRole === "COMPANY_ADMIN" ? "Company Admin" : "Manager"),
        signatureData: signer?.signatureData ?? null, signatureMime: signer?.signatureMime ?? null, reviewDueAt: addDays(now, settings.effectivenessDays),
      },
    }),
    prisma.trainingEnrolment.update({ where: { id: c.enrolmentId }, data: { status: "CERTIFIED", updateRequired: false } }),
  ]);
  await audit(ctx, "TrainingCertificate", c.certNo, "TRAINING_CERTIFICATE_APPROVED", { employeeId: c.employeeId, courseId: c.courseId, course: c.course.title, certNo: c.certNo, checklist: input.checklist, comment: input.comment });
  if (c.employee.userId) await notifyUser(companyId, c.employee.userId, "TRAINING_CERTIFICATE_DECIDED", "Certificate approved", `Your certificate for "${c.course.title}" was approved.`, `/tech-training/certificates/${encodeURIComponent(c.certNo)}`);
  return { ok: true, status: "VALID", certNo: c.certNo };
}

export async function resetAttempts(ctx: RequestContext, enrolmentId: string, raw: unknown) {
  const companyId = approver(ctx, "WRITE");
  checkId(enrolmentId, "enrolment");
  const reason = z.object({ reason: z.string().trim().min(5, "Say why more attempts are given (e.g. went through the lessons together).").max(500) }).parse(raw).reason;
  const en = await prisma.trainingEnrolment.findFirst({ where: { id: enrolmentId, companyId }, include: { employee: true, course: { select: { title: true, maxAttempts: true } } } });
  if (!en) notFound("enrolment");
  assertMayDecide(ctx, en.employee);
  await prisma.trainingEnrolment.update({ where: { id: en.id }, data: { attemptsReset: { increment: 1 } } });
  await audit(ctx, "TrainingEnrolment", en.id, "TRAINING_ATTEMPTS_RESET", { employeeId: en.employeeId, courseId: en.courseId, course: en.course.title, attemptsUsed: en.attemptsUsed, extra: en.course.maxAttempts }, reason);
  if (en.employee.userId) await notifyUser(companyId, en.employee.userId, "TRAINING_COURSE_ASSIGNED", "More quiz attempts", `You have ${en.course.maxAttempts} more attempt${en.course.maxAttempts === 1 ? "" : "s"} at the "${en.course.title}" quiz.`, `/tech-training/course/${en.courseId}`);
  return { ok: true };
}

/** Revoke a valid certificate (Company Admins). It stays on record as Revoked, with the reason. */
export async function revokeCertificate(ctx: RequestContext, certId: string, raw: unknown) {
  const companyId = requireTraining(ctx, "TRAINING_EMPLOYEES_MANAGE", "WRITE");
  checkId(certId, "certificate");
  const reason = z.object({ reason: z.string().trim().min(5, "Give the reason for revoking.").max(500) }).parse(raw).reason;
  const c = await prisma.trainingCertificate.findFirst({ where: { id: certId, companyId }, include: { course: { select: { title: true } } } });
  if (!c) notFound("certificate");
  if (c.status !== "VALID") throw new TrainingError("NOT_VALID", "Only a valid certificate can be revoked.", 409);
  await prisma.$transaction([
    prisma.trainingCertificate.update({ where: { id: c.id }, data: { status: "REVOKED", revokedById: ctx.userId, revokedAt: new Date(), revokedReason: reason } }),
    prisma.trainingEnrolment.update({ where: { id: c.enrolmentId }, data: { status: "IN_PROGRESS", attemptsReset: { increment: 1 } } }),
  ]);
  await audit(ctx, "TrainingCertificate", c.certNo, "TRAINING_CERTIFICATE_REVOKED", { employeeId: c.employeeId, courseId: c.courseId, course: c.course.title, certNo: c.certNo }, reason);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Practical sign-offs
// ---------------------------------------------------------------------------

async function signoffsDue(ctx: RequestContext, companyId: string) {
  const enrolments = await prisma.trainingEnrolment.findMany({ where: { companyId, status: { in: ["IN_PROGRESS", "AWAITING_APPROVAL"] }, employee: { status: "ACTIVE" } }, include: { employee: true, course: { select: { title: true, liveRevisionId: true } }, signoffs: { select: { lessonKey: true } } } });
  const revIds = [...new Set(enrolments.map((e) => e.course.liveRevisionId).filter((v): v is string => !!v))];
  const tasks = await prisma.trainingLesson.findMany({ where: { revisionId: { in: revIds }, practicalTask: { not: "" } }, select: { revisionId: true, stableKey: true, title: true, practicalTask: true } });
  const out = [];
  for (const en of enrolments) {
    for (const t of tasks.filter((t) => t.revisionId === en.course.liveRevisionId)) {
      if (en.signoffs.some((s) => s.lessonKey === t.stableKey)) continue;
      out.push({ enrolmentId: en.id, lessonKey: t.stableKey, employee: fullName(en.employee), course: en.course.title, lesson: t.title, task: t.practicalTask, canSign: en.employee.userId !== ctx.userId && (isAdmin(ctx) || !en.employee.managerUserId || en.employee.managerUserId === ctx.userId) });
    }
  }
  return out.slice(0, 200);
}

export async function signOffPractical(ctx: RequestContext, raw: unknown) {
  const companyId = approver(ctx, "WRITE");
  const input = z.object({ enrolmentId: z.string(), lessonKey: z.string().max(80), jobRef: z.string().trim().max(60).optional().default(""), comment: z.string().trim().max(1000).optional().default("") }).parse(raw);
  checkId(input.enrolmentId, "enrolment");
  const en = await prisma.trainingEnrolment.findFirst({ where: { id: input.enrolmentId, companyId }, include: { employee: true, course: { select: { title: true, liveRevisionId: true } } } });
  if (!en) notFound("enrolment");
  assertMayDecide(ctx, en.employee);
  const lesson = en.course.liveRevisionId ? await prisma.trainingLesson.findFirst({ where: { revisionId: en.course.liveRevisionId, stableKey: input.lessonKey, practicalTask: { not: "" } } }) : null;
  if (!lesson) notFound("practical task");
  await prisma.trainingSignoff.upsert({ where: { enrolmentId_lessonKey: { enrolmentId: en.id, lessonKey: input.lessonKey } }, create: { companyId, enrolmentId: en.id, lessonKey: input.lessonKey, jobRef: input.jobRef, comment: input.comment, signedById: ctx.userId }, update: { jobRef: input.jobRef, comment: input.comment, signedById: ctx.userId, signedAt: new Date() } });
  await audit(ctx, "TrainingSignoff", en.id, "TRAINING_PRACTICAL_SIGNED_OFF", { employeeId: en.employeeId, courseId: en.courseId, lesson: lesson.title, task: lesson.practicalTask, jobRef: input.jobRef });
  if (en.employee.userId) await notifyUser(companyId, en.employee.userId, "TRAINING_CERTIFICATE_DECIDED", "Practical task signed off", `"${lesson.title}" was signed off by ${ctx.displayName}.`, `/tech-training/course/${en.courseId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Mentor answers
// ---------------------------------------------------------------------------

async function mentorQueue(companyId: string) {
  const rows = await prisma.trainingMentorQuestion.findMany({ where: { companyId }, orderBy: [{ answeredAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }], take: 60, include: { course: { select: { title: true, liveRevisionId: true } } } });
  const employees = await prisma.trainingEmployee.findMany({ where: { id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, firstName: true, surname: true } });
  const lessons = await prisma.trainingLesson.findMany({ where: { revisionId: { in: rows.map((r) => r.course.liveRevisionId).filter((v): v is string => !!v) }, stableKey: { in: rows.map((r) => r.lessonKey) } }, select: { stableKey: true, title: true } });
  const names = await userNames(rows.map((r) => r.answeredById));
  return rows.map((r) => {
    const e = employees.find((x) => x.id === r.employeeId);
    return { id: r.id, course: r.course.title, courseId: r.courseId, lessonKey: r.lessonKey, lesson: lessons.find((l) => l.stableKey === r.lessonKey)?.title ?? "", employee: e ? fullName(e) : "", question: r.question, answer: r.answer, answeredBy: r.answeredById ? names.get(r.answeredById) ?? "" : null, askedAt: iso(r.createdAt), answeredAt: iso(r.answeredAt) };
  });
}

export async function answerMentor(ctx: RequestContext, questionId: string, raw: unknown) {
  const companyId = approver(ctx, "WRITE");
  checkId(questionId, "question");
  const answer = z.object({ answer: z.string().trim().min(2, "Type the answer.").max(3000) }).parse(raw).answer;
  const q = await prisma.trainingMentorQuestion.findFirst({ where: { id: questionId, companyId }, include: { course: { select: { title: true } } } });
  if (!q) notFound("question");
  await prisma.trainingMentorQuestion.update({ where: { id: q.id }, data: { answer, answeredById: ctx.userId, answeredAt: new Date() } });
  await audit(ctx, "TrainingMentorQuestion", q.id, "TRAINING_MENTOR_ANSWERED", { employeeId: q.employeeId, courseId: q.courseId });
  const e = await prisma.trainingEmployee.findUnique({ where: { id: q.employeeId }, select: { userId: true } });
  if (e?.userId) await notifyUser(companyId, e.userId, "TRAINING_MENTOR_QUESTION", "Your question was answered", `${ctx.displayName} answered your question on "${q.course.title}".`, `/tech-training/lesson/${q.courseId}/${encodeURIComponent(q.lessonKey)}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Effectiveness review (ISO 9001 7.2 c): is the skill used on the job?
// ---------------------------------------------------------------------------

async function reviewsDue(companyId: string) {
  const rows = await prisma.trainingCertificate.findMany({ where: { companyId, status: "VALID", reviewedAt: null, reviewDueAt: { lte: addDays(new Date(), 7) } }, include: { employee: true, course: { select: { title: true } } }, orderBy: { reviewDueAt: "asc" }, take: 100 });
  return rows.map((c) => ({ certId: c.id, certNo: c.certNo, employee: fullName(c.employee), course: c.course.title, dueAt: iso(c.reviewDueAt), overdue: !!c.reviewDueAt && c.reviewDueAt < new Date() }));
}

export async function recordEffectiveness(ctx: RequestContext, certId: string, raw: unknown) {
  const companyId = approver(ctx, "WRITE");
  checkId(certId, "certificate");
  const input = z.object({ competent: z.boolean(), comment: z.string().trim().min(5, "Say what you saw on the job.").max(2000) }).parse(raw);
  const c = await prisma.trainingCertificate.findFirst({ where: { id: certId, companyId }, include: { employee: true, course: { select: { title: true } } } });
  if (!c) notFound("certificate");
  assertMayDecide(ctx, c.employee);
  await prisma.trainingCertificate.update({ where: { id: c.id }, data: { reviewedAt: new Date(), reviewedById: ctx.userId, reviewCompetent: input.competent, reviewComment: input.comment } });
  await audit(ctx, "TrainingCertificate", c.certNo, "TRAINING_EFFECTIVENESS_REVIEWED", { employeeId: c.employeeId, courseId: c.courseId, course: c.course.title, competent: input.competent, comment: input.comment });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Certificate view and verification
// ---------------------------------------------------------------------------

async function companyLogo(companyId: string): Promise<string | null> {
  try {
    const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { logoMimeType: true, logoData: true } });
    if (!settings?.logoMimeType || settings.logoMimeType === "image/svg+xml") return null;
    const attachment = await prisma.attachment.findFirst({ where: { companyId, ownerType: "COMPANY_LOGO", ownerId: companyId }, select: { id: true } });
    if (attachment) {
      try { const stored = await readStoredBlob(companyId, attachment.id); return `data:${settings.logoMimeType};base64,${stored.data.toString("base64")}`; } catch { /* fall back to the copy in the settings */ }
    }
    return settings.logoData ? `data:${settings.logoMimeType};base64,${Buffer.from(settings.logoData).toString("base64")}` : null;
  } catch {
    return null;
  }
}

/** The certificate as printed: carries the logo of the company the employee is registered to (from that company's own settings). */
export async function certificateView(ctx: RequestContext, certNo: string) {
  const companyId = requireTraining(ctx, "TRAINING_VIEW");
  const c = await prisma.trainingCertificate.findFirst({ where: { certNo, companyId }, include: { employee: true, course: true } });
  if (!c) notFound("certificate");
  const me = await myEmployee(ctx);
  const own = me?.id === c.employeeId;
  if (!own && !can(ctx, "TRAINING_APPROVE") && !can(ctx, "TRAINING_REPORTS_VIEW")) notFound("certificate");
  const [revision, company] = await Promise.all([
    prisma.trainingRevision.findUnique({ where: { id: c.revisionId } }),
    prisma.company.findUnique({ where: { id: c.employee.companyId }, select: { legalName: true, tradingName: true } }),
  ]);
  const en = await prisma.trainingEnrolment.findUnique({ where: { id: c.enrolmentId }, select: { completedAt: true, startedAt: true } });
  return {
    certNo: c.certNo, status: c.status, holder: fullName(c.employee), course: c.course.title, courseCode: c.course.code, revision: revision ? revisionLabel(revision) : "", docNumber: c.course.docNumber,
    completedAt: iso(en?.completedAt ?? c.requestedAt), startedAt: iso(en?.startedAt), approvedAt: iso(c.decidedAt), signatoryName: c.signatoryName, signatoryTitle: c.signatoryTitle,
    signature: c.signatureData && c.signatureMime ? `data:${c.signatureMime};base64,${Buffer.from(c.signatureData).toString("base64")}` : null,
    companyName: company?.tradingName || company?.legalName || ctx.companyName || "", logo: await companyLogo(c.employee.companyId),
    revokedReason: c.revokedReason, revokedAt: iso(c.revokedAt), own,
  };
}

/** Any signed-in Flo X user can check a certificate number: holder, course, dates and whether it is valid. */
export async function verifyCertificate(certNo: string) {
  const c = await prisma.trainingCertificate.findUnique({ where: { certNo }, include: { employee: { select: { firstName: true, surname: true, companyId: true } }, course: { select: { title: true } } } });
  if (!c || c.status === "PENDING" || c.status === "REJECTED") return { found: false as const, certNo };
  const company = await prisma.company.findUnique({ where: { id: c.employee.companyId }, select: { legalName: true, tradingName: true } });
  return { found: true as const, certNo: c.certNo, holder: fullName(c.employee), course: c.course.title, company: company?.tradingName || company?.legalName || "", approvedAt: iso(c.decidedAt), status: c.status, revokedAt: iso(c.revokedAt) };
}
