import type { Prisma } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit/service";
import { CommissionError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import { computeRepMonths, lineMonth, money, type CalcLine } from "@/lib/commissions/calc";
import { commissionLineInput, fuelInput, payoutInput, repSettingInput } from "@/lib/commissions/validation";

// ---------------------------------------------------------------------------
// Commissions (2026-11-25). Access: the COMMISSIONS module must be on for the company AND switched on for this user, which
// session.ts only allows for a Company Admin with the opt-in switch in their profile (src/lib/commissions/access.ts); then
//   COMMISSIONS_VIEW  see the tracker            COMMISSIONS_EDIT  add / change lines, fuel, rep rates and payouts
// (both held only by Company Admins). Everything is scoped to the company and audited under module "COMMISSIONS".
// ---------------------------------------------------------------------------

function requireRead(ctx: RequestContext) {
  requireModule(ctx, "COMMISSIONS", "READ");
  requireTenantPermission(ctx, "COMMISSIONS_VIEW");
  return ctx.companyId!;
}

function requireWrite(ctx: RequestContext) {
  requireModule(ctx, "COMMISSIONS", "WRITE");
  requireTenantPermission(ctx, "COMMISSIONS_EDIT");
  return ctx.companyId!;
}

function notFound(): never {
  throw new Error("NOT_FOUND");
}

const num = (value: Prisma.Decimal | number | null | undefined) => (value === null || value === undefined ? 0 : Number(value));
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
const todayIso = () => new Date().toISOString().slice(0, 10);

const lineInclude = {
  invoices: { orderBy: [{ sortOrder: "asc" as const }, { invoicedOn: "asc" as const }] },
  costs: { orderBy: [{ sortOrder: "asc" as const }] },
  job: { select: { id: true, jobNumber: true, draftNumber: true } },
} satisfies Prisma.CommissionLineInclude;

type LineRow = Prisma.CommissionLineGetPayload<{ include: typeof lineInclude }>;

function lineView(row: LineRow) {
  const costs = row.costs.map((cost) => ({ id: cost.id, description: cost.description ?? "", amount: num(cost.amount) }));
  return {
    id: row.id,
    salesRepresentativeId: row.salesRepresentativeId,
    jobId: row.jobId,
    jobReference: row.jobReference,
    jobNumber: row.job ? row.job.jobNumber || row.job.draftNumber : null,
    description: row.description ?? "",
    periodMonth: row.periodMonth,
    fuelCharge: num(row.fuelCharge),
    otherExpenses: num(row.otherExpenses),
    otherExpensesNote: row.otherExpensesNote ?? "",
    rateOverride: row.rateOverride === null ? null : num(row.rateOverride),
    noCommission: row.noCommission,
    notes: row.notes ?? "",
    invoices: row.invoices.map((inv) => ({ id: inv.id, invoiceNumber: inv.invoiceNumber, invoicedOn: isoDate(inv.invoicedOn), amountExVat: num(inv.amountExVat), clientPaidOn: inv.clientPaidOn ? isoDate(inv.clientPaidOn) : null })),
    costs,
    costsTotal: money(costs.reduce((sum, cost) => sum + cost.amount, 0)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export type CommissionLineView = ReturnType<typeof lineView>;

function calcLineOf(line: CommissionLineView): CalcLine & { periodMonth: string; jobReference: string } {
  return {
    id: line.id,
    periodMonth: line.periodMonth,
    jobReference: line.jobReference,
    invoices: line.invoices.map((inv) => ({ amount: inv.amountExVat, invoicedOn: inv.invoicedOn, clientPaidOn: inv.clientPaidOn })),
    costs: line.costsTotal,
    fuelCharge: line.fuelCharge,
    otherExpenses: line.otherExpenses,
    rateOverride: line.rateOverride,
    noCommission: line.noCommission,
    createdAt: line.createdAt,
  };
}

/** Everything the Commissions screen needs, worked out per rep and month. */
export async function getCommissionsOverview(ctx: RequestContext) {
  const companyId = requireRead(ctx);
  const [reps, lineRows, fuelRows, payoutRows] = await Promise.all([
    prisma.salesRepresentative.findMany({ where: { companyId }, orderBy: [{ active: "desc" }, { name: "asc" }], include: { commissionSetting: true } }),
    prisma.commissionLine.findMany({ where: { companyId }, include: lineInclude, orderBy: [{ periodMonth: "asc" }, { createdAt: "asc" }] }),
    prisma.commissionFuelMonth.findMany({ where: { companyId }, orderBy: { month: "asc" } }),
    prisma.commissionPayout.findMany({ where: { companyId }, orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }] }),
  ]);
  const today = todayIso();
  const lines = lineRows.map(lineView);
  const payouts = payoutRows.map((row) => ({ id: row.id, salesRepresentativeId: row.salesRepresentativeId, month: row.month, amount: num(row.amount), paidOn: isoDate(row.paidOn), note: row.note ?? "" }));
  const fuel = fuelRows.map((row) => ({ id: row.id, salesRepresentativeId: row.salesRepresentativeId, month: row.month, amount: num(row.amount) }));
  const repViews = reps.map((rep) => {
    const setting = rep.commissionSetting ? { rate: num(rep.commissionSetting.rate), monthlyTarget: num(rep.commissionSetting.monthlyTarget) } : null;
    const repLines = lines.filter((line) => line.salesRepresentativeId === rep.id);
    const repPayouts = payouts.filter((p) => p.salesRepresentativeId === rep.id);
    const months = setting ? computeRepMonths({ rep: setting, lines: repLines.map(calcLineOf), payouts: repPayouts.map((p) => ({ month: p.month, amount: p.amount })), today }) : {};
    return { id: rep.id, name: rep.name, active: rep.active, setting, months, lineCount: repLines.length, payoutCount: repPayouts.length };
  }).filter((rep) => rep.active || rep.lineCount > 0 || rep.payoutCount > 0 || rep.setting);
  return {
    today,
    canEdit: ctx.tenantPermissions.has("COMMISSIONS_EDIT") && ctx.moduleAccess.get("COMMISSIONS") === "FULL",
    reps: repViews,
    lines,
    fuel,
    payouts,
  };
}

async function repInCompany(companyId: string, salesRepresentativeId: string) {
  const rep = await prisma.salesRepresentative.findFirst({ where: { id: salesRepresentativeId, companyId }, include: { commissionSetting: true } });
  if (!rep) throw new CommissionError("REP_NOT_FOUND", "That sales representative was not found.", 400);
  return rep;
}

async function jobInCompany(companyId: string, jobId: string | null | undefined) {
  if (!jobId) return null;
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId }, select: { id: true } });
  if (!job) throw new CommissionError("JOB_NOT_FOUND", "That job was not found.", 400);
  return job.id;
}

