import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { RequestContext } from "@/lib/auth/context-types";
import { TrainingError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import { canManageCompanyUsers } from "@/lib/users/access";
import { createTenantUser } from "@/lib/users/service";
import { notifyUser } from "@/lib/notifications/service";
import { audit, can, canWrite, checkId, iso, notFound, requireTraining, userNames } from "@/lib/training/access";
import { addDays, checkSaIdNumber, fullName, maskIdNumber } from "@/lib/training/model";

// ---------------------------------------------------------------------------
// Employee register and positions (2026-11-28). Flo X has no HR module, so this register is the source of truth for training.
// Only Company Admins create and change profiles (TRAINING_EMPLOYEES_MANAGE). A profile needs Name, Surname, ID number, Position
// and Email address; it can be linked to a Flo X login so the person can take courses.
// ---------------------------------------------------------------------------

const trimmed = (max: number) => z.string().trim().max(max);

const employeeInput = z.object({
  firstName: trimmed(80).min(1, "Name is required."),
  surname: trimmed(80).min(1, "Surname is required."),
  idNumber: z.string().transform((v) => v.replace(/\s+/g, "")),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  positionId: z.string().trim().min(1, "Position is required."),
  employeeNo: trimmed(40).optional().default(""),
  managerUserId: z.string().trim().optional().nullable(),
  userId: z.string().trim().optional().nullable(),
  notes: trimmed(1000).optional().default(""),
  createLogin: z.boolean().optional().default(false),
  enrolRequired: z.boolean().optional().default(false),
  dueDays: z.number().int().min(1).max(365).optional().default(30),
});

const positionInput = z.object({
  name: trimmed(80).min(1, "Give the position a name."),
  requiredCourseIds: z.array(z.string()).max(200).optional().default([]),
  active: z.boolean().optional().default(true),
});

function idCheckOrThrow(idNumber: string) {
  const check = checkSaIdNumber(idNumber);
  if (!check.valid) throw new TrainingError("ID_INVALID", `ID number: ${check.message}`);
  return check;
}

async function companyMembers(companyId: string) {
  const rows = await prisma.companyMembership.findMany({ where: { companyId, status: "ACTIVE" }, select: { userId: true, role: true, user: { select: { displayName: true, email: true, active: true } } }, orderBy: { user: { displayName: "asc" } } });
  return rows.filter((r) => r.user.active).map((r) => ({ userId: r.userId, name: r.user.displayName, email: r.user.email, role: r.role }));
}

/** Assigning and withdrawing courses: Company Admins (employee managers) and Managers (approvers). */
function requireAssigner(ctx: RequestContext): string {
  return ctx.tenantPermissions.has("TRAINING_EMPLOYEES_MANAGE") ? requireTraining(ctx, "TRAINING_EMPLOYEES_MANAGE", "WRITE") : requireTraining(ctx, "TRAINING_APPROVE", "WRITE");
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export async function listEmployees(ctx: RequestContext, filter: { q?: string; status?: string; positionId?: string }) {
  const companyId = ctx.tenantPermissions.has("TRAINING_EMPLOYEES_MANAGE") ? requireTraining(ctx, "TRAINING_EMPLOYEES_MANAGE") : requireTraining(ctx, "TRAINING_REPORTS_VIEW");
  const showId = can(ctx, "TRAINING_EMPLOYEES_MANAGE");
  const status = filter.status === "INACTIVE" ? "INACTIVE" : filter.status === "ALL" ? undefined : "ACTIVE";
  const q = (filter.q ?? "").trim();
  const rows = await prisma.trainingEmployee.findMany({
    where: {
      companyId, ...(status ? { status } : {}), ...(filter.positionId ? { positionId: filter.positionId } : {}),
      ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { surname: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { idNumber: { contains: q.replace(/\s+/g, "") } }, { employeeNo: { contains: q, mode: "insensitive" } }, { position: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: { position: { select: { name: true, requiredCourseIds: true } }, enrolments: { select: { status: true, courseId: true, dueDate: true, updatedAt: true, course: { select: { title: true } } } }, certificates: { where: { status: "VALID" }, select: { id: true } } },
    orderBy: [{ surname: "asc" }, { firstName: "asc" }],
  });
  const now = new Date();
  const names = await userNames(rows.map((r) => r.managerUserId));
  const items = rows.map((e) => {
    const active = e.enrolments.filter((en) => en.status === "IN_PROGRESS" || en.status === "ASSIGNED");
    const waiting = e.enrolments.filter((en) => en.status === "AWAITING_APPROVAL");
    const required = e.position?.requiredCourseIds ?? [];
    const requiredDone = required.filter((cid) => e.enrolments.some((en) => en.courseId === cid && (en.status === "CERTIFIED" || en.status === "ACKNOWLEDGED"))).length;
    const overdue = e.enrolments.filter((en) => en.dueDate && en.dueDate < now && !["CERTIFIED", "ACKNOWLEDGED", "WITHDRAWN"].includes(en.status)).length;
    const latest = [...e.enrolments].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    return {
      id: e.id, name: fullName(e), firstName: e.firstName, surname: e.surname, email: e.email, employeeNo: e.employeeNo ?? "",
      idNumber: showId ? e.idNumber : maskIdNumber(e.idNumber), position: e.position?.name ?? "", positionId: e.positionId,
      managerName: e.managerUserId ? names.get(e.managerUserId) ?? "" : "", status: e.status, hasLogin: !!e.userId,
      busy: active.length, waiting: waiting.length, certificates: e.certificates.length, overdue,
      required: required.length, requiredDone, current: latest ? `${latest.course.title}` : "", currentStatus: latest?.status ?? null,
    };
  });
  const all = await prisma.trainingEmployee.groupBy({ by: ["status"], where: { companyId }, _count: true });
  const kpis = {
    active: all.find((g) => g.status === "ACTIVE")?._count ?? 0,
    busy: await prisma.trainingEnrolment.count({ where: { companyId, status: "IN_PROGRESS", employee: { status: "ACTIVE" } } }),
    waiting: await prisma.trainingCertificate.count({ where: { companyId, status: "PENDING" } }),
    noLogin: await prisma.trainingEmployee.count({ where: { companyId, status: "ACTIVE", userId: null } }),
  };
  return { items, kpis, showIdNumbers: showId };
}

export async function employeeEditorData(ctx: RequestContext) {
  const companyId = requireTraining(ctx, "TRAINING_EMPLOYEES_MANAGE");
  const [positions, members, linked, courses] = await Promise.all([
    prisma.trainingPosition.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, requiredCourseIds: true } }),
    companyMembers(companyId),
    prisma.trainingEmployee.findMany({ where: { companyId, userId: { not: null } }, select: { userId: true, id: true } }),
    prisma.trainingCourse.findMany({ where: { companyId, status: "PUBLISHED" }, select: { id: true, title: true, code: true }, orderBy: { title: "asc" } }),
  ]);
  const linkedBy = new Map(linked.map((l) => [l.userId!, l.id]));
  return {
    positions, courses,
    users: members.map((m) => ({ ...m, linkedEmployeeId: linkedBy.get(m.userId) ?? null })),
    approvers: members.filter((m) => m.role === "COMPANY_ADMIN" || m.role === "MANAGER"),
    canCreateLogin: canManageCompanyUsers(ctx),
  };
}

export async function getEmployee(ctx: RequestContext, id: string) {
  const companyId = ctx.tenantPermissions.has("TRAINING_EMPLOYEES_MANAGE") ? requireTraining(ctx, "TRAINING_EMPLOYEES_MANAGE") : requireTraining(ctx, "TRAINING_REPORTS_VIEW");
  checkId(id, "employee");
  const e = await prisma.trainingEmployee.findFirst({ where: { id, companyId }, include: { position: true } });
  if (!e) notFound("employee");
  const names = await userNames([e.managerUserId, e.userId]);
  return {
    id: e.id, firstName: e.firstName, surname: e.surname, name: fullName(e), email: e.email, employeeNo: e.employeeNo ?? "",
    idNumber: can(ctx, "TRAINING_EMPLOYEES_MANAGE") ? e.idNumber : maskIdNumber(e.idNumber), birthDate: checkSaIdNumber(e.idNumber).birthDate,
    positionId: e.positionId, position: e.position?.name ?? "", managerUserId: e.managerUserId, managerName: e.managerUserId ? names.get(e.managerUserId) ?? "" : "",
    userId: e.userId, loginName: e.userId ? names.get(e.userId) ?? "" : "", status: e.status, notes: e.notes ?? "", createdAt: iso(e.createdAt),
  };
}

async function assertUnique(companyId: string, idNumber: string, userId: string | null | undefined, exceptId?: string) {
  const dupe = await prisma.trainingEmployee.findFirst({ where: { companyId, idNumber, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { firstName: true, surname: true } });
  if (dupe) throw new TrainingError("ID_TAKEN", `That ID number is already on ${fullName(dupe)}'s profile.`, 409);
  if (userId) {
    const linked = await prisma.trainingEmployee.findFirst({ where: { companyId, userId, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { firstName: true, surname: true } });
    if (linked) throw new TrainingError("LOGIN_TAKEN", `That Flo X login is already linked to ${fullName(linked)}.`, 409);
    const member = await prisma.companyMembership.findFirst({ where: { companyId, userId, status: "ACTIVE" } });
    if (!member) throw new TrainingError("LOGIN_UNKNOWN", "That login is not an active user of this company.");
  }
}

async function assertPosition(companyId: string, positionId: string) {
  const position = await prisma.trainingPosition.findFirst({ where: { id: positionId, companyId } });
  if (!position) throw new TrainingError("POSITION_UNKNOWN", "Pick a position from the list (add positions under Training settings).");
  return position;
}

async function assertApprover(companyId: string, userId: string | null | undefined) {
  if (!userId) return;
  const member = await prisma.companyMembership.findFirst({ where: { companyId, userId, status: "ACTIVE", role: { in: ["COMPANY_ADMIN", "MANAGER"] } } });
  if (!member) throw new TrainingError("MANAGER_UNKNOWN", "The manager must be a Company Admin or Manager of this company.");
}

/** Enrol an employee in courses (skips courses they are already enrolled in). Returns how many were added. */
async function enrolIn(ctx: RequestContext, companyId: string, employeeId: string, courseIds: string[], dueDate: Date | null) {
  if (!courseIds.length) return 0;
  const courses = await prisma.trainingCourse.findMany({ where: { companyId, id: { in: courseIds }, status: "PUBLISHED" }, select: { id: true, title: true, liveRevisionId: true } });
  const existing = await prisma.trainingEnrolment.findMany({ where: { employeeId, courseId: { in: courses.map((c) => c.id) } }, select: { courseId: true, status: true, id: true } });
  let added = 0;
  for (const c of courses) {
    const had = existing.find((e) => e.courseId === c.id);
    if (had && had.status !== "WITHDRAWN") continue;
    if (had) await prisma.trainingEnrolment.update({ where: { id: had.id }, data: { status: "ASSIGNED", dueDate, assignedById: ctx.userId, withdrawnAt: null, withdrawnReason: null } });
    else await prisma.trainingEnrolment.create({ data: { companyId, employeeId, courseId: c.id, revisionId: c.liveRevisionId, assignedById: ctx.userId, dueDate, status: "ASSIGNED" } });
    added++;
    await audit(ctx, "TrainingEnrolment", employeeId, "TRAINING_COURSE_ASSIGNED", { employeeId, courseId: c.id, course: c.title, dueDate: iso(dueDate) });
  }
  if (added) {
    const emp = await prisma.trainingEmployee.findUnique({ where: { id: employeeId }, select: { userId: true } });
    if (emp?.userId) await notifyUser(companyId, emp.userId, "TRAINING_COURSE_ASSIGNED", "Training assigned", `${added} course${added === 1 ? "" : "s"} assigned to you${dueDate ? `, due ${dueDate.toLocaleDateString("en-ZA")}` : ""}.`, "/tech-training");
  }
  return added;
}

export async function createEmployee(ctx: RequestContext, raw: unknown) {
  const companyId = requireTraining(ctx, "TRAINING_EMPLOYEES_MANAGE", "WRITE");
  const input = employeeInput.parse(raw);
  idCheckOrThrow(input.idNumber);
  const position = await assertPosition(companyId, input.positionId);
  await assertApprover(companyId, input.managerUserId);
  let userId = input.userId || null;
  if (!userId && input.createLogin) {
    if (!canManageCompanyUsers(ctx)) throw new TrainingError("LOGIN_NOT_ALLOWED", "New Flo X logins are added by Flo X. Save the profile without a login and link it later.");
    const membership = await createTenantUser(ctx, { email: input.email, displayName: `${input.firstName} ${input.surname}`, role: "USER", active: true, password: randomBytes(18).toString("base64url"), moduleKeys: ["TECH_TRAINING"], permissionOverrides: [] });
    userId = membership.userId;
  }
  await assertUnique(companyId, input.idNumber, userId);
  const employee = await prisma.trainingEmployee.create({
    data: { companyId, firstName: input.firstName, surname: input.surname, idNumber: input.idNumber, email: input.email, positionId: position.id, employeeNo: input.employeeNo || null, managerUserId: input.managerUserId || null, userId, notes: input.notes || null, createdById: ctx.userId },
  });
  await audit(ctx, "TrainingEmployee", employee.id, "TRAINING_EMPLOYEE_CREATED", { employeeId: employee.id, name: fullName(employee), position: position.name, email: employee.email, linkedLogin: !!userId });
  const enrolled = input.enrolRequired ? await enrolIn(ctx, companyId, employee.id, position.requiredCourseIds, addDays(new Date(), input.dueDays)) : 0;
  return { id: employee.id, enrolled };
}

export async function updateEmployee(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireTraining(ctx, "TRAINING_EMPLOYEES_MANAGE", "WRITE");
  checkId(id, "employee");
  const before = await prisma.trainingEmployee.findFirst({ where: { id, companyId } });
  if (!before) notFound("employee");
  const input = employeeInput.parse(raw);
  idCheckOrThrow(input.idNumber);
  const position = await assertPosition(companyId, input.positionId);
  await assertApprover(companyId, input.managerUserId);
  const userId = input.userId || null;
  await assertUnique(companyId, input.idNumber, userId, id);
  const after = await prisma.trainingEmployee.update({
    where: { id },
    data: { firstName: input.firstName, surname: input.surname, idNumber: input.idNumber, email: input.email, positionId: position.id, employeeNo: input.employeeNo || null, managerUserId: input.managerUserId || null, userId, notes: input.notes || null },
  });
  const changed = (["firstName", "surname", "idNumber", "email", "positionId", "employeeNo", "managerUserId", "userId", "notes"] as const).filter((k) => (before[k] ?? "") !== (after[k] ?? ""));
  await audit(ctx, "TrainingEmployee", id, "TRAINING_EMPLOYEE_UPDATED", { employeeId: id, changed, position: position.name });
  const enrolled = input.enrolRequired ? await enrolIn(ctx, companyId, id, position.requiredCourseIds, addDays(new Date(), input.dueDays)) : 0;
  return { id, enrolled };
}

export async function setEmployeeStatus(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireTraining(ctx, "TRAINING_EMPLOYEES_MANAGE", "WRITE");
  checkId(id, "employee");
  const input = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]), reason: trimmed(300).optional().default("") }).parse(raw);
  const e = await prisma.trainingEmployee.findFirst({ where: { id, companyId } });
  if (!e) notFound("employee");
  await prisma.trainingEmployee.update({ where: { id }, data: { status: input.status } });
  await audit(ctx, "TrainingEmployee", id, input.status === "ACTIVE" ? "TRAINING_EMPLOYEE_REACTIVATED" : "TRAINING_EMPLOYEE_DEACTIVATED", { employeeId: id, name: fullName(e) }, input.reason || undefined);
  return { ok: true };
}

