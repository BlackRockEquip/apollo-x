import { Prisma } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit/service";
import { prisma } from "@/lib/prisma";
import { extractPartLinesFromSpreadsheet } from "@/lib/jobs/parts-import";
import { reserveStockTx } from "@/lib/inventory/service";
import { jobKitActiveInput, jobKitCreateInput, jobKitLineBulkAddInput, jobKitLineInput, jobKitLineUpdateInput, jobKitListQuery, jobKitUpdateInput } from "./validation";
import { findPartByNumber, numberAlreadyInUse } from "@/lib/inventory/parts-lookup";
import { looseNormalized, normalized as normalizedPartNumber } from "@/lib/master-data/validation";

function notFound(): never { throw new Error("NOT_FOUND"); }
function normalized(value: string) { return value.trim().replace(/\s+/g, " ").toUpperCase(); }
function requireJobKitsRead(ctx: RequestContext) { requireModule(ctx, "JOB_KITS", "READ"); requireTenantPermission(ctx, "JOB_KITS_VIEW"); return ctx.companyId!; }
function requireJobKitsWrite(ctx: RequestContext, permission: "JOB_KITS_CREATE" | "JOB_KITS_EDIT" | "JOB_KITS_DEACTIVATE") { requireModule(ctx, "JOB_KITS", "WRITE"); requireTenantPermission(ctx, permission); return ctx.companyId!; }

async function getPartOrThrow(companyId: string, partId: string) {
  const part = await prisma.part.findFirst({ where: { id: partId, companyId, active: true }, select: { id: true, partNumber: true, description: true } });
  if (!part) notFound();
  return part;
}

// 2026-10-16, user request: "Job Kits own way to enter parts". A kit line stores its own part
// number and description and is only linked to a catalog part (partId) when the company has Stock
// levels on and the number matches a catalog part. With Stock levels off the catalog is never
// touched, so a kit works for companies that have no parts catalog at all.
function stockTrackingOn(ctx: RequestContext) { return (ctx.moduleAccess.get("INVENTORY") ?? "DENIED") !== "DENIED"; }

type KitLineParts = { partId: string | null; partNumber: string; description: string | null };

async function resolveKitLineParts(ctx: RequestContext, companyId: string, input: { partId?: string | null; partNumber?: string | null; description?: string | null }): Promise<KitLineParts> {
  if (input.partId) {
    const part = await getPartOrThrow(companyId, input.partId);
    return { partId: part.id, partNumber: part.partNumber, description: part.description };
  }
  const rawNumber = (input.partNumber ?? "").trim();
  const typed = looseNormalized(rawNumber) ?? rawNumber;
  if (!typed) throw new Error("Enter a part number.");
  const description = input.description?.trim() || null;
  if (stockTrackingOn(ctx)) {
    const match = await findPartByNumber(prisma, companyId, typed, { id: true, partNumber: true, description: true, active: true });
    if (match?.active) return { partId: match.id, partNumber: match.partNumber, description: description ?? match.description };
  }
  return { partId: null, partNumber: typed, description };
}