function lineData(input: ReturnType<typeof commissionLineInput.parse>, rateApplies: boolean) {
  const periodMonth = lineMonth(input.invoices);
  if (!periodMonth) throw new CommissionError("INVOICE_DATE_REQUIRED", "Every invoice needs the date it was invoiced.", 400);
  return {
    jobReference: input.jobReference,
    description: input.description ?? null,
    periodMonth,
    fuelCharge: input.fuelCharge,
    otherExpenses: input.otherExpenses,
    otherExpensesNote: input.otherExpensesNote ?? null,
    // A different rate or "no commission" on one line only applies to a rep with no monthly target (see calc.ts).
    rateOverride: rateApplies && input.rateOverridePercent !== null && input.rateOverridePercent !== undefined ? input.rateOverridePercent / 100 : null,
    noCommission: rateApplies ? input.noCommission : false,
    notes: input.notes ?? null,
  };
}

function childRows(input: ReturnType<typeof commissionLineInput.parse>) {
  return {
    invoices: input.invoices.map((inv, index) => ({ invoiceNumber: inv.invoiceNumber, invoicedOn: toDate(inv.invoicedOn), amountExVat: inv.amountExVat, clientPaidOn: inv.clientPaidOn ? toDate(inv.clientPaidOn) : null, sortOrder: index })),
    costs: input.costs.filter((cost) => cost.amount !== 0 || cost.description).map((cost, index) => ({ description: cost.description ?? null, amount: cost.amount, sortOrder: index })),
  };
}

