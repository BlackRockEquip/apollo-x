import type { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";
import { AuthorizationError, requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit/service";
import { StockError } from "@/lib/http/errors";
import { createPickSlip } from "@/lib/inventory/service";
import { canHandlePickSlipRequests, mergeRequestLines, pickSlipRequestCreateInput, pickSlipRequestDeclineInput, pickSlipRequestQuery } from "@/lib/inventory/pick-request-rules";

// 2026-10-27, user request (Mechanic view): "if a user selects parts in stock, allow a user to request a picking slip to be
// created." A mechanic cannot issue stock, so on Stock Levels they send a request (a job plus parts and quantities). A request
// moves no stock. A store controller, manager or company admin turns it into a real picking slip, which is the same
// createPickSlip as always (that is what takes the stock), or declines it. See PickSlipRequest in schema.prisma.

function notFound(): never {
  throw new Error("NOT_FOUND");
}

// Stock on hand less what is reserved, summed over every location, as the Stock Levels table shows it.
function availableOf(balances: { quantityOnHand: unknown; quantityReserved: unknown }[]): number {
  return balances.reduce((sum, b) => sum + (Number(b.quantityOnHand) || 0) - (Number(b.quantityReserved) || 0), 0);
}

async function notifyStoreTeam(companyId: string, type: NotificationType, title: string, message: string, link: string) {
  try {
    const recipients = await prisma.companyMembership.findMany({
      where: { companyId, status: "ACTIVE", role: { in: ["COMPANY_ADMIN", "MANAGER", "STORE_CONTROLLER"] } },
      select: { userId: true },
    });
    if (recipients.length === 0) return;
    await prisma.notification.createMany({ data: recipients.map((r) => ({ companyId, userId: r.userId, type, title, message, link })) });
  } catch {
    // Best effort, like every other notification: a failure here never fails the request itself.
  }
}

async function notifyRequester(companyId: string, userId: string | null, type: NotificationType, title: string, message: string, link: string) {
  if (!userId) return;
  try {
    await prisma.notification.create({ data: { companyId, userId, type, title, message, link } });
  } catch {
    // Best effort.
  }
}

export async function createPickSlipRequest(ctx: RequestContext, raw: unknown) {
  requireModule(ctx, "INVENTORY", "WRITE");
  requireModule(ctx, "PICK_SLIPS", "WRITE");
  requireTenantPermission(ctx, "INVENTORY_ISSUE");
  const input = pickSlipRequestCreateInput.parse(raw);
  const companyId = ctx.companyId!;

  const job = await prisma.job.findFirst({ where: { id: input.jobId, companyId }, select: { id: true, jobNumber: true, draftNumber: true } });
  if (!job) notFound();

  const lines = mergeRequestLines(input.lines);
  const parts = await prisma.part.findMany({
    where: { companyId, id: { in: lines.map((l) => l.partId) }, active: true },
    select: { id: true, partNumber: true, description: true, stockBalances: { select: { quantityOnHand: true, quantityReserved: true } } },
  });
  const byId = new Map(parts.map((p) => [p.id, p]));
  for (const line of lines) {
    const part = byId.get(line.partId);
    if (!part) notFound();
    // The request is for parts that are in stock, and for no more than is there right now.
    const available = availableOf(part.stockBalances);
    if (available <= 0) throw new StockError("PART_NOT_IN_STOCK", `${part.partNumber} is not in stock, so a picking slip cannot be requested for it.`);
    if (Number(line.quantity) > available) throw new StockError("INSUFFICIENT_STOCK", `Only ${available} of ${part.partNumber} is available. Lower the quantity and try again.`);
  }

  const request = await prisma.pickSlipRequest.create({
    data: {
      companyId,
      jobId: job.id,
      requestedById: ctx.userId,
      note: input.note || null,
      lines: { create: lines.map((l) => ({ partId: l.partId, partNumber: byId.get(l.partId)!.partNumber, description: byId.get(l.partId)!.description, quantity: l.quantity })) },
    },
    select: { id: true },
  });

  await recordAudit(ctx, { source: "UI", module: "INVENTORY", entityType: "PickSlipRequest", entityId: request.id, action: "PICK_SLIP_REQUESTED", afterData: { jobId: job.id, lines: lines.length } });
  const jobLabel = job.jobNumber ?? job.draftNumber;
  await notifyStoreTeam(companyId, "PICK_SLIP_REQUESTED", "Picking slip requested", `A picking slip was requested for job ${jobLabel} (${lines.length} part${lines.length === 1 ? "" : "s"}).`, "/inventory");
  return { id: request.id, lineCount: lines.length, jobNumber: jobLabel };
}

export async function listPickSlipRequests(ctx: RequestContext, rawQuery: unknown) {
  requireModule(ctx, "INVENTORY", "READ");
  requireModule(ctx, "PICK_SLIPS", "READ");
  requireTenantPermission(ctx, "INVENTORY_VIEW");
  const query = pickSlipRequestQuery.parse(rawQuery);
  const companyId = ctx.companyId!;
  const handler = canHandlePickSlipRequests(ctx);
  // A mechanic only ever sees their own requests.
  const where = { companyId, ...(query.status === "ALL" ? {} : { status: query.status }), ...(handler ? {} : { requestedById: ctx.userId }) };
  const [rows, total, pending] = await Promise.all([
    prisma.pickSlipRequest.findMany({
      where,
      orderBy: { createdAt: query.status === "PENDING" ? "asc" : "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        job: { select: { jobNumber: true, draftNumber: true, customer: { select: { name: true, tradingName: true } } } },
        requestedBy: { select: { displayName: true } },
        lines: { include: { part: { select: { stockBalances: { select: { quantityOnHand: true, quantityReserved: true } } } } } },
      },
    }),
    prisma.pickSlipRequest.count({ where }),
    prisma.pickSlipRequest.count({ where: { companyId, status: "PENDING", ...(handler ? {} : { requestedById: ctx.userId }) } }),
  ]);
  const showCustomer = ctx.tenantPermissions.has("CUSTOMERS_VIEW");
  return {
    canHandle: handler,
    pendingCount: pending,
    total,
    page: query.page,
    pageSize: query.pageSize,
    items: rows.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      jobNumber: r.job.jobNumber ?? r.job.draftNumber,
      customerName: showCustomer ? r.job.customer?.tradingName || r.job.customer?.name || null : null,
      requestedBy: r.requestedBy?.displayName ?? null,
      createdAt: r.createdAt.toISOString(),
      status: String(r.status),
      note: r.note,
      handledAt: r.handledAt ? r.handledAt.toISOString() : null,
      declineReason: r.declineReason,
      lines: r.lines.map((l) => ({ partNumber: l.partNumber, description: l.description, quantity: l.quantity.toString(), available: availableOf(l.part.stockBalances) })),
    })),
  };
}