/** Assign courses to one or more employees, with an optional due date. Managers and Company Admins. */
export async function assignCourses(ctx: RequestContext, raw: unknown) {
  const companyId = requireAssigner(ctx);
  const input = z.object({ employeeIds: z.array(z.string()).min(1).max(500), courseIds: z.array(z.string()).min(1).max(100), dueDate: z.string().optional().nullable() }).parse(raw);
  const due = input.dueDate ? new Date(input.dueDate) : null;
  if (due && Number.isNaN(due.getTime())) throw new TrainingError("DATE_INVALID", "The due date is not a valid date.");
  const employees = await prisma.trainingEmployee.findMany({ where: { companyId, id: { in: input.employeeIds }, status: "ACTIVE" }, select: { id: true } });
  let added = 0;
  for (const e of employees) added += await enrolIn(ctx, companyId, e.id, input.courseIds, due);
  return { added };
}

export async function withdrawEnrolment(ctx: RequestContext, enrolmentId: string, raw: unknown) {
  const companyId = requireAssigner(ctx);
  checkId(enrolmentId, "enrolment");
  const reason = z.object({ reason: trimmed(300).min(3, "Give a reason.") }).parse(raw).reason;
  const en = await prisma.trainingEnrolment.findFirst({ where: { id: enrolmentId, companyId }, include: { course: { select: { title: true } } } });
  if (!en) notFound("enrolment");
  if (en.status === "CERTIFIED" || en.status === "ACKNOWLEDGED") throw new TrainingError("ALREADY_DONE", "A completed course stays on record and cannot be withdrawn.");
  await prisma.trainingEnrolment.update({ where: { id: enrolmentId }, data: { status: "WITHDRAWN", withdrawnAt: new Date(), withdrawnReason: reason } });
  await audit(ctx, "TrainingEnrolment", enrolmentId, "TRAINING_ENROLMENT_WITHDRAWN", { employeeId: en.employeeId, courseId: en.courseId, course: en.course.title }, reason);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export async function listPositions(ctx: RequestContext) {
  const companyId = requireTraining(ctx, "TRAINING_VIEW");
  const rows = await prisma.trainingPosition.findMany({ where: { companyId }, orderBy: [{ active: "desc" }, { name: "asc" }], include: { _count: { select: { employees: true } } } });
  return { items: rows.map((p) => ({ id: p.id, name: p.name, requiredCourseIds: p.requiredCourseIds, active: p.active, employees: p._count.employees })), canEdit: canWrite(ctx, "TRAINING_SETTINGS") || canWrite(ctx, "TRAINING_EMPLOYEES_MANAGE") };
}

export async function savePosition(ctx: RequestContext, id: string | null, raw: unknown) {
  const companyId = requireTraining(ctx, "TRAINING_EMPLOYEES_MANAGE", "WRITE");
  const input = positionInput.parse(raw);
  const courses = await prisma.trainingCourse.findMany({ where: { companyId, id: { in: input.requiredCourseIds } }, select: { id: true } });
  const required = courses.map((c) => c.id);
  const clash = await prisma.trainingPosition.findFirst({ where: { companyId, name: { equals: input.name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
  if (clash) throw new TrainingError("POSITION_EXISTS", "There is already a position with that name.", 409);
  if (id) {
    checkId(id, "position");
    const before = await prisma.trainingPosition.findFirst({ where: { id, companyId } });
    if (!before) notFound("position");
    await prisma.trainingPosition.update({ where: { id }, data: { name: input.name, requiredCourseIds: required, active: input.active } });
    await audit(ctx, "TrainingPosition", id, "TRAINING_POSITION_UPDATED", { name: input.name, requiredCourses: required.length, active: input.active });
    return { id };
  }
  const created = await prisma.trainingPosition.create({ data: { companyId, name: input.name, requiredCourseIds: required, active: input.active } });
  await audit(ctx, "TrainingPosition", created.id, "TRAINING_POSITION_CREATED", { name: input.name, requiredCourses: required.length });
  return { id: created.id };
}

export async function deletePosition(ctx: RequestContext, id: string) {
  const companyId = requireTraining(ctx, "TRAINING_EMPLOYEES_MANAGE", "WRITE");
  checkId(id, "position");
  const p = await prisma.trainingPosition.findFirst({ where: { id, companyId }, include: { _count: { select: { employees: true } } } });
  if (!p) notFound("position");
  if (p._count.employees > 0) {
    await prisma.trainingPosition.update({ where: { id }, data: { active: false } });
    await audit(ctx, "TrainingPosition", id, "TRAINING_POSITION_DEACTIVATED", { name: p.name });
    return { deactivated: true };
  }
  await prisma.trainingPosition.delete({ where: { id } });
  await audit(ctx, "TrainingPosition", id, "TRAINING_POSITION_DELETED", { name: p.name });
  return { deleted: true };
}