function auditSummary(line: CommissionLineView) {
  return { jobReference: line.jobReference, periodMonth: line.periodMonth, salesRepresentativeId: line.salesRepresentativeId, invoices: line.invoices.map((i) => `${i.invoiceNumber} ${i.invoicedOn} ${i.amountExVat}`), costsTotal: line.costsTotal, fuelCharge: line.fuelCharge, otherExpenses: line.otherExpenses };
}

export async function createCommissionLine(ctx: RequestContext, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = commissionLineInput.parse(raw);
  const rep = await repInCompany(companyId, input.salesRepresentativeId);
  if (!rep.commissionSetting) throw new CommissionError("REP_NOT_SET_UP", `Set ${rep.name}'s commission rate and monthly target first (Rep settings tab).`, 409);
  const jobId = await jobInCompany(companyId, input.jobId);
  const data = lineData(input, num(rep.commissionSetting.monthlyTarget) <= 0);
  const children = childRows(input);
  const created = await prisma.commissionLine.create({
    data: { companyId, salesRepresentativeId: rep.id, jobId, ...data, createdById: ctx.userId, updatedById: ctx.userId, invoices: { create: children.invoices }, costs: { create: children.costs } },
    include: lineInclude,
  });
  const view = lineView(created);
  await recordAudit(ctx, { source: "API", module: "COMMISSIONS", entityType: "CommissionLine", entityId: view.id, action: "COMMISSION_LINE_CREATED", afterData: auditSummary(view) });
  return view;
}

export async function updateCommissionLine(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireWrite(ctx);
  const before = await prisma.commissionLine.findFirst({ where: { id, companyId }, include: lineInclude });
  if (!before) notFound();
  const input = commissionLineInput.parse(raw);
  const rep = await repInCompany(companyId, input.salesRepresentativeId);
  if (!rep.commissionSetting) throw new CommissionError("REP_NOT_SET_UP", `Set ${rep.name}'s commission rate and monthly target first (Rep settings tab).`, 409);
  const jobId = await jobInCompany(companyId, input.jobId);
  const data = lineData(input, num(rep.commissionSetting.monthlyTarget) <= 0);
  const children = childRows(input);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.commissionInvoice.deleteMany({ where: { lineId: id } });
    await tx.commissionCost.deleteMany({ where: { lineId: id } });
    return tx.commissionLine.update({
      where: { id },
      data: { salesRepresentativeId: rep.id, jobId, ...data, updatedById: ctx.userId, invoices: { create: children.invoices }, costs: { create: children.costs } },
      include: lineInclude,
    });
  });
  const view = lineView(updated);
  await recordAudit(ctx, { source: "API", module: "COMMISSIONS", entityType: "CommissionLine", entityId: id, action: "COMMISSION_LINE_UPDATED", beforeData: auditSummary(lineView(before)), afterData: auditSummary(view) });
  return view;
}

export async function deleteCommissionLine(ctx: RequestContext, id: string) {
  const companyId = requireWrite(ctx);
  const before = await prisma.commissionLine.findFirst({ where: { id, companyId }, include: lineInclude });
  if (!before) notFound();
  await prisma.commissionLine.delete({ where: { id } });
  await recordAudit(ctx, { source: "API", module: "COMMISSIONS", entityType: "CommissionLine", entityId: id, action: "COMMISSION_LINE_DELETED", beforeData: auditSummary(lineView(before)) });
  return { ok: true };
}

/** A rep's commission rate (sent as a percentage) and monthly target (0 = no target). */
export async function setCommissionRepSetting(ctx: RequestContext, salesRepresentativeId: string, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = repSettingInput.parse(raw);
  const rep = await repInCompany(companyId, salesRepresentativeId);
  const data = { rate: input.ratePercent / 100, monthlyTarget: input.monthlyTarget, updatedById: ctx.userId };
  const saved = await prisma.commissionRepSetting.upsert({ where: { salesRepresentativeId: rep.id }, create: { companyId, salesRepresentativeId: rep.id, ...data }, update: data });
  await recordAudit(ctx, {
    source: "API", module: "COMMISSIONS", entityType: "CommissionRepSetting", entityId: saved.id, action: "COMMISSION_REP_SETTING_SAVED",
    beforeData: rep.commissionSetting ? { rate: num(rep.commissionSetting.rate), monthlyTarget: num(rep.commissionSetting.monthlyTarget) } : undefined,
    afterData: { rep: rep.name, rate: input.ratePercent / 100, monthlyTarget: input.monthlyTarget },
  });
  return { salesRepresentativeId: rep.id, rate: num(saved.rate), monthlyTarget: num(saved.monthlyTarget) };
}

