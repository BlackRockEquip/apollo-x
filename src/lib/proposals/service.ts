import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";
import { requirePlatformPermission } from "@/lib/auth/guards";
import {
  PROPOSAL_STATUSES,
  calcProposal,
  defaultPriceList,
  newProposalFromPriceList,
  normalizePriceList,
  priceListSchema,
  proposalDataSchema,
  type PriceList,
  type ProposalData,
  type ProposalStatusValue,
} from "@/lib/proposals/model";

// 2026-10-21 — Platform > Proposals. Flo X's own sales proposals / quotations, kept in the platform (no company).
// Read = PLATFORM_SUPPORT_READ, write = PLATFORM_SUPPORT_WRITE (same people who handle demo requests);
// the price list is Platform Settings, so it uses PLATFORM_CONFIGURATION_MANAGE like the other platform settings.

export type ProposalRow = {
  id: string;
  number: string;
  status: ProposalStatusValue;
  clientCompany: string;
  contactName: string | null;
  onceOffTotal: number;
  monthlyTotal: number;
  demoRequestId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  decidedAt: string | null;
};
export type ProposalDetail = ProposalRow & { data: ProposalData };

function requirePlatformContext(ctx: RequestContext) {
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
}
function canRead(ctx: RequestContext) {
  requirePlatformPermission(ctx, "PLATFORM_SUPPORT_READ");
  requirePlatformContext(ctx);
}
function canWrite(ctx: RequestContext) {
  requirePlatformPermission(ctx, "PLATFORM_SUPPORT_WRITE");
  requirePlatformContext(ctx);
}

type ProposalDbRow = {
  id: string; number: string; status: ProposalStatusValue; clientCompany: string; contactName: string | null;
  onceOffTotal: Prisma.Decimal | number; monthlyTotal: Prisma.Decimal | number; demoRequestId: string | null; createdByName: string | null;
  createdAt: Date; updatedAt: Date; sentAt: Date | null; decidedAt: Date | null;
};
const num = (v: Prisma.Decimal | number) => (typeof v === "number" ? v : v.toNumber());
function toRow(r: ProposalDbRow): ProposalRow {
  return {
    id: r.id, number: r.number, status: r.status, clientCompany: r.clientCompany, contactName: r.contactName,
    onceOffTotal: num(r.onceOffTotal), monthlyTotal: num(r.monthlyTotal), demoRequestId: r.demoRequestId, createdByName: r.createdByName,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    sentAt: r.sentAt ? r.sentAt.toISOString() : null, decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
  };
}

async function audit(ctx: RequestContext, entityType: string, entityId: string, action: string, afterData: Prisma.InputJsonValue, beforeData?: Prisma.InputJsonValue) {
  await prisma.auditEvent.create({
    data: { actorId: ctx.userId, source: "PLATFORM", module: "PLATFORM", entityType, entityId, action, correlationId: ctx.correlationId, afterData, ...(beforeData ? { beforeData } : {}) },
  });
}

// ---------------------------------------------------------------- price list

export async function getPriceList(ctx: RequestContext): Promise<PriceList> {
  // Proposal writers read it to start a proposal; platform configuration managers read it to edit it.
  if (!ctx.platformPermissions.has("PLATFORM_CONFIGURATION_MANAGE")) requirePlatformPermission(ctx, "PLATFORM_SUPPORT_READ");
  requirePlatformContext(ctx);
  const settings = await prisma.platformSettings.findUnique({ where: { id: "platform" }, select: { proposalPriceList: true } });
  return settings?.proposalPriceList ? normalizePriceList(settings.proposalPriceList) : defaultPriceList();
}

export async function updatePriceList(ctx: RequestContext, raw: unknown): Promise<PriceList> {
  requirePlatformPermission(ctx, "PLATFORM_CONFIGURATION_MANAGE");
  requirePlatformContext(ctx);
  const list = priceListSchema.parse(raw);
  const json = list as unknown as Prisma.InputJsonValue;
  await prisma.platformSettings.upsert({ where: { id: "platform" }, create: { id: "platform", proposalPriceList: json }, update: { proposalPriceList: json } });
  await audit(ctx, "PlatformSettings", "platform", "PLATFORM_PROPOSAL_PRICES_UPDATED", { products: list.products.length, modules: list.products.reduce((n, p) => n + p.modules.length, 0), platformFee: list.platformFee });
  return list;
}

export async function resetPriceList(ctx: RequestContext): Promise<PriceList> {
  return updatePriceList(ctx, defaultPriceList());
}

// ---------------------------------------------------------------- numbering

export async function suggestNextNumber(now = new Date()): Promise<string> {
  const prefix = `FX-Q-${now.getUTCFullYear()}-`;
  const last = await prisma.proposal.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } });
  const lastN = last ? Number.parseInt(last.number.slice(prefix.length), 10) : 0;
  return `${prefix}${String((Number.isFinite(lastN) ? lastN : 0) + 1).padStart(4, "0")}`;
}

// ---------------------------------------------------------------- reading

export async function listProposals(ctx: RequestContext, status?: ProposalStatusValue): Promise<ProposalRow[]> {
  canRead(ctx);
  const rows = await prisma.proposal.findMany({ where: status ? { status } : undefined, orderBy: { createdAt: "desc" }, take: 500 });
  return rows.map(toRow);
}

export async function countProposalsByStatus(ctx: RequestContext): Promise<Record<ProposalStatusValue, number>> {
  canRead(ctx);
  const groups = await prisma.proposal.groupBy({ by: ["status"], _count: { _all: true } });
  const out = { DRAFT: 0, SENT: 0, ACCEPTED: 0, DECLINED: 0 } as Record<ProposalStatusValue, number>;
  for (const g of groups) out[g.status as ProposalStatusValue] = g._count._all;
  return out;
}