async function requireHandler(ctx: RequestContext) {
  requireModule(ctx, "INVENTORY", "WRITE");
  requireModule(ctx, "PICK_SLIPS", "WRITE");
  requireTenantPermission(ctx, "INVENTORY_ISSUE");
  if (!canHandlePickSlipRequests(ctx)) throw new AuthorizationError("Your role can request a picking slip but not create one.");
}

// Creates the real picking slip from a pending request (stock is issued here, exactly as a slip made on Stock Levels) and
// closes the request. The request is claimed first so two people clicking at once cannot make two slips.
export async function fulfilPickSlipRequest(ctx: RequestContext, id: string) {
  await requireHandler(ctx);
  const companyId = ctx.companyId!;
  const request = await prisma.pickSlipRequest.findFirst({ where: { id, companyId }, include: { lines: true, job: { select: { jobNumber: true, draftNumber: true } } } });
  if (!request) notFound();
  const claimed = await prisma.pickSlipRequest.updateMany({ where: { id, companyId, status: "PENDING" }, data: { status: "FULFILLED", handledAt: new Date(), handledById: ctx.userId } });
  if (claimed.count === 0) throw new StockError("REQUEST_ALREADY_HANDLED", "This request has already been dealt with.");

  let result: Awaited<ReturnType<typeof createPickSlip>>;
  try {
    result = await createPickSlip(ctx, { jobId: request.jobId, lines: request.lines.map((l) => ({ partId: l.partId, quantity: l.quantity.toString() })) });
  } catch (error) {
    await prisma.pickSlipRequest.updateMany({ where: { id, companyId, status: "FULFILLED" }, data: { status: "PENDING", handledAt: null, handledById: null } });
    throw error;
  }
  if (result.pickSlip) await prisma.pickSlipRequest.update({ where: { id }, data: { pickSlipId: result.pickSlip.id } });

  await recordAudit(ctx, { source: "UI", module: "INVENTORY", entityType: "PickSlipRequest", entityId: id, action: "PICK_SLIP_REQUEST_FULFILLED", afterData: { jobId: request.jobId, pickSlipId: result.pickSlip?.id ?? null } });
  const jobLabel = request.job.jobNumber ?? request.job.draftNumber;
  await notifyRequester(companyId, request.requestedById, "PICK_SLIP_REQUEST_HANDLED", "Picking slip created", `Your picking slip request for job ${jobLabel} has been picked.`, "/inventory");
  return result;
}

export async function declinePickSlipRequest(ctx: RequestContext, id: string, raw: unknown) {
  await requireHandler(ctx);
  const input = pickSlipRequestDeclineInput.parse(raw ?? {});
  const companyId = ctx.companyId!;
  const request = await prisma.pickSlipRequest.findFirst({ where: { id, companyId }, include: { job: { select: { jobNumber: true, draftNumber: true } } } });
  if (!request) notFound();
  const claimed = await prisma.pickSlipRequest.updateMany({ where: { id, companyId, status: "PENDING" }, data: { status: "DECLINED", handledAt: new Date(), handledById: ctx.userId, declineReason: input.reason || null } });
  if (claimed.count === 0) throw new StockError("REQUEST_ALREADY_HANDLED", "This request has already been dealt with.");
  await recordAudit(ctx, { source: "UI", module: "INVENTORY", entityType: "PickSlipRequest", entityId: id, action: "PICK_SLIP_REQUEST_DECLINED", afterData: { jobId: request.jobId, reason: input.reason || null } });
  await notifyRequester(companyId, request.requestedById, "PICK_SLIP_REQUEST_HANDLED", "Picking slip request declined", `Your picking slip request for job ${request.job.jobNumber ?? request.job.draftNumber} was declined${input.reason ? `: ${input.reason}` : "."}`, "/inventory");
  return { ok: true };
}