/** The rep's own fuel used for a month. Cost tracking only; never part of the commission. Null or 0 clears it. */
export async function setCommissionFuel(ctx: RequestContext, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = fuelInput.parse(raw);
  const rep = await repInCompany(companyId, input.salesRepresentativeId);
  if (!input.amount) {
    await prisma.commissionFuelMonth.deleteMany({ where: { companyId, salesRepresentativeId: rep.id, month: input.month } });
    await recordAudit(ctx, { source: "API", module: "COMMISSIONS", entityType: "CommissionFuelMonth", action: "COMMISSION_FUEL_CLEARED", afterData: { rep: rep.name, month: input.month } });
    return { salesRepresentativeId: rep.id, month: input.month, amount: 0 };
  }
  const saved = await prisma.commissionFuelMonth.upsert({
    where: { salesRepresentativeId_month: { salesRepresentativeId: rep.id, month: input.month } },
    create: { companyId, salesRepresentativeId: rep.id, month: input.month, amount: input.amount, updatedById: ctx.userId },
    update: { amount: input.amount, updatedById: ctx.userId },
  });
  await recordAudit(ctx, { source: "API", module: "COMMISSIONS", entityType: "CommissionFuelMonth", entityId: saved.id, action: "COMMISSION_FUEL_SAVED", afterData: { rep: rep.name, month: input.month, amount: input.amount } });
  return { salesRepresentativeId: rep.id, month: input.month, amount: num(saved.amount) };
}

export async function addCommissionPayout(ctx: RequestContext, raw: unknown) {
  const companyId = requireWrite(ctx);
  const input = payoutInput.parse(raw);
  const rep = await repInCompany(companyId, input.salesRepresentativeId);
  const saved = await prisma.commissionPayout.create({ data: { companyId, salesRepresentativeId: rep.id, month: input.month, amount: input.amount, paidOn: toDate(input.paidOn), note: input.note ?? null, createdById: ctx.userId } });
  await recordAudit(ctx, { source: "API", module: "COMMISSIONS", entityType: "CommissionPayout", entityId: saved.id, action: "COMMISSION_PAYOUT_ADDED", afterData: { rep: rep.name, month: input.month, amount: input.amount, paidOn: input.paidOn } });
  return { id: saved.id };
}

export async function deleteCommissionPayout(ctx: RequestContext, id: string) {
  const companyId = requireWrite(ctx);
  const before = await prisma.commissionPayout.findFirst({ where: { id, companyId } });
  if (!before) notFound();
  await prisma.commissionPayout.delete({ where: { id } });
  await recordAudit(ctx, { source: "API", module: "COMMISSIONS", entityType: "CommissionPayout", entityId: id, action: "COMMISSION_PAYOUT_DELETED", beforeData: { salesRepresentativeId: before.salesRepresentativeId, month: before.month, amount: num(before.amount), paidOn: isoDate(before.paidOn) } });
  return { ok: true };
}

/** Job lookup for the line dialog: picking a job fills in its number, description and sales rep. */
export async function searchJobsForCommissions(ctx: RequestContext, query: string) {
  const companyId = requireRead(ctx);
  const q = query.trim().slice(0, 60);
  if (q.length < 2) return { items: [] };
  const jobs = await prisma.job.findMany({
    where: { companyId, OR: [
      { jobNumber: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
    ] },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, jobNumber: true, draftNumber: true, description: true, salesRepresentativeId: true, machineModel: true, componentModel: true, customer: { select: { name: true, tradingName: true } } },
  });
  return {
    items: jobs.map((job) => ({
      id: job.id,
      jobNumber: job.jobNumber || job.draftNumber,
      description: job.description ?? "",
      salesRepresentativeId: job.salesRepresentativeId,
      machine: job.machineModel || job.componentModel || "",
      customerName: job.customer?.tradingName || job.customer?.name || "",
    })),
  };
}
