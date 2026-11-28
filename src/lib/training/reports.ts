import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { TrainingError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import { audit, can, checkId, iso, notFound, requireTraining, settingsFor, userNames } from "@/lib/training/access";
import { addMonths, formatElapsed, formatSeconds, fullName, maskIdNumber, matrixCell, revisionLabel, toCsv, troubleQuestions } from "@/lib/training/model";

// ---------------------------------------------------------------------------
// Training records and ISO reporting (2026-11-28). ISO 9001:2015 clause 7.2 asks for documented evidence of competence; 7.5 for
// control of documents and records. The training is non-credit-bearing, so the SETA list marks it as such.
// ---------------------------------------------------------------------------

function reports(ctx: RequestContext) {
  return requireTraining(ctx, "TRAINING_REPORTS_VIEW");
}

/** One employee's full training record: profile, every course with dates, attempts and approvals, and the audit trail. */
export async function employeeRecord(ctx: RequestContext, employeeId: string) {
  const companyId = reports(ctx);
  checkId(employeeId, "employee");
  const e = await prisma.trainingEmployee.findFirst({ where: { id: employeeId, companyId }, include: { position: true } });
  if (!e) notFound("employee");
  const [enrolments, certs, events] = await Promise.all([
    prisma.trainingEnrolment.findMany({ where: { employeeId }, include: { course: { select: { id: true, title: true, code: true, completionMode: true, status: true } }, attempts: { where: { kind: "FINAL" }, orderBy: { startedAt: "asc" } } }, orderBy: { createdAt: "asc" } }),
    prisma.trainingCertificate.findMany({ where: { employeeId }, orderBy: { requestedAt: "desc" } }),
    prisma.auditEvent.findMany({ where: { companyId, module: "TECH_TRAINING", afterData: { path: ["employeeId"], equals: employeeId } }, orderBy: { occurredAt: "desc" }, take: 300, select: { id: true, occurredAt: true, action: true, actorId: true, afterData: true, reason: true } }),
  ]);
  const revisions = await prisma.trainingRevision.findMany({ where: { id: { in: [...enrolments.map((en) => en.revisionId), ...certs.map((c) => c.revisionId)].filter((v): v is string => !!v) } }, select: { id: true, major: true, minor: true } });
  const names = await userNames([...certs.flatMap((c) => [c.decidedById, c.reviewedById, c.revokedById]), ...events.map((ev) => ev.actorId), e.managerUserId]);
  const required = e.position?.requiredCourseIds ?? [];
  const now = new Date();
  const courses = enrolments.map((en) => {
    const cert = certs.find((c) => c.enrolmentId === en.id && c.status === "VALID") ?? certs.find((c) => c.enrolmentId === en.id);
    const finals = en.attempts;
    const best = finals.reduce((m, a) => Math.max(m, a.score ?? 0), 0);
    const rev = revisions.find((r) => r.id === (cert?.revisionId ?? en.revisionId));
    return {
      enrolmentId: en.id, courseId: en.courseId, course: en.course.title, code: en.course.code, revision: rev ? revisionLabel(rev) : "", required: required.includes(en.courseId), mode: en.course.completionMode,
      status: en.status, dueDate: iso(en.dueDate), overdue: !!en.dueDate && en.dueDate < now && !["CERTIFIED", "ACKNOWLEDGED", "WITHDRAWN"].includes(en.status),
      startedAt: iso(en.startedAt), completedAt: iso(en.completedAt), elapsed: formatElapsed(en.startedAt, en.completedAt), active: formatSeconds(en.activeSeconds), activeSeconds: en.activeSeconds,
      attempts: en.attemptsUsed, finalScore: finals.find((a) => a.passed)?.score ?? (finals.length ? best : null), preScore: en.preScore,
      attemptList: finals.map((a) => ({ no: a.attemptNo, startedAt: iso(a.startedAt), submittedAt: iso(a.submittedAt), seconds: a.durationSeconds, score: a.score, passed: a.passed })),
      certificate: cert ? { id: cert.id, certNo: cert.certNo, status: cert.status, approvedBy: cert.decidedById ? names.get(cert.decidedById) ?? "" : "", approvedAt: iso(cert.decidedAt), reviewDueAt: iso(cert.reviewDueAt), reviewedAt: iso(cert.reviewedAt), reviewedBy: cert.reviewedById ? names.get(cert.reviewedById) ?? "" : "", competent: cert.reviewCompetent, reviewComment: cert.reviewComment, revokedReason: cert.revokedReason } : null,
      acknowledgedAt: iso(en.acknowledgedAt), withdrawnReason: en.withdrawnReason, updateRequired: en.updateRequired,
    };
  });
  const finished = courses.filter((c) => c.status === "CERTIFIED");
  return {
    employee: {
      id: e.id, firstName: e.firstName, surname: e.surname, name: fullName(e), idNumber: can(ctx, "TRAINING_EMPLOYEES_MANAGE") ? e.idNumber : maskIdNumber(e.idNumber), email: e.email, employeeNo: e.employeeNo ?? "",
      position: e.position?.name ?? "", manager: e.managerUserId ? names.get(e.managerUserId) ?? "" : "", status: e.status, hasLogin: !!e.userId,
    },
    summary: {
      requiredDone: required.filter((id) => courses.some((c) => c.courseId === id && (c.status === "CERTIFIED" || c.status === "ACKNOWLEDGED"))).length, required: required.length,
      avgAttempts: finished.length ? Math.round((10 * finished.reduce((n, c) => n + c.attempts, 0)) / finished.length) / 10 : null,
      activeSeconds: courses.reduce((n, c) => n + c.activeSeconds, 0), certificates: certs.filter((c) => c.status === "VALID").length,
    },
    courses,
    events: events.map((ev) => ({ id: ev.id, at: iso(ev.occurredAt), action: ev.action, by: ev.actorId ? names.get(ev.actorId) ?? "" : "System", data: ev.afterData, reason: ev.reason })),
    retentionYears: (await settingsFor(companyId)).retentionYears,
  };
}

/** Everyone with a profile, for the Training records list. */
export async function recordsList(ctx: RequestContext, q?: string) {
  const companyId = reports(ctx);
  const search = (q ?? "").trim();
  const rows = await prisma.trainingEmployee.findMany({
    where: { companyId, ...(search ? { OR: [{ firstName: { contains: search, mode: "insensitive" } }, { surname: { contains: search, mode: "insensitive" } }, { employeeNo: { contains: search, mode: "insensitive" } }] } : {}) },
    include: { position: { select: { name: true, requiredCourseIds: true } }, enrolments: { select: { status: true, courseId: true, attemptsUsed: true, dueDate: true } } },
    orderBy: [{ status: "asc" }, { surname: "asc" }],
  });
  const now = new Date();
  return {
    items: rows.map((e) => {
      const req = e.position?.requiredCourseIds ?? [];
      const done = req.filter((id) => e.enrolments.some((en) => en.courseId === id && (en.status === "CERTIFIED" || en.status === "ACKNOWLEDGED"))).length;
      return {
        id: e.id, name: fullName(e), position: e.position?.name ?? "", status: e.status, required: req.length, requiredDone: done,
        certified: e.enrolments.filter((en) => en.status === "CERTIFIED").length, inProgress: e.enrolments.filter((en) => en.status === "IN_PROGRESS" || en.status === "ASSIGNED").length,
        awaiting: e.enrolments.filter((en) => en.status === "AWAITING_APPROVAL").length, overdue: e.enrolments.filter((en) => en.dueDate && en.dueDate < now && !["CERTIFIED", "ACKNOWLEDGED", "WITHDRAWN"].includes(en.status)).length,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Compliance page
// ---------------------------------------------------------------------------

export async function compliance(ctx: RequestContext) {
  const companyId = reports(ctx);
  const now = new Date();
  const [employees, courses, enrolments, certs, actions, revisions] = await Promise.all([
    prisma.trainingEmployee.findMany({ where: { companyId, status: "ACTIVE" }, include: { position: { select: { name: true, requiredCourseIds: true } } }, orderBy: [{ surname: "asc" }, { firstName: "asc" }] }),
    prisma.trainingCourse.findMany({ where: { companyId, status: { in: ["PUBLISHED", "ARCHIVED"] } }, orderBy: [{ group: "asc" }, { title: "asc" }] }),
    prisma.trainingEnrolment.findMany({ where: { companyId }, include: { progress: { where: { completedAt: { not: null } }, select: { lessonKey: true } } } }),
    prisma.trainingCertificate.findMany({ where: { companyId, status: "VALID" }, select: { reviewDueAt: true, reviewedAt: true, reviewCompetent: true } }),
    prisma.trainingCorrectiveAction.findMany({ where: { companyId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 }),
    prisma.trainingRevision.findMany({ where: { companyId, status: "PUBLISHED" }, select: { id: true, courseId: true, major: true, minor: true, publishedAt: true, publishedById: true } }),
  ]);
  const lessonCounts = await prisma.trainingLesson.groupBy({ by: ["revisionId"], where: { revisionId: { in: revisions.map((r) => r.id) } }, _count: true });
  const names = await userNames([...revisions.map((r) => r.publishedById), ...courses.map((c) => c.ownerUserId), ...actions.map((a) => a.raisedById)]);
  const published = courses.filter((c) => c.status === "PUBLISHED");
  const matrixCourses = published.filter((c) => employees.some((e) => e.position?.requiredCourseIds.includes(c.id)) || enrolments.some((en) => en.courseId === c.id));
  const matrix = employees.map((e) => ({
    employeeId: e.id, name: fullName(e), position: e.position?.name ?? "",
    cells: matrixCourses.map((c) => {
      const en = enrolments.find((x) => x.employeeId === e.id && x.courseId === c.id && x.status !== "WITHDRAWN");
      const total = lessonCounts.find((l) => l.revisionId === c.liveRevisionId)?._count ?? 0;
      const progressPct = en && total ? Math.round((100 * en.progress.length) / total) : 0;
      return { courseId: c.id, cell: matrixCell({ required: !!e.position?.requiredCourseIds.includes(c.id), status: en?.status ?? null, dueDate: en?.dueDate ?? null, progressPct, now }), pct: progressPct };
    }),
  }));
  const requiredPairs = employees.flatMap((e) => (e.position?.requiredCourseIds ?? []).filter((id) => published.some((c) => c.id === id)).map((id) => ({ e: e.id, c: id })));
  const requiredDone = requiredPairs.filter((p) => enrolments.some((en) => en.employeeId === p.e && en.courseId === p.c && (en.status === "CERTIFIED" || en.status === "ACKNOWLEDGED"))).length;
  const overdue = enrolments.filter((en) => en.dueDate && en.dueDate < now && ["ASSIGNED", "IN_PROGRESS"].includes(en.status)).length;
  const certified = enrolments.filter((en) => en.status === "CERTIFIED");
  const finals = await prisma.trainingQuizAttempt.findMany({ where: { companyId, kind: "FINAL", submittedAt: { not: null } }, select: { enrolmentId: true, passed: true, answers: true, questionIds: true, revisionId: true } });
  const reviewsDue = certs.filter((c) => c.reviewDueAt && c.reviewDueAt <= now);
  const reviewsDone = reviewsDue.filter((c) => c.reviewedAt);
  // Questions most people get wrong, for corrective actions.
  const qIds = [...new Set(finals.flatMap((a) => a.questionIds))];
  const questions = qIds.length ? await prisma.trainingQuestion.findMany({ where: { id: { in: qIds } }, select: { id: true, stableKey: true, prompt: true, answer: true, revisionId: true } }) : [];
  const stats = new Map<string, { questionKey: string; prompt: string; asked: number; wrong: number; courseId: string }>();
  for (const a of finals) {
    const answers = (a.answers ?? {}) as Record<string, number[]>;
    for (const id of a.questionIds) {
      const q = questions.find((x) => x.id === id);
      if (!q) continue;
      const rev = revisions.find((r) => r.id === q.revisionId);
      const s = stats.get(q.stableKey) ?? { questionKey: q.stableKey, prompt: q.prompt, asked: 0, wrong: 0, courseId: rev?.courseId ?? "" };
      s.asked++;
      const given = [...new Set(answers[id] ?? [])].sort().join(",");
      if (given !== [...new Set(q.answer)].sort().join(",")) s.wrong++;
      stats.set(q.stableKey, s);
    }
  }
  const trouble = troubleQuestions([...stats.values()]).slice(0, 10).map((t) => ({ ...t, course: courses.find((c) => c.id === (t as { courseId?: string }).courseId)?.title ?? "" }));
  const attemptsPerCourse = published.map((c) => {
    const cert = certified.filter((en) => en.courseId === c.id);
    return { courseId: c.id, avg: cert.length ? Math.round((10 * cert.reduce((n, en) => n + en.attemptsUsed, 0)) / cert.length) / 10 : null };
  });
  return {
    kpis: {
      requiredPct: requiredPairs.length ? Math.round((100 * requiredDone) / requiredPairs.length) : null, overdue,
      avgAttempts: certified.length ? Math.round((10 * certified.reduce((n, en) => n + en.attemptsUsed, 0)) / certified.length) / 10 : null,
      reviewsPct: reviewsDue.length ? Math.round((100 * reviewsDone.length) / reviewsDue.length) : null,
      notCompetent: certs.filter((c) => c.reviewCompetent === false).length,
    },
    matrix: { courses: matrixCourses.map((c) => ({ id: c.id, code: c.code, title: c.title })), rows: matrix },
    documents: courses.map((c) => {
      const live = revisions.find((r) => r.id === c.liveRevisionId);
      return {
        courseId: c.id, docNumber: c.docNumber, title: c.title, status: c.status, revision: live ? revisionLabel(live) : "", approvedBy: live?.publishedById ? names.get(live.publishedById) ?? "" : "", effective: iso(live?.publishedAt),
        nextReview: iso(c.nextReviewAt), reviewOverdue: c.status === "PUBLISHED" && !!c.nextReviewAt && c.nextReviewAt < now, reviewSoon: c.status === "PUBLISHED" && !!c.nextReviewAt && c.nextReviewAt < addMonths(now, 1), owner: c.ownerUserId ? names.get(c.ownerUserId) ?? "" : "",
        avgAttempts: attemptsPerCourse.find((a) => a.courseId === c.id)?.avg ?? null,
      };
    }),
    controls: [
      { ref: "7.2 a", text: "Required courses set for every position", ok: employees.length === 0 || employees.every((e) => (e.position?.requiredCourseIds.length ?? 0) > 0), detail: `${employees.filter((e) => !(e.position?.requiredCourseIds.length)).length} active employees have a position with no required courses` },
      { ref: "7.2 b", text: "Training given, quiz passed and approved by a manager", ok: true, detail: "Every certificate needs a pass and an approval" },
      { ref: "7.2 c", text: "Effectiveness checked on the job after the certificate", ok: reviewsDue.length === reviewsDone.length, detail: `${reviewsDue.length - reviewsDone.length} reviews overdue` },
      { ref: "7.2 d", text: "Records of training kept", ok: true, detail: `Kept ${(await settingsFor(companyId)).retentionYears} years, never deleted` },
      { ref: "7.5.2", text: "Course documents reviewed on time", ok: !courses.some((c) => c.status === "PUBLISHED" && c.nextReviewAt && c.nextReviewAt < now), detail: `${courses.filter((c) => c.status === "PUBLISHED" && c.nextReviewAt && c.nextReviewAt < now).length} course reviews overdue` },
      { ref: "7.5.3", text: "Changes controlled: draft, review, publish, history", ok: true, detail: "Every revision is kept and audited" },
      { ref: "10.2", text: "Corrective actions closed", ok: !actions.some((a) => a.status === "OPEN" && a.dueDate && a.dueDate < now), detail: `${actions.filter((a) => a.status === "OPEN").length} open` },
    ],
    trouble,
    actions: actions.map((a) => ({ id: a.id, ref: a.ref, title: a.title, detail: a.detail, status: a.status, dueDate: iso(a.dueDate), course: courses.find((c) => c.id === a.courseId)?.title ?? "", raisedBy: a.raisedById ? names.get(a.raisedById) ?? "" : "", createdAt: iso(a.createdAt), closedAt: iso(a.closedAt), closeNote: a.closeNote })),
    courses: courses.map((c) => ({ id: c.id, title: c.title })),
    canAct: can(ctx, "TRAINING_CONTENT_EDIT") || can(ctx, "TRAINING_EMPLOYEES_MANAGE"),
  };
}

export async function saveAction(ctx: RequestContext, id: string | null, raw: unknown) {
  const companyId = ctx.tenantPermissions.has("TRAINING_CONTENT_EDIT") ? requireTraining(ctx, "TRAINING_CONTENT_EDIT", "WRITE") : requireTraining(ctx, "TRAINING_EMPLOYEES_MANAGE", "WRITE");
  const input = z.object({ title: z.string().trim().min(3, "Give the action a title.").max(200), detail: z.string().trim().max(3000).optional().default(""), courseId: z.string().optional().nullable(), dueDate: z.string().optional().nullable(), close: z.boolean().optional(), closeNote: z.string().trim().max(1000).optional() }).parse(raw);
  const due = input.dueDate ? new Date(input.dueDate) : null;
  if (due && Number.isNaN(due.getTime())) throw new TrainingError("DATE_INVALID", "The due date is not valid.");
  if (id) {
    checkId(id, "action");
    const a = await prisma.trainingCorrectiveAction.findFirst({ where: { id, companyId } });
    if (!a) notFound("action");
    if (input.close && !(input.closeNote ?? "").trim()) throw new TrainingError("CLOSE_NOTE", "Say what was done to close the action.");
    await prisma.trainingCorrectiveAction.update({ where: { id }, data: { title: input.title, detail: input.detail, courseId: input.courseId || null, dueDate: due, ...(input.close ? { status: "CLOSED", closedAt: new Date(), closedById: ctx.userId, closeNote: input.closeNote } : {}) } });
    await audit(ctx, "TrainingCorrectiveAction", id, input.close ? "TRAINING_ACTION_CLOSED" : "TRAINING_ACTION_UPDATED", { ref: a.ref, title: input.title }, input.closeNote);
    return { id };
  }
  const count = await prisma.trainingCorrectiveAction.count({ where: { companyId } });
  let ref = `CA-${String(count + 1).padStart(4, "0")}`;
  for (let n = count + 2; await prisma.trainingCorrectiveAction.findUnique({ where: { companyId_ref: { companyId, ref } } }); n++) ref = `CA-${String(n).padStart(4, "0")}`;
  const created = await prisma.trainingCorrectiveAction.create({ data: { companyId, ref, title: input.title, detail: input.detail, courseId: input.courseId || null, dueDate: due, raisedById: ctx.userId } });
  await audit(ctx, "TrainingCorrectiveAction", created.id, "TRAINING_ACTION_RAISED", { ref, title: input.title });
  return { id: created.id, ref };
}

// ---------------------------------------------------------------------------
// Exports (CSV, opens in Excel)
// ---------------------------------------------------------------------------

export async function exportCsv(ctx: RequestContext, kind: string, opts: { year?: string }): Promise<{ fileName: string; csv: string }> {
  const companyId = reports(ctx);
  const day = new Date().toISOString().slice(0, 10);
  const showId = can(ctx, "TRAINING_EMPLOYEES_MANAGE");
  if (kind === "matrix") {
    const data = await compliance(ctx);
    const label: Record<string, string> = { CERTIFIED: "Certified", ACKNOWLEDGED: "Acknowledged", AWAITING: "Awaiting approval", IN_PROGRESS: "In progress", ASSIGNED: "Assigned", OVERDUE: "Overdue", NOT_STARTED: "Not started", NOT_REQUIRED: "" };
    return { fileName: `training-matrix-${day}.csv`, csv: toCsv(["Employee", "Position", ...data.matrix.courses.map((c) => `${c.code} ${c.title}`)], data.matrix.rows.map((r) => [r.name, r.position, ...r.cells.map((c) => label[c.cell] + (c.cell === "IN_PROGRESS" ? ` ${c.pct}%` : ""))])) };
  }
  if (kind === "competence" || kind === "seta") {
    const year = opts.year && /^\d{4}$/.test(opts.year) ? Number(opts.year) : null;
    const enrolments = await prisma.trainingEnrolment.findMany({
      where: { companyId, ...(kind === "seta" ? { status: { in: ["CERTIFIED", "ACKNOWLEDGED"] }, ...(year ? { completedAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } } : {}) } : {}) },
      include: { employee: { include: { position: { select: { name: true } } } }, course: { select: { title: true, code: true, docNumber: true } } }, orderBy: [{ employee: { surname: "asc" } }, { createdAt: "asc" }],
    });
    const certs = await prisma.trainingCertificate.findMany({ where: { companyId, enrolmentId: { in: enrolments.map((e) => e.id) } }, orderBy: { requestedAt: "desc" } });
    const revs = await prisma.trainingRevision.findMany({ where: { id: { in: enrolments.map((e) => e.revisionId).filter((v): v is string => !!v) } }, select: { id: true, major: true, minor: true } });
    const names = await userNames(certs.map((c) => c.decidedById));
    const date = (d: Date | null | undefined) => (d ? d.toISOString().replace("T", " ").slice(0, 16) : "");
    if (kind === "seta") {
      return {
        fileName: `seta-training-list-${year ?? "all"}-${day}.csv`,
        csv: toCsv(["ID number", "Employee number", "Surname", "Name", "Job title", "Course", "Course code", "Start date", "End date", "Result", "Certificate", "Credit bearing"],
          enrolments.map((en) => { const c = certs.find((x) => x.enrolmentId === en.id && x.status === "VALID"); return [showId ? en.employee.idNumber : maskIdNumber(en.employee.idNumber), en.employee.employeeNo ?? "", en.employee.surname, en.employee.firstName, en.employee.position?.name ?? "", en.course.title, en.course.code, en.startedAt?.toISOString().slice(0, 10) ?? "", en.completedAt?.toISOString().slice(0, 10) ?? "", en.status === "ACKNOWLEDGED" ? "Acknowledged" : "Competent", c?.certNo ?? "", "No (non-credit-bearing)"]; })),
      };
    }
    return {
      fileName: `competence-records-${day}.csv`,
      csv: toCsv(["Employee", "ID number", "Position", "Course", "Document", "Revision", "Status", "Started", "Completed", "Elapsed", "Active time", "Quiz attempts", "Final score %", "Pre-assessment %", "Certificate", "Certificate status", "Approved by", "Approved at", "Effectiveness review", "Competent on the job"],
        await Promise.all(enrolments.map(async (en) => {
          const c = certs.find((x) => x.enrolmentId === en.id && x.status === "VALID") ?? certs.find((x) => x.enrolmentId === en.id);
          const pass = await prisma.trainingQuizAttempt.findFirst({ where: { enrolmentId: en.id, kind: "FINAL", passed: true }, select: { score: true } });
          const rev = revs.find((r) => r.id === en.revisionId);
          return [fullName(en.employee), showId ? en.employee.idNumber : maskIdNumber(en.employee.idNumber), en.employee.position?.name ?? "", en.course.title, en.course.docNumber, rev ? revisionLabel(rev) : "", en.status, date(en.startedAt), date(en.completedAt), formatElapsed(en.startedAt, en.completedAt), formatSeconds(en.activeSeconds), en.attemptsUsed, pass?.score ?? "", en.preScore ?? "", c?.certNo ?? "", c?.status ?? "", c?.decidedById ? names.get(c.decidedById) ?? "" : "", date(c?.decidedAt), date(c?.reviewedAt), c?.reviewCompetent === null || c?.reviewCompetent === undefined ? "" : c.reviewCompetent ? "Yes" : "No"];
        }))),
    };
  }
  if (kind === "audit") {
    const events = await prisma.auditEvent.findMany({ where: { companyId, module: "TECH_TRAINING" }, orderBy: { occurredAt: "desc" }, take: 20000, select: { occurredAt: true, action: true, actorId: true, entityType: true, entityId: true, afterData: true, reason: true } });
    const names = await userNames(events.map((e) => e.actorId));
    return { fileName: `training-audit-trail-${day}.csv`, csv: toCsv(["When", "Action", "By", "Record", "Record id", "Details", "Reason"], events.map((e) => [e.occurredAt.toISOString().replace("T", " ").slice(0, 19), e.action, e.actorId ? names.get(e.actorId) ?? e.actorId : "", e.entityType, e.entityId ?? "", JSON.stringify(e.afterData ?? {}), e.reason ?? ""])) };
  }
  throw new TrainingError("UNKNOWN_EXPORT", "That export does not exist.", 404);
}
