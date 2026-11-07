import { Prisma } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit/service";
import { TestingError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import {
  STARTER_TEMPLATES, completionProblems, reportNumberLabel, summarizeReport, templateMatchesModel,
  type ReportSummary, type TestLayoutId, type TestReading, type TestReadings, type TestResultId, type TestSpec,
} from "@/lib/testing/spec";
import { testReportCreateInput, testReportUpdateInput, testTemplateInput, type TestReportUpdateInput } from "@/lib/testing/validation";

// ---------------------------------------------------------------------------
// Testing Reports (2026-11-07). Access, as asked: Company Admins, Managers and Testing Technicians.
//   TESTING_VIEW    see reports and templates, look up a job to test
//   TESTING_EDIT    start, fill in, complete and retest a report (Admin, Manager, Testing Technician)
//   TESTING_MANAGE  change spec templates, reopen a completed test, delete a draft (Admin, Manager)
// All of it also needs the Testing Reports module switched on for the company and for the user. It deliberately does not need
// any Jobs permission: a Testing Technician has none, so the job lookup below has its own endpoint (the same idea as pick slips).
// ---------------------------------------------------------------------------

function notFound(): never { throw new Error("NOT_FOUND"); }

function requireRead(ctx: RequestContext) {
  requireModule(ctx, "TESTING_REPORTS", "READ");
  requireTenantPermission(ctx, "TESTING_VIEW");
  return ctx.companyId!;
}

function requireWrite(ctx: RequestContext) {
  requireModule(ctx, "TESTING_REPORTS", "WRITE");
  requireTenantPermission(ctx, "TESTING_EDIT");
  return ctx.companyId!;
}

function requireManage(ctx: RequestContext) {
  requireModule(ctx, "TESTING_REPORTS", "WRITE");
  requireTenantPermission(ctx, "TESTING_MANAGE");
  return ctx.companyId!;
}

// A Testing Technician has no customer access, so a customer name only goes out to people who could see it anyway.
const canSeeCustomer = (ctx: RequestContext) => ctx.tenantPermissions.has("CUSTOMERS_VIEW");

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const todayIso = () => new Date().toISOString().slice(0, 10);
const idShape = /^[a-z0-9]{20,40}$/i;

type TemplateRow = {
  id: string; name: string; machineModels: string[]; layout: string; inputRpm: number | null; labelA: string; labelB: string;
  parameters: unknown; clutchRows: unknown; revision: number; active: boolean; createdAt: Date; updatedAt: Date;
};

function specOf(row: Pick<TemplateRow, "name" | "layout" | "labelA" | "labelB" | "parameters" | "clutchRows" | "revision">): TestSpec {
  return {
    name: row.name,
    layout: row.layout as TestLayoutId,
    revision: row.revision,
    labelA: row.labelA,
    labelB: row.labelB,
    parameters: (Array.isArray(row.parameters) ? row.parameters : []) as TestSpec["parameters"],
    clutchRows: (Array.isArray(row.clutchRows) ? row.clutchRows : []) as TestSpec["clutchRows"],
  };
}

function templateView(row: TemplateRow) {
  const spec = specOf(row);
  return {
    id: row.id, name: row.name, machineModels: row.machineModels, layout: row.layout as TestLayoutId, inputRpm: row.inputRpm,
    labelA: row.labelA, labelB: row.labelB, parameters: spec.parameters, clutchRows: spec.clutchRows,
    revision: row.revision, active: row.active, updatedAt: row.updatedAt.toISOString(),
  };
}

type ReportRow = {
  id: string; number: number; jobId: string | null; templateId: string | null; spec: unknown; machineModel: string; serialNumber: string | null;
  customerName: string | null; testDate: Date; inputRpm: number | null; testType: string | null; readings: unknown; testers: string[];
  comments: string | null; status: string; result: string | null; resultSummary: unknown; completedAt: Date | null; retestOfId: string | null;
  createdAt: Date; updatedAt: Date;
};

const readingsOf = (value: unknown): TestReadings => (value && typeof value === "object" ? (value as TestReadings) : {});
const reportSpec = (row: Pick<ReportRow, "spec">): TestSpec => specOf(row.spec as TemplateRow);

function jobLabel(job: { jobNumber: string | null; draftNumber?: string | null } | null | undefined) {
  return job ? job.jobNumber || job.draftNumber || "" : "";
}

// ---------------------------------------------------------------------------
// Spec templates
// ---------------------------------------------------------------------------

export async function listTestTemplates(ctx: RequestContext, options: { includeInactive?: boolean } = {}) {
  const companyId = requireRead(ctx);
  const rows = await prisma.testSpecTemplate.findMany({ where: { companyId, ...(options.includeInactive ? {} : { active: true }) }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  const counts = await prisma.testReport.groupBy({ by: ["templateId"], where: { companyId, templateId: { not: null } }, _count: { _all: true } });
  const used = new Map(counts.map((c) => [c.templateId, c._count._all]));
  return { items: rows.map((row) => ({ ...templateView(row as unknown as TemplateRow), reportCount: used.get(row.id) ?? 0 })) };
}

export async function getTestTemplate(ctx: RequestContext, id: string) {
  const companyId = requireRead(ctx);
  if (!idShape.test(id)) notFound();
  const row = await prisma.testSpecTemplate.findFirst({ where: { id, companyId } });
  if (!row) notFound();
  return templateView(row as unknown as TemplateRow);
}

export async function createTestTemplate(ctx: RequestContext, raw: unknown) {
  const companyId = requireManage(ctx);
  const input = testTemplateInput.parse(raw);
  requireSomeRows(input);
  const row = await prisma.testSpecTemplate.create({
    data: {
      companyId, name: input.name, machineModels: input.machineModels, layout: input.layout, inputRpm: input.inputRpm,
      labelA: input.labelA, labelB: input.labelB, parameters: input.parameters as Prisma.InputJsonValue, clutchRows: input.clutchRows as Prisma.InputJsonValue,
      createdById: ctx.userId, updatedById: ctx.userId,
    },
  });
  await recordAudit(ctx, { source: "UI", module: "TESTING_REPORTS", entityType: "TestSpecTemplate", entityId: row.id, action: "CREATE", afterData: { name: input.name, layout: input.layout } as Prisma.InputJsonValue });
  return templateView(row as unknown as TemplateRow);
}

function requireSomeRows(input: { parameters: unknown[]; clutchRows: unknown[] }) {
  if (input.parameters.length + input.clutchRows.length === 0) throw new TestingError("TEMPLATE_EMPTY", "Add at least one parameter or clutch row to the template.", 400);
}

// The revision goes up only when the limits or the layout change, not when just the name or the models are edited.
export async function updateTestTemplate(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireManage(ctx);
  if (!idShape.test(id)) notFound();
  const input = testTemplateInput.parse(raw);
  requireSomeRows(input);
  const existing = await prisma.testSpecTemplate.findFirst({ where: { id, companyId } });
  if (!existing) notFound();
  const before = specOf(existing as unknown as TemplateRow);
  const limitsChanged = JSON.stringify([before.layout, before.labelA, before.labelB, before.parameters, before.clutchRows]) !== JSON.stringify([input.layout, input.labelA, input.labelB, input.parameters, input.clutchRows]);
  const row = await prisma.testSpecTemplate.update({
    where: { id },
    data: {
      name: input.name, machineModels: input.machineModels, layout: input.layout, inputRpm: input.inputRpm, labelA: input.labelA, labelB: input.labelB,
      parameters: input.parameters as Prisma.InputJsonValue, clutchRows: input.clutchRows as Prisma.InputJsonValue,
      revision: limitsChanged ? existing.revision + 1 : existing.revision, updatedById: ctx.userId,
    },
  });
  await recordAudit(ctx, { source: "UI", module: "TESTING_REPORTS", entityType: "TestSpecTemplate", entityId: id, action: "UPDATE", afterData: { name: input.name, revision: row.revision, limitsChanged } as Prisma.InputJsonValue });
  return templateView(row as unknown as TemplateRow);
}

// A template that has been used is switched off, never deleted, so old reports keep their link to it.
export async function setTestTemplateActive(ctx: RequestContext, id: string, active: boolean) {
  const companyId = requireManage(ctx);
  if (!idShape.test(id)) notFound();
  const existing = await prisma.testSpecTemplate.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!existing) notFound();
  const row = await prisma.testSpecTemplate.update({ where: { id }, data: { active, updatedById: ctx.userId } });
  await recordAudit(ctx, { source: "UI", module: "TESTING_REPORTS", entityType: "TestSpecTemplate", entityId: id, action: "UPDATE", afterData: { active } as Prisma.InputJsonValue });
  return templateView(row as unknown as TemplateRow);
}

// Adds the three starter templates (777D, R1700G, 120K to 160K) that are not in the company yet, matched by name.
export async function addStarterTestTemplates(ctx: RequestContext) {
  const companyId = requireManage(ctx);
  const existing = await prisma.testSpecTemplate.findMany({ where: { companyId }, select: { name: true } });
  const have = new Set(existing.map((row) => row.name.toLowerCase()));
  const created: string[] = [];
  for (const starter of STARTER_TEMPLATES) {
    if (have.has(starter.name.toLowerCase())) continue;
    const input = testTemplateInput.parse(starter);
    await prisma.testSpecTemplate.create({
      data: {
        companyId, name: input.name, machineModels: input.machineModels, layout: input.layout, inputRpm: input.inputRpm, labelA: input.labelA, labelB: input.labelB,
        parameters: input.parameters as Prisma.InputJsonValue, clutchRows: input.clutchRows as Prisma.InputJsonValue, createdById: ctx.userId, updatedById: ctx.userId,
      },
    });
    created.push(starter.name);
  }
  if (created.length > 0) await recordAudit(ctx, { source: "UI", module: "TESTING_REPORTS", entityType: "TestSpecTemplate", action: "CREATE", afterData: { starter: created } as Prisma.InputJsonValue });
  return { created };
}

// ---------------------------------------------------------------------------
// Jobs lookup (Testing Technicians have no Jobs access, so this is its own narrow endpoint)
// ---------------------------------------------------------------------------

export async function searchJobsForTesting(ctx: RequestContext, query: string) {
  const companyId = requireRead(ctx);
  const q = query.trim().slice(0, 60);
  const showCustomer = canSeeCustomer(ctx);
  const jobs = await prisma.job.findMany({
    where: {
      companyId,
      ...(q ? { OR: [
        { jobNumber: { contains: q, mode: "insensitive" } },
        { machineModel: { contains: q, mode: "insensitive" } },
        { componentModel: { contains: q, mode: "insensitive" } },
        { machineSerial: { contains: q, mode: "insensitive" } },
        { componentSerial: { contains: q, mode: "insensitive" } },
        ...(showCustomer ? [{ customer: { name: { contains: q, mode: "insensitive" as const } } }] : []),
      ] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { id: true, jobNumber: true, draftNumber: true, machineModel: true, componentModel: true, machineSerial: true, componentSerial: true, customer: { select: { name: true, tradingName: true } } },
  });
  return {
    items: jobs.map((job) => ({
      id: job.id,
      jobNumber: jobLabel(job),
      machineModel: job.machineModel || job.componentModel || "",
      serialNumber: job.componentSerial || job.machineSerial || "",
      customerName: showCustomer ? job.customer?.tradingName || job.customer?.name || "" : "",
    })),
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

function listItem(row: ReportRow & { job: { jobNumber: string | null; draftNumber: string | null } | null; template: { name: string } | null }, showCustomer: boolean) {
  const spec = reportSpec(row);
  const live = summarizeReport(spec, readingsOf(row.readings));
  const status = row.status as "DRAFT" | "COMPLETED";
  const stored = row.resultSummary && typeof row.resultSummary === "object" ? (row.resultSummary as Partial<ReportSummary>) : null;
  return {
    id: row.id,
    number: row.number,
    label: reportNumberLabel(row.number),
    status,
    // A completed test shows the result it was completed with; a draft shows how it stands now (null until a reading fails or all are in).
    result: (status === "COMPLETED" ? row.result : live.result) as TestResultId | null,
    entered: status === "COMPLETED" ? stored?.entered ?? live.entered : live.entered,
    total: status === "COMPLETED" ? stored?.total ?? live.total : live.total,
    fail: live.fail,
    jobId: row.jobId,
    jobNumber: jobLabel(row.job),
    customerName: showCustomer ? row.customerName ?? "" : "",
    machineModel: row.machineModel,
    serialNumber: row.serialNumber ?? "",
    testers: row.testers,
    testDate: isoDate(row.testDate),
    templateName: spec.name,
    retestOfId: row.retestOfId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listTestReports(ctx: RequestContext, options: { jobId?: string; q?: string } = {}) {
  const companyId = requireRead(ctx);
  const showCustomer = canSeeCustomer(ctx);
  const q = (options.q ?? "").trim().slice(0, 60);
  if (options.jobId && !idShape.test(options.jobId)) notFound();
  const rows = await prisma.testReport.findMany({
    where: {
      companyId,
      ...(options.jobId ? { jobId: options.jobId } : {}),
      ...(q ? { OR: [
        { machineModel: { contains: q, mode: "insensitive" } },
        { serialNumber: { contains: q, mode: "insensitive" } },
        { job: { jobNumber: { contains: q, mode: "insensitive" } } },
        ...(showCustomer ? [{ customerName: { contains: q, mode: "insensitive" as const } }] : []),
      ] } : {}),
    },
    orderBy: [{ number: "desc" }],
    take: 500,
    include: { job: { select: { jobNumber: true, draftNumber: true } }, template: { select: { name: true } } },
  });
  return { items: rows.map((row) => listItem(row as never, showCustomer)) };
}

export async function getTestReport(ctx: RequestContext, id: string) {
  const companyId = requireRead(ctx);
  if (!idShape.test(id)) notFound();
  const row = await prisma.testReport.findFirst({
    where: { id, companyId },
    include: {
      job: { select: { id: true, jobNumber: true, draftNumber: true } },
      template: { select: { id: true, name: true, revision: true, active: true } },
      retestOf: { select: { id: true, number: true } },
      retests: { select: { id: true, number: true, status: true, result: true }, orderBy: { number: "asc" } },
    },
  });
  if (!row) notFound();
  const spec = reportSpec(row as never);
  const readings = readingsOf(row.readings);
  const summary = summarizeReport(spec, readings);
  const status = row.status as "DRAFT" | "COMPLETED";
  return {
    id: row.id,
    number: row.number,
    label: reportNumberLabel(row.number),
    status,
    result: (status === "COMPLETED" ? row.result : summary.result) as TestResultId | null,
    summary,
    spec,
    readings,
    machineModel: row.machineModel,
    serialNumber: row.serialNumber ?? "",
    customerName: canSeeCustomer(ctx) ? row.customerName ?? "" : "",
    testDate: isoDate(row.testDate),
    inputRpm: row.inputRpm,
    testType: row.testType ?? "",
    testers: row.testers,
    comments: row.comments ?? "",
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
    job: row.job ? { id: row.job.id, jobNumber: jobLabel(row.job) } : null,
    template: row.template ? { id: row.template.id, name: row.template.name, revision: row.template.revision, active: row.template.active } : null,
    retestOf: row.retestOf ? { id: row.retestOf.id, label: reportNumberLabel(row.retestOf.number) } : null,
    retests: row.retests.map((r) => ({ id: r.id, label: reportNumberLabel(r.number), status: r.status as string, result: r.result as string | null })),
  };
}

async function createWithNumber(companyId: string, data: Omit<Prisma.TestReportUncheckedCreateInput, "number" | "companyId">) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const last = await prisma.testReport.findFirst({ where: { companyId }, orderBy: { number: "desc" }, select: { number: true } });
    try {
      return await prisma.testReport.create({ data: { ...data, companyId, number: (last?.number ?? 0) + 1 } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new TestingError("NUMBER_UNAVAILABLE", "Could not reserve a report number. Please try again.");
}

export async function createTestReport(ctx: RequestContext, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = testReportCreateInput.parse(raw);
  const template = await prisma.testSpecTemplate.findFirst({ where: { id: input.templateId, companyId } });
  if (!template || !template.active) throw new TestingError("TEMPLATE_UNAVAILABLE", "That spec template is not available. Pick another one.", 400);
  let job: { id: string; machineModel: string | null; componentModel: string | null; machineSerial: string | null; componentSerial: string | null; customer: { name: string; tradingName: string | null } | null } | null = null;
  if (input.jobId) {
    job = await prisma.job.findFirst({ where: { id: input.jobId, companyId }, select: { id: true, machineModel: true, componentModel: true, machineSerial: true, componentSerial: true, customer: { select: { name: true, tradingName: true } } } });
    if (!job) throw new TestingError("JOB_NOT_FOUND", "That job was not found.", 400);
  }
  const machineModel = input.machineModel || job?.machineModel || job?.componentModel || template.machineModels[0] || "";
  if (!machineModel) throw new TestingError("MODEL_REQUIRED", "Enter the machine model.", 400);
  const spec = specOf(template as unknown as TemplateRow);
  const row = await createWithNumber(companyId, {
    jobId: job?.id ?? null,
    templateId: template.id,
    spec: spec as unknown as Prisma.InputJsonValue,
    machineModel,
    serialNumber: input.serialNumber || job?.componentSerial || job?.machineSerial || null,
    customerName: job?.customer ? job.customer.tradingName || job.customer.name : null,
    testDate: new Date(`${input.testDate || todayIso()}T00:00:00.000Z`),
    inputRpm: template.inputRpm,
    testType: input.testType || null,
    readings: {} as Prisma.InputJsonValue,
    testers: [ctx.displayName],
    createdById: ctx.userId,
    updatedById: ctx.userId,
  });
  await recordAudit(ctx, { source: "UI", module: "TESTING_REPORTS", entityType: "TestReport", entityId: row.id, action: "CREATE", afterData: { number: row.number, template: template.name, jobId: job?.id ?? null } as Prisma.InputJsonValue });
  return getTestReport(ctx, row.id);
}

// Keeps only readings for rows that exist in the report's spec, and stamps a "passed with a note" with who did it and when.
function mergeReadings(spec: TestSpec, existing: TestReadings, incoming: NonNullable<TestReportUpdateInput["readings"]>, actor: string): TestReadings {
  const now = new Date().toISOString();
  const clean = (next: { actual: string; note?: string; override?: { reason: string } | null } | undefined, before: TestReading | undefined): TestReading | undefined => {
    if (!next) return before;
    const out: TestReading = { actual: next.actual };
    if (next.note) out.note = next.note;
    const reason = next.override?.reason?.trim();
    if (reason) out.override = before?.override && before.override.reason === reason ? before.override : { reason, by: actor, at: now };
    return out;
  };
  const params: NonNullable<TestReadings["params"]> = {};
  for (const row of spec.parameters) {
    const merged = clean(incoming.params[row.id], existing.params?.[row.id]);
    if (merged) params[row.id] = merged;
  }
  const clutches: NonNullable<TestReadings["clutches"]> = {};
  for (const row of spec.clutchRows) {
    const cell: { a?: TestReading; b?: TestReading } = {};
    const incomingCell = incoming.clutches[row.id];
    const before = existing.clutches?.[row.id];
    const a = row.a ? clean(incomingCell?.a, before?.a) : undefined;
    const b = row.b ? clean(incomingCell?.b, before?.b) : undefined;
    if (a) cell.a = a;
    if (b) cell.b = b;
    if (cell.a || cell.b) clutches[row.id] = cell;
  }
  return { params, clutches };
}

export async function updateTestReport(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireWrite(ctx);
  if (!idShape.test(id)) notFound();
  const input = testReportUpdateInput.parse(raw);
  const existing = await prisma.testReport.findFirst({ where: { id, companyId } });
  if (!existing) notFound();
  if (existing.status === "COMPLETED") throw new TestingError("REPORT_COMPLETED", "This test is complete. A manager can reopen it if something needs changing.");
  const data: Prisma.TestReportUncheckedUpdateInput = { updatedById: ctx.userId };
  if (input.machineModel !== undefined) {
    if (!input.machineModel) throw new TestingError("MODEL_REQUIRED", "Enter the machine model.", 400);
    data.machineModel = input.machineModel;
  }
  if (input.serialNumber !== undefined) data.serialNumber = input.serialNumber || null;
  if (input.customerName !== undefined && canSeeCustomer(ctx)) data.customerName = input.customerName || null;
  if (input.testDate !== undefined) data.testDate = new Date(`${input.testDate}T00:00:00.000Z`);
  if (input.inputRpm !== undefined) data.inputRpm = input.inputRpm;
  if (input.testType !== undefined) data.testType = input.testType || null;
  if (input.testers !== undefined) data.testers = Array.from(new Set(input.testers));
  if (input.comments !== undefined) data.comments = input.comments || null;
  if (input.readings !== undefined) data.readings = mergeReadings(reportSpec(existing as never), readingsOf(existing.readings), input.readings, ctx.displayName) as unknown as Prisma.InputJsonValue;
  await prisma.testReport.update({ where: { id }, data });
  return getTestReport(ctx, id);
}

export async function completeTestReport(ctx: RequestContext, id: string) {
  const companyId = requireWrite(ctx);
  if (!idShape.test(id)) notFound();
  const existing = await prisma.testReport.findFirst({ where: { id, companyId } });
  if (!existing) notFound();
  if (existing.status === "COMPLETED") throw new TestingError("REPORT_COMPLETED", "This test is already complete.");
  const summary = summarizeReport(reportSpec(existing as never), readingsOf(existing.readings));
  const problems = completionProblems(summary, existing.testers);
  if (problems.length > 0 || !summary.result) throw new TestingError("REPORT_INCOMPLETE", problems.join(" ") || "Finish the readings first.", 400);
  await prisma.testReport.update({
    where: { id },
    data: {
      status: "COMPLETED", result: summary.result, completedAt: new Date(), completedById: ctx.userId, updatedById: ctx.userId,
      resultSummary: { total: summary.total, entered: summary.entered, pass: summary.pass, fail: summary.fail, overridden: summary.overridden } as Prisma.InputJsonValue,
    },
  });
  await recordAudit(ctx, { source: "UI", module: "TESTING_REPORTS", entityType: "TestReport", entityId: id, action: "UPDATE", afterData: { completed: true, result: summary.result } as Prisma.InputJsonValue });
  return getTestReport(ctx, id);
}

// A manager can open a completed test again, for example to correct a typing mistake. It stays on file as a draft until completed again.
export async function reopenTestReport(ctx: RequestContext, id: string) {
  const companyId = requireManage(ctx);
  if (!idShape.test(id)) notFound();
  const existing = await prisma.testReport.findFirst({ where: { id, companyId }, select: { id: true, status: true, result: true } });
  if (!existing) notFound();
  if (existing.status !== "COMPLETED") throw new TestingError("REPORT_NOT_COMPLETED", "This test is not complete.");
  await prisma.testReport.update({ where: { id }, data: { status: "DRAFT", result: null, resultSummary: Prisma.JsonNull, completedAt: null, completedById: null, updatedById: ctx.userId } });
  await recordAudit(ctx, { source: "UI", module: "TESTING_REPORTS", entityType: "TestReport", entityId: id, action: "UPDATE", afterData: { reopened: true, previousResult: existing.result } as Prisma.InputJsonValue });
  return getTestReport(ctx, id);
}

export async function deleteTestReport(ctx: RequestContext, id: string) {
  const companyId = requireManage(ctx);
  if (!idShape.test(id)) notFound();
  const existing = await prisma.testReport.findFirst({ where: { id, companyId }, select: { id: true, status: true, number: true } });
  if (!existing) notFound();
  if (existing.status === "COMPLETED") throw new TestingError("REPORT_COMPLETED", "A completed test stays on file. Reopen it first if it was started by mistake.");
  await prisma.testReport.delete({ where: { id } });
  await recordAudit(ctx, { source: "UI", module: "TESTING_REPORTS", entityType: "TestReport", entityId: id, action: "DELETE", afterData: { number: existing.number } as Prisma.InputJsonValue });
  return { ok: true };
}

// A retest repeats a completed test on a fresh, empty sheet that links back to the first one. It keeps the original test's limits.
export async function retestTestReport(ctx: RequestContext, id: string) {
  const companyId = requireWrite(ctx);
  if (!idShape.test(id)) notFound();
  const original = await prisma.testReport.findFirst({ where: { id, companyId } });
  if (!original) notFound();
  if (original.status !== "COMPLETED") throw new TestingError("REPORT_NOT_COMPLETED", "Complete this test before starting a retest.");
  const row = await createWithNumber(companyId, {
    jobId: original.jobId,
    templateId: original.templateId,
    spec: original.spec as Prisma.InputJsonValue,
    machineModel: original.machineModel,
    serialNumber: original.serialNumber,
    customerName: original.customerName,
    testDate: new Date(`${todayIso()}T00:00:00.000Z`),
    inputRpm: original.inputRpm,
    testType: original.testType,
    readings: {} as Prisma.InputJsonValue,
    testers: [ctx.displayName],
    retestOfId: original.id,
    createdById: ctx.userId,
    updatedById: ctx.userId,
  });
  await recordAudit(ctx, { source: "UI", module: "TESTING_REPORTS", entityType: "TestReport", entityId: row.id, action: "CREATE", afterData: { number: row.number, retestOf: original.number } as Prisma.InputJsonValue });
  return getTestReport(ctx, row.id);
}

// The templates that fit a machine model, best first, for the "New test" picker.
export function rankTemplatesForModel<T extends { machineModels: readonly string[] }>(templates: readonly T[], model: string): T[] {
  return [...templates].sort((a, b) => Number(templateMatchesModel(b, model)) - Number(templateMatchesModel(a, model)));
}
