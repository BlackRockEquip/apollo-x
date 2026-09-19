import { Prisma } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit/service";
import { prisma } from "@/lib/prisma";
import { extractPartLinesFromSpreadsheet } from "@/lib/jobs/parts-import";
import { reserveStockTx } from "@/lib/inventory/service";
import { jobKitActiveInput, jobKitCreateInput, jobKitLineBulkAddInput, jobKitLineInput, jobKitListQuery, jobKitUpdateInput } from "./validation";

function notFound(): never { throw new Error("NOT_FOUND"); }
function normalized(value: string) { return value.trim().replace(/\s+/g, " ").toUpperCase(); }
function requireJobKitsRead(ctx: RequestContext) { requireModule(ctx, "JOB_KITS", "READ"); requireTenantPermission(ctx, "JOB_KITS_VIEW"); return ctx.companyId!; }
function requireJobKitsWrite(ctx: RequestContext, permission: "JOB_KITS_CREATE" | "JOB_KITS_EDIT" | "JOB_KITS_DEACTIVATE") { requireModule(ctx, "JOB_KITS", "WRITE"); requireTenantPermission(ctx, permission); return ctx.companyId!; }

async function getPartOrThrow(companyId: string, partId: string) {
  const part = await prisma.part.findFirst({ where: { id: partId, companyId, active: true }, select: { id: true, partNumber: true, description: true } });
  if (!part) notFound();
  return part;
}