export async function getProposal(ctx: RequestContext, id: string): Promise<ProposalDetail> {
  canRead(ctx);
  const row = await prisma.proposal.findUnique({ where: { id } });
  if (!row) throw new Error("NOT_FOUND");
  const parsed = proposalDataSchema.safeParse(row.data);
  return { ...toRow(row), data: (parsed.success ? parsed.data : row.data) as unknown as ProposalData };
}

/** A fresh proposal for the builder: price-list snapshot + (optionally) the details from a demo request. */
export async function getNewProposalSeed(ctx: RequestContext, demoRequestId?: string | null): Promise<{ data: ProposalData; demoRequestId: string | null }> {
  canRead(ctx);
  const [list, number] = await Promise.all([getPriceList(ctx), suggestNextNumber()]);
  let client: Partial<ProposalData["client"]> | undefined;
  let linked: string | null = null;
  if (demoRequestId) {
    const demo = await prisma.demoRequest.findUnique({ where: { id: demoRequestId }, select: { id: true, name: true, email: true, company: true, phone: true } });
    if (demo) {
      linked = demo.id;
      client = { company: demo.company ?? "", contact: demo.name, email: demo.email, phone: demo.phone ?? "" };
    }
  }
  return { data: newProposalFromPriceList(list, number, client), demoRequestId: linked };
}

// ---------------------------------------------------------------- writing

function columnsFor(data: ProposalData) {
  const calc = calcProposal(data);
  return {
    clientCompany: data.client.company,
    contactName: data.client.contact || null,
    clientEmail: data.client.email || null,
    clientPhone: data.client.phone || null,
    clientAddress: data.client.address || null,
    onceOffTotal: calc.onceTotals.total,
    monthlyTotal: calc.monthlyTotals.total,
    data: data as unknown as Prisma.InputJsonValue,
  };
}

const createSchema = z.object({ data: proposalDataSchema, demoRequestId: z.string().trim().min(1).max(60).nullish() });

export async function createProposal(ctx: RequestContext, raw: unknown): Promise<ProposalDetail> {
  canWrite(ctx);
  const input = createSchema.parse(raw);
  const data: ProposalData = input.data as ProposalData;
  if (input.demoRequestId) {
    const demo = await prisma.demoRequest.findUnique({ where: { id: input.demoRequestId }, select: { id: true } });
    if (!demo) throw new Error("NOT_FOUND");
  }
  let created: Awaited<ReturnType<typeof prisma.proposal.create>> | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    // Keep the typed number unless somebody already holds it - then take the next free one.
    const wanted = attempt === 0 && data.quote.number.trim() ? data.quote.number.trim() : await suggestNextNumber();
    const taken = await prisma.proposal.findUnique({ where: { number: wanted }, select: { id: true } });
    data.quote.number = taken ? await suggestNextNumber() : wanted;
    try {
      created = await prisma.proposal.create({
        data: { number: data.quote.number, status: "DRAFT", demoRequestId: input.demoRequestId ?? null, createdById: ctx.userId, createdByName: ctx.displayName, ...columnsFor(data) },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  if (!created) throw new Error("PROPOSAL_NUMBER_UNAVAILABLE");
  await audit(ctx, "Proposal", created.id, "PLATFORM_PROPOSAL_CREATED", { number: created.number, client: created.clientCompany, demoRequestId: created.demoRequestId });
  return { ...toRow(created), data };
}

export async function updateProposal(ctx: RequestContext, id: string, raw: unknown): Promise<ProposalDetail> {
  canWrite(ctx);
  const data = proposalDataSchema.parse(raw) as ProposalData;
  const existing = await prisma.proposal.findUnique({ where: { id }, select: { id: true, number: true } });
  if (!existing) throw new Error("NOT_FOUND");
  const clash = await prisma.proposal.findFirst({ where: { number: data.quote.number, NOT: { id } }, select: { id: true } });
  if (clash) throw new Error("PROPOSAL_NUMBER_TAKEN");
  const updated = await prisma.proposal.update({ where: { id }, data: { number: data.quote.number, ...columnsFor(data) } });
  await audit(ctx, "Proposal", id, "PLATFORM_PROPOSAL_UPDATED", { number: updated.number, client: updated.clientCompany });
  return { ...toRow(updated), data };
}

const statusSchema = z.object({ status: z.enum(PROPOSAL_STATUSES) });

export async function setProposalStatus(ctx: RequestContext, id: string, raw: unknown): Promise<ProposalRow> {
  canWrite(ctx);
  const { status } = statusSchema.parse(raw);
  const existing = await prisma.proposal.findUnique({ where: { id }, select: { id: true, status: true, sentAt: true } });
  if (!existing) throw new Error("NOT_FOUND");
  const now = new Date();
  const updated = await prisma.proposal.update({
    where: { id },
    data: {
      status,
      sentAt: status === "DRAFT" ? null : existing.sentAt ?? now,
      decidedAt: status === "ACCEPTED" || status === "DECLINED" ? now : null,
    },
  });
  await audit(ctx, "Proposal", id, "PLATFORM_PROPOSAL_STATUS", { status }, { status: existing.status });
  return toRow(updated);
}

export async function deleteProposal(ctx: RequestContext, id: string): Promise<void> {
  canWrite(ctx);
  const existing = await prisma.proposal.findUnique({ where: { id }, select: { id: true, number: true, clientCompany: true } });
  if (!existing) throw new Error("NOT_FOUND");
  await prisma.proposal.delete({ where: { id } });
  await audit(ctx, "Proposal", id, "PLATFORM_PROPOSAL_DELETED", { number: existing.number, client: existing.clientCompany });
}