// A line already on the kit for the same catalog part, or the same part number, is topped up
// instead of getting a second row.
function findKitLineMatch(client: Prisma.TransactionClient | typeof prisma, companyId: string, kitId: string, parts: KitLineParts) {
  return client.jobKitLine.findFirst({
    where: { companyId, jobKitId: kitId, OR: [...(parts.partId ? [{ partId: parts.partId }] : []), { partNumber: parts.partNumber }] },
    orderBy: { createdAt: "asc" },
  });
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
  const resolvedLines: Array<KitLineParts & { quantity: Prisma.Decimal; notes: string | null | undefined; sortOrder: number | undefined }> = [];
  for (const line of input.lines) {
    const parts = await resolveKitLineParts(ctx, companyId, line);
    const duplicate = resolvedLines.find((row) => (parts.partId && row.partId === parts.partId) || row.partNumber === parts.partNumber);
    if (duplicate) duplicate.quantity = duplicate.quantity.plus(line.quantityDefault);
    else resolvedLines.push({ ...parts, quantity: new Prisma.Decimal(line.quantityDefault), notes: line.notes, sortOrder: line.sortOrder });
  }
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
        lines: resolvedLines.length ? {
          create: resolvedLines.map((line, index) => ({
            companyId,
            partId: line.partId,
            partNumber: line.partNumber,
            description: line.description,
            quantityDefault: line.quantity,
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
  const existing = await prisma.jobKit.findFirst({ where: { id, companyId } });
  if (!existing) notFound();
  const parts = await resolveKitLineParts(ctx, companyId, input);
  const match = await findKitLineMatch(prisma, companyId, id, parts);
  const line = match
    ? await prisma.jobKitLine.update({ where: { id: match.id }, data: { quantityDefault: match.quantityDefault.plus(input.quantityDefault) } })
    : await prisma.jobKitLine.create({
        data: {
          companyId,
          jobKitId: id,
          partId: parts.partId,
          partNumber: parts.partNumber,
          description: parts.description,
          quantityDefault: new Prisma.Decimal(input.quantityDefault),
          notes: input.notes,
          sortOrder: input.sortOrder ?? 0,
        },
      });
  await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKitLine", entityId: line.id, action: match ? "UPDATE" : "CREATE", afterData: { jobKitId: id, partId: parts.partId, partNumber: parts.partNumber } });
  return getJobKitById(ctx, id);
}

// 2026-09-15, user request: "when adding a kit, make it that you can add a
// part list/import a list that gets saved in table form for that specific
// kit." Mirrors jobs/service.ts's addPartLinesBulk (paste box + spreadsheet
// import, same row parsing / file-parsing approach via parts-import.ts's
// shared extractPartLinesFromSpreadsheet). Unlike a job's own parts list a
// kit line always has to resolve to an existing catalog Part (the FK is
// required — see schema.prisma's JobKitLine.partId), so a kit line can
// never be free-text the way a JobPartLine can.
//
// 2026-10-02 — user follow-up: a row whose part number doesn't match
// anything used to be skipped and reported ("not found in the parts
// catalog") rather than added, which read like a stock check and
// surprised the user ("is it not supposed to add parts without checking
// stock?") — it's a catalog-existence check, not a stock check. Changed
// to auto-create a bare-bones catalog Part for an unmatched number
// instead of skipping it (number + whatever description the row/file
// supplied, blank otherwise — fleshed out later from the Parts Catalog),
// then add it as a normal kit line. The one case still skipped and
// reported: the number is already recorded as some OTHER part's
// alternate/superseded/group number (see numberAlreadyInUse) — creating
// a second Part under that number would be a real data collision, not
// just a missing catalog entry. A row for a part already on this kit
// tops up that line's quantity instead of adding a duplicate row, same
// "top up, don't duplicate" behavior applyJobKitToJob already uses when
// a kit is applied to a job that already has the part.
//
// Same day — part numbers are now stripped of separators (hyphens,
// periods, slashes, spaces) and force-uppercased at the point they're
// typed/pasted/imported, not just matched loosely (see partInput in
// master-data/validation.ts and looseNormalized's own comment there); a
// part auto-created here gets the same clean number.
const ALLOWED_KIT_LINES_IMPORT_MIME_TYPES = [
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_KIT_LINES_IMPORT_FILE_BYTES = 8_000_000;

type ParsedKitLineRow = { partNumber: string; quantity: number; description?: string | null };

// "PN-1001, 2" or a tab-separated paste straight out of Excel — part number
// required, quantity optional (defaults to 1, since a kit's part list is
// often just "these parts belong to this kit" with no particular quantity
// in mind until someone edits it). No description column in the paste
// format — only the spreadsheet-import path (below) can supply one.
function parseBulkKitLineRow(raw: string): ParsedKitLineRow | null {
  const cells = (raw.includes("\t") ? raw.split("\t") : raw.split(",")).map((c) => c.trim());
  const partNumber = cells[0] || "";
  if (!partNumber) return null;
  const quantity = cells[1] ? Number(cells[1]) : 1;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  // 2026-10-16: an optional third column is the description ("PN-1001, 2, Hydraulic seal").
  const description = cells.slice(2).filter(Boolean).join(raw.includes("\t") ? " " : ", ");
  return { partNumber, quantity, description: description || null };
}

export type AddJobKitLinesBulkResult = {
  addedCount: number;
  incrementedCount: number;
  createdCount: number;
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
    fileRows = (await extractPartLinesFromSpreadsheet(data)).map((r) => ({ partNumber: r.partNumber, quantity: r.quantity, description: r.description }));
  }

  const rows = [...pasteRows, ...fileRows];
  const stockOn = stockTrackingOn(ctx);
  let addedCount = 0;
  let incrementedCount = 0;
  let createdCount = 0;
  const skipped: AddJobKitLinesBulkResult["skipped"] = [];

  if (rows.length > 0) {
    await prisma.$transaction(async (tx) => {
      const currentMax = await tx.jobKitLine.aggregate({ where: { jobKitId: id, companyId }, _max: { sortOrder: true } });
      let nextSortOrder = (currentMax._max.sortOrder ?? -1) + 1;

      for (const row of rows) {
        // 2026-10-16: with Stock levels off the list is kept exactly as typed — the parts
        // catalog is never looked at or added to. A number already on the kit is topped up.
        if (!stockOn) {
          const typedNumber = looseNormalized(row.partNumber) ?? row.partNumber;
          const sameLine = await tx.jobKitLine.findFirst({ where: { jobKitId: id, companyId, partNumber: typedNumber } });
          if (sameLine) {
            await tx.jobKitLine.update({ where: { id: sameLine.id }, data: { quantityDefault: sameLine.quantityDefault.plus(row.quantity), description: sameLine.description || row.description?.trim() || null } });
            incrementedCount += 1;
          } else {
            await tx.jobKitLine.create({ data: { companyId, jobKitId: id, partId: null, partNumber: typedNumber, description: row.description?.trim() || null, quantityDefault: new Prisma.Decimal(row.quantity), sortOrder: nextSortOrder } });
            nextSortOrder += 1;
            addedCount += 1;
          }
          continue;
        }
        // 2026-09-29 — recognizes a SUPERSEDED or GROUP alternate number
        // the same way the part's own current number is recognized (see
        // findPartByNumber's comment and PartAlternateNumber in
        // schema.prisma), so a kit list built from an old or group number
        // still matches.
        const part = await findPartByNumber(tx, companyId, row.partNumber, { id: true, active: true, partNumber: true, description: true });

        let partId: string;
        let lineNumber: string;
        let lineDescription: string | null;
        if (part) {
          // An existing but deactivated/historical part is still skipped
          // and reported — reactivating it automatically wasn't asked
          // for, and is a different decision than "this number isn't
          // catalogued yet."
          if (!part.active) { skipped.push({ partNumber: row.partNumber, reason: "A part with this number exists in the catalog but is inactive." }); continue; }
          partId = part.id;
          lineNumber = part.partNumber;
          lineDescription = part.description;
        } else {
          const cleanNumber = looseNormalized(row.partNumber) ?? row.partNumber;
          // A number already recorded as some OTHER part's alternate
          // number can't be auto-created without colliding — see this
          // function's own header comment.
          if (await numberAlreadyInUse(tx, companyId, cleanNumber)) {
            skipped.push({ partNumber: row.partNumber, reason: "This number is already recorded as another part's alternate number — resolve that first." });
            continue;
          }
          const createdPart = await tx.part.create({
            data: {
              companyId,
              partNumber: cleanNumber,
              partNumberNormalized: normalizedPartNumber(cleanNumber)!,
              description: row.description && row.description.trim().length >= 2 ? row.description.trim() : `Imported part ${cleanNumber}`,
              unitOfMeasure: "EA",
              active: true,
            },
          });
          partId = createdPart.id;
          lineNumber = createdPart.partNumber;
          lineDescription = createdPart.description;
          createdCount += 1;
        }

        const existingLine = await tx.jobKitLine.findFirst({ where: { jobKitId: id, companyId, partId } });
        if (existingLine) {
          await tx.jobKitLine.update({ where: { id: existingLine.id }, data: { quantityDefault: existingLine.quantityDefault.plus(row.quantity) } });
          incrementedCount += 1;
        } else {
          await tx.jobKitLine.create({ data: { companyId, jobKitId: id, partId, partNumber: lineNumber, description: lineDescription, quantityDefault: new Prisma.Decimal(row.quantity), sortOrder: nextSortOrder } });
          nextSortOrder += 1;
          addedCount += 1;
        }
      }
    });

    if (addedCount > 0 || incrementedCount > 0) {
      await recordAudit(ctx, { source: "UI", module: "JOB_KITS", entityType: "JobKit", entityId: id, action: "UPDATE", afterData: { id, bulkImport: { addedCount, incrementedCount, createdCount, skippedCount: skipped.length } } });
    }
  }

  const kit = await getJobKitById(ctx, id);
  return { ...kit, importResult: { addedCount, incrementedCount, createdCount, skipped } };
}

export async function updateJobKitLine(ctx: RequestContext, id: string, lineId: string, raw: unknown) {
  const companyId = requireJobKitsWrite(ctx, "JOB_KITS_EDIT");
  const input = jobKitLineUpdateInput.parse(raw);
  const existing = await prisma.jobKitLine.findFirst({ where: { id: lineId, companyId, jobKitId: id } });
  if (!existing) notFound();
  // Re-pointing at a different catalog part refreshes the copied number/description; the typed
  // number/description of a line that is not catalog-linked can be edited directly.
  const relinked = input.partId && input.partId !== existing.partId ? await getPartOrThrow(companyId, input.partId) : null;
  const typedNumber = !existing.partId && !relinked && input.partNumber ? (looseNormalized(input.partNumber) ?? input.partNumber.trim()) : null;
  await prisma.jobKitLine.update({
    where: { id: lineId },
    data: {
      ...(relinked ? { partId: relinked.id, partNumber: relinked.partNumber, description: relinked.description } : {}),
      ...(typedNumber ? { partNumber: typedNumber } : {}),
      ...(!existing.partId && !relinked && input.description !== undefined ? { description: input.description?.trim() || null } : {}),
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

// 2026-09-29 — user request: "check the reserve part feature if its
// working correctly, i dont see that it reserves the part." Shared by
// both branches of applyJobKitToJob below (existing-line top-up and
// new-line create), both of which used to reserve only at the part's
// single default bin (Part.binLocationId) — the exact same mistake
// addPartLinesBulk had (jobs/service.ts, see its own comment for the
// full root cause): "in stock" sums StockBalance across EVERY location,
// so a part whose stock actually sits at a bin other than its default —
// or with no default bin set at all — passed the "in stock" check just
// above each call site and then reserved nothing at all, silently. Now
// reserves across every location the part actually has stock at,
// default bin first (so behavior is unchanged when that's where the
// stock already sits), splitting across more than one StockReservation
// row if that's genuinely where the stock is.
async function reserveAcrossLocations(
  tx: Prisma.TransactionClient,
  ctx: RequestContext,
  companyId: string,
  partId: string,
  defaultBinLocationId: string | null,
  quantity: Prisma.Decimal,
  referenceId: string,
  jobNumberLabel: string | null,
) {
  let remaining = quantity;
  const candidates = await tx.stockBalance.findMany({ where: { companyId, partId, quantityOnHand: { gt: 0 } }, select: { locationId: true } });
  const orderedLocationIds = [
    ...(defaultBinLocationId ? [defaultBinLocationId] : []),
    ...candidates.map((c) => c.locationId).filter((id) => id !== defaultBinLocationId),
  ];
  for (const locationId of orderedLocationIds) {
    if (remaining.lte(0)) break;
    const balance = await tx.stockBalance.findFirst({ where: { companyId, partId, locationId } });
    const available = balance ? balance.quantityOnHand.minus(balance.quantityReserved) : new Prisma.Decimal(0);
    if (available.lte(0)) continue;
    const qtyHere = Prisma.Decimal.min(remaining, available);
    try {
      await reserveStockTx(tx, { ...ctx, companyId }, {
        partId,
        locationId,
        quantity: qtyHere.toString(),
        referenceType: "JOB",
        referenceId,
        referenceNumber: jobNumberLabel,
        reason: `Reserved for job ${jobNumberLabel}`,
        notes: null,
        expiresAt: null,
        idempotencyKey: undefined,
      });
      remaining = remaining.minus(qtyHere);
    } catch {
      // Best-effort per location — a race against another reservation
      // between the read above and reserveStockTx's own row lock can
      // still leave less available than expected; move on to the next
      // candidate location instead of aborting. If every candidate is
      // exhausted this way, the line just stays unreserved, same as the
      // old single-location best-effort behavior.
    }
  }
}

export async function applyJobKitToJob(ctx: RequestContext, jobId: string, kitId: string) {
  requireModule(ctx, "JOBS_WIP", "WRITE");
  requireModule(ctx, "JOB_PARTS", "WRITE");
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
    // Industry builds: with Stock levels off a kit line is just a typed part, so the catalog's
    // active flag does not matter.
    const stockOn = stockTrackingOn(ctx);
    if (stockOn && kit.lines.some((line) => line.part && !line.part.active)) notFound();

    // Targets JobPartLine (the Parts list) rather than the old
    // JobPartRequirement — updated 2026-09-09 alongside the Parts
    // required → Parts list swap (see schema.prisma's JobPartLine comment)
    // so "Apply job kit" stays useful under the new, simpler model. A kit
    // line for a part already on the job's parts list (and not yet
    // received) tops up that line's quantity instead of creating a
    // duplicate row; JobPartLine has no separate notes field, so the kit
    // line's own notes aren't merged in here — the applied-kit detail is
    // still captured below in the job activity's metadata.
    const appliedLines: Array<{ partId: string | null; partNumber: string; quantityAdded: string; lineId: string; mode: "CREATED" | "INCREMENTED" }> = [];

    for (const line of kit.lines) {
      // 2026-10-16: the line's own number/description are what get added (a catalog-linked line
      // uses the catalog's current values). Only a line linked to a catalog part with Stock levels
      // on is checked against stock / reserved; any other line is added as a plain part to order.
      const partNumber = line.part?.partNumber ?? line.partNumber;
      if (!partNumber) continue;
      const description = line.part?.description ?? line.description ?? null;
      const catalogPart = stockOn ? line.part : null;

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
      const existing = await tx.jobPartLine.findFirst({
        where: { companyId, jobId, status: { not: "RECEIVED" }, OR: [...(catalogPart ? [{ partId: catalogPart.id }] : []), { partNumber }] },
        orderBy: { createdAt: "asc" },
      });
      const balances = catalogPart ? await tx.stockBalance.aggregate({ where: { companyId, partId: catalogPart.id }, _sum: { quantityOnHand: true } }) : null;
      const onHand = balances?._sum.quantityOnHand ?? new Prisma.Decimal(0);

      if (existing) {
        // A line already in PARTIALLY_RECEIVED is mid-receiving, or
        // PICKED (2026-09-29 — stock has already been physically issued
        // for it via a picking slip, see PartLineStatus's own schema
        // comment) — leave its status alone either way (only the
        // quantity/reservation are affected by topping it up), same
        // caution the receive/unmark flow itself takes about not
        // clobbering that state.
        const newTotal = existing.quantity.plus(line.quantityDefault);
        const inStock = catalogPart !== null && onHand.gte(newTotal);
        const preserveStatus = !catalogPart || existing.status === "PARTIALLY_RECEIVED" || existing.status === "PICKED";
        const nextStatus = preserveStatus ? existing.status : (inStock ? "IN_STOCK" : "PENDING");
        const updated = await tx.jobPartLine.update({
          where: { id: existing.id },
          data: { quantity: newTotal, status: nextStatus, description: existing.description || description, updatedById: ctx.userId },
        });
        if (catalogPart && inStock && !preserveStatus) {
          await reserveAcrossLocations(tx, ctx, companyId, catalogPart.id, catalogPart.binLocationId, line.quantityDefault, updated.id, job.jobNumber || job.draftNumber);
        }
        appliedLines.push({ partId: catalogPart?.id ?? null, partNumber, quantityAdded: line.quantityDefault.toString(), lineId: updated.id, mode: "INCREMENTED" });
      } else {
        const inStock = catalogPart !== null && onHand.gte(line.quantityDefault);
        const created = await tx.jobPartLine.create({
          data: {
            companyId,
            jobId,
            partNumber,
            description,
            quantity: line.quantityDefault,
            status: inStock ? "IN_STOCK" : "PENDING",
            partId: catalogPart?.id ?? null,
            createdById: ctx.userId,
            updatedById: ctx.userId,
          },
        });
        if (catalogPart && inStock) {
          await reserveAcrossLocations(tx, ctx, companyId, catalogPart.id, catalogPart.binLocationId, line.quantityDefault, created.id, job.jobNumber || job.draftNumber);
        }
        appliedLines.push({ partId: catalogPart?.id ?? null, partNumber, quantityAdded: line.quantityDefault.toString(), lineId: created.id, mode: "CREATED" });
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