export async function listJobKits(ctx: RequestContext, raw: unknown) {
  const companyId = requireJobKitsRead(ctx);
  const query = jobKitListQuery.parse(raw);
  const skip = (query.page - 1) * query.pageSize;
  const contains = { contains: query.q, mode: "insensitive" as const };
  const where: Prisma.JobKitWhereInput = {
    companyId,
    ...(query.status === "all" ? {} : { active: query.status === "active" }),
    ...(query.q ? { OR: [{ name: contains }, { description: contains }, { machineMake: contains }, { machineModel: contains }, { componentType: contains }] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.jobKit.count({ where }),
    prisma.jobKit.findMany({
      where,
      orderBy: [{ active: "desc" }, { name: "asc" }],
      skip,
      take: query.pageSize,
      include: { _count: { select: { lines: true } }, lines: { select: { quantityDefault: true } } },
    }),
  ]);
  return {
    items: items.map((kit) => ({
      ...kit,
      lineCount: kit._count.lines,
      totalQuantity: kit.lines.reduce((sum, line) => sum.plus(line.quantityDefault), new Prisma.Decimal(0)),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getJobKitById(ctx: RequestContext, id: string) {
  const companyId = requireJobKitsRead(ctx);
  const kit = await prisma.jobKit.findFirst({
    where: { id, companyId },
    include: {
      createdBy: { select: { id: true, displayName: true, email: true } },
      lines: { include: { part: { select: { id: true, partNumber: true, description: true, unitOfMeasure: true, active: true } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!kit) notFound();
  return kit;
}

export async function createJobKit(ctx: RequestContext, raw: unknown) {
  const companyId = requireJobKitsWrite(ctx, "JOB_KITS_CREATE");
  const input = jobKitCreateInput.parse(raw);
  for (const line of input.lines) await getPartOrThrow(companyId, line.partId);
  const created = await prisma.$transaction(async (tx) => {
    const kit = await tx.jobKit.create({
      data: {
        companyId,
        name: input.name,
        nameNormalized: normalized(input.name),
        description: input.description,
        machineMake: input.machineMake,
        machineModel: input.machineModel,
        componentType: input.componentType,
        active: input.active,
        createdById: ctx.userId,
        lines: input.lines.length ? {
          create: input.lines.map((line, index) => ({
            companyId,
            partId: line.partId,
            quantityDefault: new Prisma.Decimal(line.quantityDefault),
            notes: line.notes,
            sortOrder: line.sortOrder ?? index,
          })),
        } : undefined,
      },
      include: { lines: { include: { part: { select: { id: true, partNumber: true, description: true, unitOfMeasure: true, active: true } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });
    return kit;
  });
  await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKit", entityId: created.id, action: "CREATE", afterData: { id: created.id, lineCount: created.lines.length } });
  return created;
}

export async function updateJobKit(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireJobKitsWrite(ctx, "JOB_KITS_EDIT");
  const input = jobKitUpdateInput.parse(raw);
  const existing = await prisma.jobKit.findFirst({ where: { id, companyId } });
  if (!existing) notFound();
  const updated = await prisma.jobKit.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name, nameNormalized: normalized(input.name) } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.machineMake !== undefined ? { machineMake: input.machineMake } : {}),
      ...(input.machineModel !== undefined ? { machineModel: input.machineModel } : {}),
      ...(input.componentType !== undefined ? { componentType: input.componentType } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
    include: { lines: { include: { part: { select: { id: true, partNumber: true, description: true, unitOfMeasure: true, active: true } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKit", entityId: updated.id, action: "UPDATE", afterData: { id: updated.id } });
  return updated;
}

export async function setJobKitActive(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireJobKitsWrite(ctx, "JOB_KITS_DEACTIVATE");
  const input = jobKitActiveInput.parse(raw);
  const existing = await prisma.jobKit.findFirst({ where: { id, companyId } });
  if (!existing) notFound();
  const updated = await prisma.jobKit.update({
    where: { id },
    data: { active: input.active },
    include: { lines: { include: { part: { select: { id: true, partNumber: true, description: true, unitOfMeasure: true, active: true } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKit", entityId: updated.id, action: input.active ? "REACTIVATE" : "DEACTIVATE", afterData: { id: updated.id, active: updated.active } });
  return updated;
}

// 2026-09-19, user request: "add a delete button to kits created." Gated
// behind JOB_KITS_DEACTIVATE (the existing permission for the other
// destructive kit action — deactivate) rather than a brand-new permission,
// to avoid adding a fresh permission-scoping surface for what's otherwise a
// one-off ask (a new permission would also need its own entry in every
// default role set in auth/permissions.ts). Safe as a real, unconditional
// delete: JobKitLine.jobKit is `onDelete: Cascade` in schema.prisma (so a
// kit's lines are removed automatically, same transaction), and nothing
// else holds a hard FK to JobKit — a job's own history of a kit having been
// applied lives in JobActivity/AuditEvent as plain JSON metadata (kitId/
// kitName captured at the time), not a live relation, so it stays intact
// and readable even after the kit itself is deleted.
export async function deleteJobKit(ctx: RequestContext, id: string) {
  const companyId = requireJobKitsWrite(ctx, "JOB_KITS_DEACTIVATE");
  const existing = await prisma.jobKit.findFirst({ where: { id, companyId }, select: { id: true, name: true } });
  if (!existing) notFound();
  await prisma.jobKit.delete({ where: { id } });
  await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKit", entityId: id, action: "DELETE", afterData: { id, name: existing.name } });
  return { id };
}

// 2026-09-19, user request: "when creating a kit, make the Manufacturer
// field dropdown based on manufacturers listed." Same lightweight-endpoint
// pattern as listMechanicOptions (jobs/service.ts, added earlier this same
// day) rather than reusing either of the two manufacturer-list endpoints
// that already exist: /api/v1/inventory/manufacturers is gated behind
// INVENTORY_VIEW and /api/v1/master-data/manufacturers behind its own
// admin permission — neither is guaranteed to be held by a user who only
// has Job Kits access, which is exactly the permission-scoping mismatch bug
// class this engagement has hit (and fixed) several times already. Gated
// on JOB_KITS_VIEW instead — the same permission that already gates this
// page — so it can never silently come back empty for a Job-Kits-only user.
export async function listJobKitManufacturerOptions(ctx: RequestContext) {
  const companyId = requireJobKitsRead(ctx);
  const manufacturers = await prisma.manufacturer.findMany({
    where: { companyId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { items: manufacturers };
}

export async function addJobKitLine(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireJobKitsWrite(ctx, "JOB_KITS_EDIT");
  const input = jobKitLineInput.parse(raw);
  await getPartOrThrow(companyId, input.partId);
  const existing = await prisma.jobKit.findFirst({ where: { id, companyId } });
  if (!existing) notFound();
  const line = await prisma.jobKitLine.create({
    data: {
      companyId,
      jobKitId: id,
      partId: input.partId,
      quantityDefault: new Prisma.Decimal(input.quantityDefault),
      notes: input.notes,
      sortOrder: input.sortOrder ?? 0,
    },
    include: { part: { select: { id: true, partNumber: true, description: true, unitOfMeasure: true, active: true } } },
  });
  await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKitLine", entityId: line.id, action: "CREATE", afterData: { jobKitId: id, partId: input.partId } });
  return getJobKitById(ctx, id);
}

// 2026-09-15, user request: "when adding a kit, make it that you can add a
// part list/import a list that gets saved in table form for that specific
// kit." Mirrors jobs/service.ts's addPartLinesBulk (paste box + spreadsheet
// import, same row parsing / file-parsing approach via parts-import.ts's
// shared extractPartLinesFromSpreadsheet), but unlike a job's own parts list
// a kit line always has to resolve to an existing active catalog Part (the
// FK is required — see schema.prisma's JobKitLine.partId, and the kit
// editor's own copy: "lines stay tenant-scoped to active parts"), so a row
// whose part number doesn't match anything in the catalog is skipped and
// reported back rather than silently dropped or half-created. A row for a
// part already on this kit tops up that line's quantity instead of adding a
// duplicate row, same "top up, don't duplicate" behavior applyJobKitToJob
// already uses when a kit is applied to a job that already has the part.
const ALLOWED_KIT_LINES_IMPORT_MIME_TYPES = [
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_KIT_LINES_IMPORT_FILE_BYTES = 8_000_000;

type ParsedKitLineRow = { partNumber: string; quantity: number };

// "PN-1001, 2" or a tab-separated paste straight out of Excel — part number
// required, quantity optional (defaults to 1, since a kit's part list is
// often just "these parts belong to this kit" with no particular quantity
// in mind until someone edits it).
function parseBulkKitLineRow(raw: string): ParsedKitLineRow | null {
  const cells = (raw.includes("\t") ? raw.split("\t") : raw.split(",")).map((c) => c.trim());
  const partNumber = cells[0] || "";
  if (!partNumber) return null;
  const quantity = cells[1] ? Number(cells[1]) : 1;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return { partNumber, quantity };
}

export type AddJobKitLinesBulkResult = {
  addedCount: number;
  incrementedCount: number;
  skipped: Array<{ partNumber: string; reason: string }>;
};

export async function addJobKitLinesBulk(ctx: RequestContext, id: string, raw: unknown) {
  const companyId = requireJobKitsWrite(ctx, "JOB_KITS_EDIT");
  const input = jobKitLineBulkAddInput.parse(raw);
  const existing = await prisma.jobKit.findFirst({ where: { id, companyId } });
  if (!existing) notFound();

  const pasteRows = (input.bulkLines ?? "")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean)
    .map(parseBulkKitLineRow)
    .filter((r): r is ParsedKitLineRow => r !== null);

  let fileRows: ParsedKitLineRow[] = [];
  if (input.fileName && input.mimeType && input.contentBase64) {
    if (!ALLOWED_KIT_LINES_IMPORT_MIME_TYPES.includes(input.mimeType)) throw new Error("INVALID_ATTACHMENT_TYPE");
    const data = Buffer.from(input.contentBase64, "base64");
    if (data.length > MAX_KIT_LINES_IMPORT_FILE_BYTES) throw new Error("ATTACHMENT_TOO_LARGE");
    fileRows = (await extractPartLinesFromSpreadsheet(data)).map((r) => ({ partNumber: r.partNumber, quantity: r.quantity }));
  }

  const rows = [...pasteRows, ...fileRows];
  let addedCount = 0;
  let incrementedCount = 0;
  const skipped: AddJobKitLinesBulkResult["skipped"] = [];

  if (rows.length > 0) {
    await prisma.$transaction(async (tx) => {
      const currentMax = await tx.jobKitLine.aggregate({ where: { jobKitId: id, companyId }, _max: { sortOrder: true } });
      let nextSortOrder = (currentMax._max.sortOrder ?? -1) + 1;

      for (const row of rows) {
        const partNumberNormalized = normalized(row.partNumber);
        const part = partNumberNormalized ? await tx.part.findFirst({ where: { companyId, partNumberNormalized, active: true }, select: { id: true } }) : null;
        if (!part) { skipped.push({ partNumber: row.partNumber, reason: "No active part with this part number in the catalog." }); continue; }

        const existingLine = await tx.jobKitLine.findFirst({ where: { jobKitId: id, companyId, partId: part.id } });
        if (existingLine) {
          await tx.jobKitLine.update({ where: { id: existingLine.id }, data: { quantityDefault: existingLine.quantityDefault.plus(row.quantity) } });
          incrementedCount += 1;
        } else {
          await tx.jobKitLine.create({ data: { companyId, jobKitId: id, partId: part.id, quantityDefault: new Prisma.Decimal(row.quantity), sortOrder: nextSortOrder } });
          nextSortOrder += 1;
          addedCount += 1;
        }
      }
    });

    if (addedCount > 0 || incrementedCount > 0) {
      await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKit", entityId: id, action: "UPDATE", afterData: { id, bulkImport: { addedCount, incrementedCount, skippedCount: skipped.length } } });
    }
  }

  const kit = await getJobKitById(ctx, id);
  return { ...kit, importResult: { addedCount, incrementedCount, skipped } };
}

export async function updateJobKitLine(ctx: RequestContext, id: string, lineId: string, raw: unknown) {
  const companyId = requireJobKitsWrite(ctx, "JOB_KITS_EDIT");
  const input = jobKitLineInput.partial({ partId: true }).parse(raw);
  const existing = await prisma.jobKitLine.findFirst({ where: { id: lineId, companyId, jobKitId: id } });
  if (!existing) notFound();
  if (input.partId) await getPartOrThrow(companyId, input.partId);
  await prisma.jobKitLine.update({
    where: { id: lineId },
    data: {
      ...(input.partId !== undefined ? { partId: input.partId } : {}),
      ...(input.quantityDefault !== undefined ? { quantityDefault: new Prisma.Decimal(input.quantityDefault) } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
  await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKitLine", entityId: lineId, action: "UPDATE", afterData: { jobKitId: id, lineId } });
  return getJobKitById(ctx, id);
}

export async function removeJobKitLine(ctx: RequestContext, id: string, lineId: string) {
  const companyId = requireJobKitsWrite(ctx, "JOB_KITS_EDIT");
  const existing = await prisma.jobKitLine.findFirst({ where: { id: lineId, companyId, jobKitId: id } });
  if (!existing) notFound();
  await prisma.jobKitLine.delete({ where: { id: lineId } });
  await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKitLine", entityId: lineId, action: "DELETE", afterData: { jobKitId: id, lineId } });
  return getJobKitById(ctx, id);
}

export async function applyJobKitToJob(ctx: RequestContext, jobId: string, kitId: string) {
  requireModule(ctx, "JOBS_WIP", "WRITE");
  requireTenantPermission(ctx, "JOBS_EDIT");
  requireModule(ctx, "JOB_KITS", "READ");
  requireTenantPermission(ctx, "JOB_KITS_VIEW");
  const companyId = ctx.companyId!;

  const result = await prisma.$transaction(async (tx) => {
    const job = await tx.job.findFirst({ where: { id: jobId, companyId }, select: { id: true, jobNumber: true, draftNumber: true, status: true } });
    if (!job) notFound();

    const kit = await tx.jobKit.findFirst({
      where: { id: kitId, companyId, active: true },
      include: { lines: { include: { part: { select: { id: true, partNumber: true, description: true, active: true, binLocationId: true } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });
    if (!kit) notFound();
    if (kit.lines.length === 0) throw new Error("This job kit has no parts.");
    if (kit.lines.some((line) => !line.part.active)) notFound();

    // Targets JobPartLine (the Parts list) rather than the old
    // JobPartRequirement — updated 2026-09-09 alongside the Parts
    // required → Parts list swap (see schema.prisma's JobPartLine comment)
    // so "Apply job kit" stays useful under the new, simpler model. A kit
    // line for a part already on the job's parts list (and not yet
    // received) tops up that line's quantity instead of creating a
    // duplicate row; JobPartLine has no separate notes field, so the kit
    // line's own notes aren't merged in here — the applied-kit detail is
    // still captured below in the job activity's metadata.
    const appliedLines: Array<{ partId: string; partNumber: string; quantityAdded: string; lineId: string; mode: "CREATED" | "INCREMENTED" }> = [];

    for (const line of kit.lines) {
      // 2026-09-19, user request: "once applied to job, let it check stock
      // availability like when adding a part number individually/via
      // import." Mirrors addPartLinesBulk's own stock check exactly
      // (jobs/service.ts): sum StockBalance.quantityOnHand for the part
      // across all locations, mark the line IN_STOCK when there's enough
      // on hand, and best-effort reserve it at the part's own bin location
      // so it shows reserved under Stock Levels and another job can't also
      // claim the same units. Before this, applyJobKitToJob always left a
      // kit-sourced line as plain "PENDING" with nothing reserved, unlike
      // every other way of adding a part to a job's parts list.
      const existing = await tx.jobPartLine.findFirst({ where: { companyId, jobId, partId: line.partId, status: { not: "RECEIVED" } } });
      const balances = await tx.stockBalance.aggregate({ where: { companyId, partId: line.partId }, _sum: { quantityOnHand: true } });
      const onHand = balances._sum.quantityOnHand ?? new Prisma.Decimal(0);

      if (existing) {
        // A line already in PARTIALLY_RECEIVED is mid-receiving — leave its
        // status alone (only the quantity/reservation are affected by
        // topping it up), same caution the receive/unmark flow itself
        // takes about not clobbering that state.
        const newTotal = existing.quantity.plus(line.quantityDefault);
        const inStock = onHand.gte(newTotal);
        const nextStatus = existing.status === "PARTIALLY_RECEIVED" ? existing.status : (inStock ? "IN_STOCK" : "PENDING");
        const updated = await tx.jobPartLine.update({
          where: { id: existing.id },
          data: { quantity: newTotal, status: nextStatus, updatedById: ctx.userId },
        });
        if (inStock && existing.status !== "PARTIALLY_RECEIVED" && line.part.binLocationId) {
          try {
            await reserveStockTx(tx, { ...ctx, companyId }, {
              partId: line.partId,
              locationId: line.part.binLocationId,
              quantity: line.quantityDefault.toString(),
              referenceType: "JOB",
              referenceId: updated.id,
              referenceNumber: job.jobNumber || job.draftNumber,
              reason: `Reserved for job ${job.jobNumber || job.draftNumber}`,
              notes: null,
              expiresAt: null,
              idempotencyKey: undefined,
            });
          } catch {
            // Best-effort, same as addPartLinesBulk — never blocks applying the kit.
          }
        }
        appliedLines.push({ partId: line.partId, partNumber: line.part.partNumber, quantityAdded: line.quantityDefault.toString(), lineId: updated.id, mode: "INCREMENTED" });
      } else {
        const inStock = onHand.gte(line.quantityDefault);
        const created = await tx.jobPartLine.create({
          data: {
            companyId,
            jobId,
            partNumber: line.part.partNumber,
            description: line.part.description,
            quantity: line.quantityDefault,
            status: inStock ? "IN_STOCK" : "PENDING",
            partId: line.partId,
            createdById: ctx.userId,
            updatedById: ctx.userId,
          },
        });
        if (inStock && line.part.binLocationId) {
          try {
            await reserveStockTx(tx, { ...ctx, companyId }, {
              partId: line.partId,
              locationId: line.part.binLocationId,
              quantity: line.quantityDefault.toString(),
              referenceType: "JOB",
              referenceId: created.id,
              referenceNumber: job.jobNumber || job.draftNumber,
              reason: `Reserved for job ${job.jobNumber || job.draftNumber}`,
              notes: null,
              expiresAt: null,
              idempotencyKey: undefined,
            });
          } catch {
            // Best-effort, same as addPartLinesBulk — never blocks applying the kit.
          }
        }
        appliedLines.push({ partId: line.partId, partNumber: line.part.partNumber, quantityAdded: line.quantityDefault.toString(), lineId: created.id, mode: "CREATED" });
      }
    }

    await tx.jobActivity.create({
      data: {
        companyId,
        jobId,
        actorId: ctx.userId,
        type: "KIT_APPLIED",
        description: `Job kit ${kit.name} applied to ${job.jobNumber || job.draftNumber}.`,
        metadata: { kitId: kit.id, kitName: kit.name, appliedLines } as Prisma.InputJsonValue,
      },
    });

    return { kitId: kit.id, kitName: kit.name, appliedLines };
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: jobId, action: "KIT_APPLY", afterData: { jobId, kitId, appliedLines: result.appliedLines } });
  return result;
}