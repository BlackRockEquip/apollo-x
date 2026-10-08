import { Prisma, type StockMovementType, type StockReferenceType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";
import type { TenantPermission } from "@/lib/auth/permissions";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit/service";
import { StockError } from "@/lib/http/errors";
import type {
  receiptInput,
  transferInput,
  issueInput,
  returnInput,
  adjustmentInput,
  reservationInput,
  releaseInput,
  countCreateInput,
  countNoteInput,
  movementQuery,
  positionQuery,
  countQuery,
  pickSlipCreateInput,
  pickSlipQuery,
  pickSlipCancelInput,
  bulkPartSearchInput,
} from "@/lib/inventory/validation";
import { deriveStockState } from "@/lib/inventory/stock-state";
import { partLineQuantities } from "@/lib/jobs/part-line-quantities";
import { normalized } from "@/lib/master-data/validation";
import { findPartByNumber } from "@/lib/inventory/parts-lookup";

type Tx = Prisma.TransactionClient;
type Quantity = Prisma.Decimal;
type DbClient = Tx | typeof prisma;

const D = Prisma.Decimal;

// Direction requirements enforced by the StockMovement_direction_chk database
// constraint. Every ledger write must match or the transaction is rolled back.
const OUTBOUND_TYPES: readonly StockMovementType[] = ["ISSUE", "ADJUSTMENT_OUT", "SCRAP", "RESERVATION", "PICK"];

type MovementBase = {
  companyId: string;
  partId: string;
  movementType: StockMovementType;
  quantity: Quantity;
  fromLocationId: string | null;
  toLocationId: string | null;
  referenceType: StockReferenceType | null;
  referenceId: string | null;
  referenceNumber: string | null;
  unitCost: Quantity | null;
  reason: string | null;
  notes: string | null;
  actorId: string | null;
  resultingFromQuantity: Quantity | null;
  resultingToQuantity: Quantity | null;
  idempotencyKey: string | null;
  reversalOfId: string | null;
  correlationId: string;
};

function buildMovement(input: {
  companyId: string;
  partId: string;
  movementType: StockMovementType;
  quantity: Quantity;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  referenceType?: StockReferenceType | null;
  referenceId?: string | null;
  referenceNumber?: string | null;
  unitCost?: Quantity | null;
  reason?: string | null;
  notes?: string | null;
  actorId: string | null;
  resultingFromQuantity?: Quantity | null;
  resultingToQuantity?: Quantity | null;
  idempotencyKey?: string | null;
  reversalOfId?: string | null;
  correlationId: string;
}): MovementBase {
  const from = input.fromLocationId ?? null;
  const to = input.toLocationId ?? null;
  // Keep ledger rows consistent with the database direction constraint:
  // outbound types carry a from-location only, TRANSFER carries both, and
  // every other type carries a to-location only.
  if (input.movementType === "TRANSFER") {
    if (!from || !to) throw new StockError("INVALID_MOVEMENT", "A transfer requires both locations.");
  } else if (input.movementType === "RECONCILIATION") {
    // A reconciliation may correct stock in either direction, but never both.
    if (from && to) throw new StockError("INVALID_MOVEMENT", "A reconciliation movement carries one location only.");
  } else if (OUTBOUND_TYPES.includes(input.movementType)) {
    if (!from || to) throw new StockError("INVALID_MOVEMENT", "Outbound movements require only a source location.");
  } else if (!to || from) {
    throw new StockError("INVALID_MOVEMENT", "Inbound movements require only a destination location.");
  }
  return {
    companyId: input.companyId,
    partId: input.partId,
    movementType: input.movementType,
    quantity: input.quantity,
    fromLocationId: from,
    toLocationId: to,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
    referenceNumber: input.referenceNumber ?? null,
    unitCost: input.unitCost ?? null,
    reason: input.reason ?? null,
    notes: input.notes ?? null,
    actorId: input.actorId,
    resultingFromQuantity: input.resultingFromQuantity ?? null,
    resultingToQuantity: input.resultingToQuantity ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    reversalOfId: input.reversalOfId ?? null,
    correlationId: input.correlationId,
  };
}

type LockedBalance = { id: string; onHand: Quantity; reserved: Quantity; version: number };
type LockedReservation = {
  id: string;
  companyId: string;
  partId: string;
  locationId: string;
  quantity: Quantity;
  status: Prisma.StockReservationGetPayload<{ select: { status: true } }>['status'];
  referenceType: StockReferenceType | null;
  referenceId: string | null;
  referenceNumber: string | null;
  reason: string | null;
  notes: string | null;
};

// Row-level lock on the one balance row per (company, part, location). The
// FOR UPDATE is what serialises concurrent issues/transfers/reservations so
// two transactions can never both consume the same available stock. When the
// row does not exist yet, the INSERT ... ON CONFLICT DO UPDATE both creates it
// and takes the lock atomically (the conflict branch still locks the row).
async function lockBalance(
  tx: Tx,
  companyId: string,
  partId: string,
  locationId: string,
  options?: { createIfMissing?: boolean },
): Promise<LockedBalance | null> {
  const existing = await tx.$queryRaw<{ id: string; on_hand: string; reserved: string; version: number }[]>`
    SELECT "id", "quantityOnHand" AS on_hand, "quantityReserved" AS reserved, "version"
    FROM "StockBalance"
    WHERE "companyId" = ${companyId} AND "partId" = ${partId} AND "locationId" = ${locationId}
    FOR UPDATE`;
  if (existing.length > 0) {
    const row = existing[0];
    return { id: row.id, onHand: new D(row.on_hand), reserved: new D(row.reserved), version: row.version };
  }
  if (!options?.createIfMissing) return null;
  const created = await tx.$queryRaw<{ id: string; on_hand: string; reserved: string; version: number }[]>`
    INSERT INTO "StockBalance" ("id", "companyId", "partId", "locationId", "quantityOnHand", "quantityReserved", "version", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, ${companyId}, ${partId}, ${locationId}, 0, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("companyId", "partId", "locationId")
    DO UPDATE SET "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "id", "quantityOnHand" AS on_hand, "quantityReserved" AS reserved, "version"`;
  const row = created[0];
  return { id: row.id, onHand: new D(row.on_hand), reserved: new D(row.reserved), version: row.version };
}

async function saveBalance(tx: Tx, balance: LockedBalance, next: { onHand?: Quantity; reserved?: Quantity }) {
  await tx.stockBalance.update({
    where: { id: balance.id },
    data: {
      quantityOnHand: next.onHand ?? balance.onHand,
      quantityReserved: next.reserved ?? balance.reserved,
      lastMovementAt: new Date(),
      version: { increment: 1 },
    },
  });
}

async function lockReservation(tx: Tx, companyId: string, reservationId: string): Promise<LockedReservation | null> {
  const rows = await tx.$queryRaw<{
    id: string;
    companyId: string;
    partId: string;
    locationId: string;
    quantity: string;
    status: string;
    referenceType: StockReferenceType | null;
    referenceId: string | null;
    referenceNumber: string | null;
    reason: string | null;
    notes: string | null;
  }[]>`
    SELECT "id", "companyId", "partId", "locationId", "quantity", "status", "referenceType", "referenceId", "referenceNumber", "reason", "notes"
    FROM "StockReservation"
    WHERE "companyId" = ${companyId} AND "id" = ${reservationId}
    FOR UPDATE`;

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.companyId,
    partId: row.partId,
    locationId: row.locationId,
    quantity: new D(row.quantity),
    status: row.status as LockedReservation['status'],
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    referenceNumber: row.referenceNumber,
    reason: row.reason,
    notes: row.notes,
  };
}

async function getReservationUsage(tx: Tx, companyId: string, reservationId: string) {
  const rows = await tx.$queryRaw<{ movementType: StockMovementType; quantity: string }[]>`
    SELECT "movementType", "quantity"
    FROM "StockMovement"
    WHERE "companyId" = ${companyId}
      AND "referenceType" = 'RESERVATION'::"StockReferenceType"
      AND "referenceId" = ${reservationId}`;

  let issued = new D(0);
  let released = new D(0);
  for (const row of rows) {
    const qty = new D(row.quantity);
    if (row.movementType === "ISSUE") issued = issued.plus(qty);
    if (row.movementType === "RESERVATION_RELEASE") released = released.plus(qty);
  }
  return { issued, released, remaining: null as Quantity | null };
}

async function getReservationRemaining(tx: Tx, reservation: LockedReservation) {
  const usage = await getReservationUsage(tx, reservation.companyId, reservation.id);
  const remaining = reservation.quantity.minus(usage.issued).minus(usage.released);
  if (remaining.lt(0)) {
    throw new StockError("INVALID_RESERVATION", "Reservation history is inconsistent.");
  }
  return { ...usage, remaining };
}

// Tenant-scoped existence checks. Missing rows always raise the generic
// NOT_FOUND signal â€” a caller must never learn whether a foreign-tenant ID
// exists.
async function requirePart(tx: Tx, ctx: RequestContext & { companyId: string }, partId: string) {
  const part = await tx.part.findFirst({ where: { id: partId, companyId: ctx.companyId } });
  if (!part) throw new Error("NOT_FOUND");
  return part;
}

async function requireLocation(tx: Tx, ctx: RequestContext & { companyId: string }, locationId: string) {
  const location = await tx.storageLocation.findFirst({ where: { id: locationId, companyId: ctx.companyId } });
  if (!location) throw new Error("NOT_FOUND");
  return location;
}

function assertOperable(part: { active: boolean }, location: { active: boolean }) {
  if (!part.active) throw new StockError("PART_INACTIVE", "Stock cannot be moved for an inactive part.");
  if (!location.active) throw new StockError("LOCATION_INACTIVE", "Stock cannot be moved at an inactive location.");
}

// Replay helper for idempotent operations: if a ledger row already exists for
// (company, idempotencyKey) the original result is returned unchanged instead
// of performing the work twice. The database unique index is the final guard;
// a race that reaches the insert surfaces as P2002 and is converted to the
// same replayed result.
async function replayedMovement(companyId: string, idempotencyKey: string | null | undefined) {
  if (!idempotencyKey) return null;
  return prisma.stockMovement.findUnique({
    where: { companyId_idempotencyKey: { companyId, idempotencyKey } },
  });
}

async function replayedMovementWithClient(db: DbClient, companyId: string, idempotencyKey: string | null | undefined) {
  if (!idempotencyKey) return null;
  return db.stockMovement.findUnique({
    where: { companyId_idempotencyKey: { companyId, idempotencyKey } },
  });
}

function isUniqueIdempotencyError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// ============================================================
// Guard shorthands. Backend authorization is authoritative; the
// UI mirrors these checks but never replaces them.
// ============================================================

function requireInventory(ctx: RequestContext, permission: TenantPermission, intent: "READ" | "WRITE" = "WRITE"): asserts ctx is RequestContext & { companyId: string } {
  requireModule(ctx, "INVENTORY", intent);
  requireTenantPermission(ctx, permission);
}

export function canViewInventoryCost(ctx: RequestContext): boolean {
  return ctx.tenantPermissions.has("INVENTORY_VIEW_COST");
}

function notFound(): never {
  throw new Error("NOT_FOUND");
}

function insufficient(): never {
  throw new StockError("INSUFFICIENT_STOCK", "There is not enough available stock for this operation.");
}

function composeNotes(notes?: string | null, extra?: string | null): string | null {
  const trimmed = [notes?.trim(), extra?.trim()].filter((v): v is string => Boolean(v));
  return trimmed.length > 0 ? trimmed.join(" â€” ") : null;
}

// ============================================================
// RECEIVING â€” atomic balance increment + ledger row + audit.
// supplierId is carried as referenceId so the future
// Procurement/PO module can link deliveries without migration.
// ============================================================

export async function receiveStock(ctx: RequestContext, input: z.infer<typeof receiptInput>) {
  requireInventory(ctx, "INVENTORY_RECEIVE");
  const replay = await replayedMovement(ctx.companyId, input.idempotencyKey);
  if (replay) return { movementId: replay.id, quantityOnHand: new D(replay.resultingToQuantity ?? 0), replayed: true };

  const result = await prisma.$transaction(async (tx) => {
    const part = await requirePart(tx, ctx, input.partId);
    const location = await requireLocation(tx, ctx, input.locationId);
    assertOperable(part, location);
    const qty = new D(input.quantity);
    const balance = await lockBalance(tx, ctx.companyId, part.id, location.id, { createIfMissing: true });
    if (!balance) notFound();
    const nextOnHand = balance.onHand.plus(qty);
    const movement = await tx.stockMovement.create({
      data: buildMovement({
        companyId: ctx.companyId,
        partId: part.id,
        movementType: "RECEIPT",
        quantity: qty,
        toLocationId: location.id,
        referenceType: "RECEIPT",
        referenceId: input.supplierId ?? null,
        referenceNumber: input.supplierDeliveryNote ?? input.referenceNumber ?? null,
        unitCost: input.unitCost != null ? new D(input.unitCost) : null,
        notes: composeNotes(input.notes, input.supplierDeliveryNote ? `Delivery note ${input.supplierDeliveryNote}` : null),
        actorId: ctx.userId,
        resultingToQuantity: nextOnHand,
        idempotencyKey: input.idempotencyKey ?? null,
        correlationId: ctx.correlationId,
      }),
    });
    await saveBalance(tx, balance, { onHand: nextOnHand });
    return { movementId: movement.id, quantityOnHand: nextOnHand };
  });
  await recordAudit(ctx, {
    source: "UI",
    module: "INVENTORY",
    entityType: "StockMovement",
    entityId: result.movementId,
    action: "RECEIPT",
    afterData: {
      partId: input.partId,
      locationId: input.locationId,
      quantity: input.quantity,
      unitCost: input.unitCost ?? null,
      supplierId: input.supplierId ?? null,
      resultingOnHand: result.quantityOnHand.toString(),
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });
  return { movementId: result.movementId, quantityOnHand: result.quantityOnHand, replayed: false };
}

// ============================================================
// TRANSFERS â€” one atomic row-locked move between two locations
// of the same tenant. Balances are locked in deterministic
// locationId order so concurrent transfers cannot deadlock,
// and the FOR UPDATE locks mean a second transfer always reads
// the post-commit quantities of the first (no overspend).
// ============================================================

export async function transferStock(ctx: RequestContext, input: z.infer<typeof transferInput>) {
  requireInventory(ctx, "INVENTORY_TRANSFER");
  const replay = await replayedMovement(ctx.companyId, input.idempotencyKey);
  if (replay) return { movementId: replay.id, replayed: true };
  let result: { movementId: string; replayed: boolean };
  try {
    result = await prisma.$transaction(async (tx) => {
      const part = await requirePart(tx, ctx, input.partId);
      const from = await requireLocation(tx, ctx, input.fromLocationId);
      const to = await requireLocation(tx, ctx, input.toLocationId);
      if (from.id === to.id) throw new StockError("INVALID_TRANSFER", "Source and destination locations must differ.");
      assertOperable(part, from);
      assertOperable(part, to);
      const qty = new D(input.quantity);
      const balances = new Map<string, LockedBalance>();
      for (const locationId of [from.id, to.id].sort()) {
        const balance = await lockBalance(tx, ctx.companyId, part.id, locationId, { createIfMissing: true });
        if (!balance) notFound();
        balances.set(locationId, balance);
      }
      const source = balances.get(from.id)!;
      const destination = balances.get(to.id)!;
      if (source.onHand.minus(source.reserved).lt(qty)) insufficient();
      const nextSource = source.onHand.minus(qty);
      const nextDestination = destination.onHand.plus(qty);
      const movement = await tx.stockMovement.create({
        data: buildMovement({
          companyId: ctx.companyId,
          partId: part.id,
          movementType: "TRANSFER",
          quantity: qty,
          fromLocationId: from.id,
          toLocationId: to.id,
          referenceType: "TRANSFER",
          referenceNumber: input.referenceNumber ?? null,
          reason: input.reason ?? null,
          notes: input.notes ?? null,
          actorId: ctx.userId,
          resultingFromQuantity: nextSource,
          resultingToQuantity: nextDestination,
          idempotencyKey: input.idempotencyKey ?? null,
          correlationId: ctx.correlationId,
        }),
      });
      await saveBalance(tx, source, { onHand: nextSource });
      await saveBalance(tx, destination, { onHand: nextDestination });
      return { movementId: movement.id, replayed: false };
    });
  } catch (error) {
    if (!isUniqueIdempotencyError(error)) throw error;
    const retried = await replayedMovement(ctx.companyId, input.idempotencyKey);
    if (!retried) throw error;
    result = { movementId: retried.id, replayed: true };
  }
  await recordAudit(ctx, {
    source: "UI",
    module: "INVENTORY",
    entityType: "StockMovement",
    entityId: result.movementId,
    action: "TRANSFER",
    afterData: { partId: input.partId, fromLocationId: input.fromLocationId, toLocationId: input.toLocationId, quantity: input.quantity, idempotencyKey: input.idempotencyKey ?? null },
  });
  return result;
}

// ============================================================
// ISSUES â€” generic outbound foundation. referenceType is
// future-ready for JOB / PEX_REPAIR / SALES_ORDER without any
// schema change; only GENERAL is exercised by the UI today.
// ============================================================

export async function issueStock(ctx: RequestContext, input: z.infer<typeof issueInput>) {
  requireInventory(ctx, "INVENTORY_ISSUE");
  const replay = await replayedMovement(ctx.companyId, input.idempotencyKey);
  if (replay) return { movementId: replay.id, replayed: true };
  let result: { movementId: string; replayed: boolean };
  try {
    result = await prisma.$transaction(async (tx) => {
      const part = await requirePart(tx, ctx, input.partId);
      const location = await requireLocation(tx, ctx, input.locationId);
      assertOperable(part, location);
      const qty = new D(input.quantity);
      const balance = await lockBalance(tx, ctx.companyId, part.id, location.id);
      if (!balance) insufficient();
      if (balance.onHand.minus(balance.reserved).lt(qty)) insufficient();
      const nextOnHand = balance.onHand.minus(qty);
      const movement = await tx.stockMovement.create({
        data: buildMovement({
          companyId: ctx.companyId,
          partId: part.id,
          movementType: "ISSUE",
          quantity: qty,
          fromLocationId: location.id,
          referenceType: input.referenceType,
          referenceId: input.referenceId ?? null,
          referenceNumber: input.referenceNumber ?? null,
          reason: input.reason ?? null,
          notes: input.notes ?? null,
          actorId: ctx.userId,
          resultingFromQuantity: nextOnHand,
          idempotencyKey: input.idempotencyKey ?? null,
          correlationId: ctx.correlationId,
        }),
      });
      await saveBalance(tx, balance, { onHand: nextOnHand });
      return { movementId: movement.id, replayed: false };
    });
  } catch (error) {
    if (!isUniqueIdempotencyError(error)) throw error;
    const retried = await replayedMovement(ctx.companyId, input.idempotencyKey);
    if (!retried) throw error;
    result = { movementId: retried.id, replayed: true };
  }
  await recordAudit(ctx, {
    source: "UI",
    module: "INVENTORY",
    entityType: "StockMovement",
    entityId: result.movementId,
    action: "ISSUE",
    afterData: { partId: input.partId, locationId: input.locationId, quantity: input.quantity, referenceType: input.referenceType, referenceId: input.referenceId ?? null, idempotencyKey: input.idempotencyKey ?? null },
  });
  return result;
}

export async function issueReservedStock(
  ctx: RequestContext,
  reservationId: string,
  input: z.infer<typeof issueInput>,
) {
  requireInventory(ctx, "INVENTORY_ISSUE");
  const result = await prisma.$transaction((tx) => issueReservedStockTx(tx, ctx, reservationId, input));

  await recordAudit(ctx, {
    source: "UI",
    module: "INVENTORY",
    entityType: "StockMovement",
    entityId: result.movementId,
    action: "ISSUE",
    afterData: {
      reservationId,
      partId: input.partId,
      locationId: input.locationId,
      quantity: input.quantity,
      referenceType: "RESERVATION",
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });
  return result;
}

export async function issueReservedStockTx(
  tx: Tx,
  ctx: RequestContext & { companyId: string },
  reservationId: string,
  input: z.infer<typeof issueInput>,
) {
  const replay = await replayedMovementWithClient(tx, ctx.companyId, input.idempotencyKey);
  if (replay) return { movementId: replay.id, replayed: true };

  const reservation = await lockReservation(tx, ctx.companyId, reservationId);
  if (!reservation || reservation.status !== "ACTIVE") notFound();

  const part = await requirePart(tx, ctx, input.partId);
  const location = await requireLocation(tx, ctx, input.locationId);
  assertOperable(part, location);

  if (reservation.partId !== part.id || reservation.locationId !== location.id) notFound();

  const qty = new D(input.quantity);
  const balance = await lockBalance(tx, ctx.companyId, part.id, location.id);
  if (!balance) insufficient();

  const usage = await getReservationRemaining(tx, reservation);
  if (usage.remaining.lt(qty)) insufficient();
  if (balance.onHand.lt(qty) || balance.reserved.lt(qty)) insufficient();

  const nextOnHand = balance.onHand.minus(qty);
  const nextReserved = balance.reserved.minus(qty);
  if (nextOnHand.lt(0) || nextReserved.lt(0)) insufficient();

  const movement = await tx.stockMovement.create({
    data: buildMovement({
      companyId: ctx.companyId,
      partId: part.id,
      movementType: "ISSUE",
      quantity: qty,
      fromLocationId: location.id,
      referenceType: "RESERVATION",
      referenceId: reservation.id,
      referenceNumber: input.referenceNumber ?? reservation.referenceNumber ?? null,
      reason: input.reason ?? reservation.reason ?? null,
      notes: composeNotes(input.notes, reservation.notes),
      actorId: ctx.userId,
      resultingFromQuantity: nextOnHand,
      idempotencyKey: input.idempotencyKey ?? null,
      correlationId: ctx.correlationId,
    }),
  });

  await saveBalance(tx, balance, { onHand: nextOnHand, reserved: nextReserved });

  if (usage.remaining.eq(qty)) {
    await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: "CONVERTED" } });
  }

  return { movementId: movement.id, replayed: false };
}

export async function returnStock(ctx: RequestContext, input: z.infer<typeof returnInput>) {
  requireInventory(ctx, "INVENTORY_RETURN");
  const result = await prisma.$transaction((tx) => returnStockTx(tx, ctx, input));
  await recordAudit(ctx, {
    source: "UI",
    module: "INVENTORY",
    entityType: "StockMovement",
    entityId: result.movementId,
    action: "RETURN",
    afterData: { partId: input.partId, locationId: input.locationId, quantity: input.quantity, sourceMovementId: input.sourceMovementId ?? null, idempotencyKey: input.idempotencyKey ?? null },
  });
  return result;
}

export async function returnStockTx(tx: Tx, ctx: RequestContext & { companyId: string }, input: z.infer<typeof returnInput>) {
  const replay = await replayedMovementWithClient(tx, ctx.companyId, input.idempotencyKey);
  if (replay) return { movementId: replay.id, replayed: true };

  const part = await requirePart(tx, ctx, input.partId);
  const location = await requireLocation(tx, ctx, input.locationId);
  assertOperable(part, location);
  const qty = new D(input.quantity);

  let source: { id: string; referenceType: StockReferenceType | null; referenceId: string | null; referenceNumber: string | null } | null = null;
  if (input.sourceMovementId) {
    const found = await tx.stockMovement.findFirst({
      where: { id: input.sourceMovementId, companyId: ctx.companyId, partId: part.id, movementType: "ISSUE" },
    });
    if (!found || found.fromLocationId !== location.id) notFound();
    const alreadyReturned = await tx.stockMovement.aggregate({
      where: { companyId: ctx.companyId, reversalOfId: found.id, movementType: "RETURN" },
      _sum: { quantity: true },
    });
    const returned = new D(alreadyReturned._sum?.quantity ?? 0);
    if (new D(found.quantity).minus(returned).lt(qty)) insufficient();
    source = { id: found.id, referenceType: found.referenceType, referenceId: found.referenceId, referenceNumber: found.referenceNumber };
  }

  const balance = await lockBalance(tx, ctx.companyId, part.id, location.id, { createIfMissing: true });
  if (!balance) notFound();
  const nextOnHand = balance.onHand.plus(qty);
  const movement = await tx.stockMovement.create({
    data: buildMovement({
      companyId: ctx.companyId,
      partId: part.id,
      movementType: "RETURN",
      quantity: qty,
      toLocationId: location.id,
      referenceType: source?.referenceType ?? null,
      referenceId: source?.referenceId ?? null,
      referenceNumber: source?.referenceNumber ?? null,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      actorId: ctx.userId,
      resultingToQuantity: nextOnHand,
      idempotencyKey: input.idempotencyKey ?? null,
      reversalOfId: source?.id ?? null,
      correlationId: ctx.correlationId,
    }),
  });
  await saveBalance(tx, balance, { onHand: nextOnHand });
  return { movementId: movement.id, replayed: false };
}

// ============================================================
// ADJUSTMENTS â€” controlled corrections. A reason is mandatory,
// the permission is deliberately separate from ordinary stock
// handling, and every adjustment is a ledger movement (never a
// silent balance overwrite). Decreases must respect the
// reserved quantity â€” the database CHECK would reject it anyway.
// ============================================================

export async function adjustStock(ctx: RequestContext, input: z.infer<typeof adjustmentInput>) {
  requireInventory(ctx, "INVENTORY_ADJUST");
  const replay = await replayedMovement(ctx.companyId, input.idempotencyKey);
  if (replay) return { movementId: replay.id, replayed: true };

  const movementId = await prisma.$transaction(async (tx) => {
    const part = await requirePart(tx, ctx, input.partId);
    const location = await requireLocation(tx, ctx, input.locationId);
    assertOperable(part, location);
    const qty = new D(input.quantity);
    const balance = await lockBalance(tx, ctx.companyId, part.id, location.id, { createIfMissing: true });
    if (!balance) notFound();
    const increasing = input.direction === "IN";
    const movementType: StockMovementType = input.direction === "SCRAP" ? "SCRAP" : increasing ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";
    const nextOnHand = increasing ? balance.onHand.plus(qty) : balance.onHand.minus(qty);
    if (!increasing && nextOnHand.lt(balance.reserved)) insufficient();
    const movement = await tx.stockMovement.create({
      data: buildMovement({
        companyId: ctx.companyId,
        partId: part.id,
        movementType,
        quantity: qty,
        fromLocationId: increasing ? null : location.id,
        toLocationId: increasing ? location.id : null,
        referenceType: input.direction === "SCRAP" ? "GENERAL" : "ADJUSTMENT",
        reason: input.reason,
        notes: input.notes ?? null,
        actorId: ctx.userId,
        resultingToQuantity: increasing ? nextOnHand : null,
        resultingFromQuantity: increasing ? null : nextOnHand,
        idempotencyKey: input.idempotencyKey ?? null,
        correlationId: ctx.correlationId,
      }),
    });
    await saveBalance(tx, balance, { onHand: nextOnHand });
    return movement.id;
  });
  await recordAudit(ctx, {
    source: "UI",
    module: "INVENTORY",
    entityType: "StockMovement",
    entityId: movementId,
    action: `ADJUSTMENT_${input.direction}`,
    afterData: { partId: input.partId, locationId: input.locationId, direction: input.direction, quantity: input.quantity, reason: input.reason, idempotencyKey: input.idempotencyKey ?? null },
  });
  return { movementId, replayed: false };
}

// ============================================================
// RESERVATIONS â€” reduce available quantity without touching
// on-hand. The single ACTIVE reservation per (company,
// referenceType, referenceId) is enforced at the database via
// a partial unique index; creation and release are atomic.
// ============================================================

export async function reserveStock(ctx: RequestContext, input: z.infer<typeof reservationInput>) {
  requireInventory(ctx, "INVENTORY_RESERVE");
  const result = await prisma.$transaction((tx) => reserveStockTx(tx, ctx, input));
  await recordAudit(ctx, {
    source: "UI",
    module: "INVENTORY",
    entityType: "StockReservation",
    entityId: result.reservationId,
    action: "RESERVATION",
    afterData: { partId: input.partId, locationId: input.locationId, quantity: input.quantity, referenceType: input.referenceType, referenceId: input.referenceId ?? null, idempotencyKey: input.idempotencyKey ?? null },
  });
  return result;
}

export async function reserveStockTx(tx: Tx, ctx: RequestContext & { companyId: string }, input: z.infer<typeof reservationInput>) {
  const replay = await replayedMovementWithClient(tx, ctx.companyId, input.idempotencyKey);
  if (replay) return { reservationId: replay.referenceId ?? "", movementId: replay.id, replayed: true };

  const part = await requirePart(tx, ctx, input.partId);
  const location = await requireLocation(tx, ctx, input.locationId);
  if (!part.active || !location.active) throw new StockError("PART_INACTIVE", "Reservations require an active part and location.");
  const qty = new D(input.quantity);
  const balance = await lockBalance(tx, ctx.companyId, part.id, location.id, { createIfMissing: true });
  if (!balance) notFound();
  if (balance.onHand.minus(balance.reserved).lt(qty)) insufficient();
  const nextReserved = balance.reserved.plus(qty);
  const reservation = await tx.stockReservation.create({
    data: {
      companyId: ctx.companyId,
      partId: part.id,
      locationId: location.id,
      quantity: qty,
      status: "ACTIVE",
      referenceType: input.referenceType,
      referenceId: input.referenceId ?? null,
      referenceNumber: input.referenceNumber ?? null,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      expiresAt: input.expiresAt ?? null,
      actorId: ctx.userId,
      idempotencyKey: input.idempotencyKey ?? null,
      correlationId: ctx.correlationId,
    },
  });
  const movement = await tx.stockMovement.create({
    data: buildMovement({
      companyId: ctx.companyId,
      partId: part.id,
      movementType: "RESERVATION",
      quantity: qty,
      fromLocationId: location.id,
      referenceType: "RESERVATION",
      referenceId: reservation.id,
      referenceNumber: input.referenceNumber ?? null,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      actorId: ctx.userId,
      resultingFromQuantity: balance.onHand.minus(nextReserved),
      idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:reserve` : null,
      correlationId: ctx.correlationId,
    }),
  });
  await saveBalance(tx, balance, { reserved: nextReserved });
  return { reservationId: reservation.id, movementId: movement.id, replayed: false };
}

// Reuses the balance lock so a release can never overshoot the
// reserved quantity, and marks the reservation RELEASED (the
// partial unique index then frees the reference for reuse).
export async function releaseReservation(ctx: RequestContext, reservationId: string, input: z.infer<typeof releaseInput>) {
  requireInventory(ctx, "INVENTORY_RELEASE_RESERVATION");
  const result = await prisma.$transaction((tx) => releaseReservationTx(tx, ctx, reservationId, input));
  await recordAudit(ctx, {
    source: "UI",
    module: "INVENTORY",
    entityType: "StockReservation",
    entityId: result.reservationId,
    action: "RESERVATION_RELEASE",
    afterData: { quantity: input.reason ?? null, reservationId: result.reservationId },
  });
  return result;
}

export async function releaseReservationTx(tx: Tx, ctx: RequestContext & { companyId: string }, reservationId: string, input: z.infer<typeof releaseInput>) {
  const reservation = await lockReservation(tx, ctx.companyId, reservationId);
  if (!reservation) notFound();
  if (reservation.status !== "ACTIVE") notFound();
  const balance = await lockBalance(tx, ctx.companyId, reservation.partId, reservation.locationId);
  if (!balance) notFound();
  const usage = await getReservationRemaining(tx, reservation);
  if (usage.remaining.isZero()) {
    const updated = await tx.stockReservation.update({
      where: { id: reservation.id },
      data: { status: "CONVERTED" },
    });
    return { reservationId: updated.id, movementId: null, replayed: false };
  }
  if (balance.reserved.lt(usage.remaining)) insufficient();
  const nextReserved = balance.reserved.minus(usage.remaining);
  const updated = await tx.stockReservation.update({
    where: { id: reservation.id },
    data: { status: "RELEASED", releasedById: ctx.userId, releasedAt: new Date() },
  });
  const originalMovement = await tx.stockMovement.findFirst({
    where: { companyId: ctx.companyId, referenceType: "RESERVATION", referenceId: reservation.id },
    orderBy: { occurredAt: "asc" },
  });
  const movement = await tx.stockMovement.create({
    data: buildMovement({
      companyId: ctx.companyId,
      partId: reservation.partId,
      movementType: "RESERVATION_RELEASE",
      quantity: usage.remaining,
      toLocationId: reservation.locationId,
      referenceType: "RESERVATION",
      referenceId: reservation.id,
      referenceNumber: reservation.referenceNumber ?? null,
      reason: input.reason ?? null,
      notes: null,
      actorId: ctx.userId,
      resultingToQuantity: balance.onHand.minus(nextReserved),
      idempotencyKey: null,
      reversalOfId: originalMovement?.id ?? null,
      correlationId: ctx.correlationId,
    }),
  });
  await saveBalance(tx, balance, { reserved: nextReserved });
  return { reservationId: updated.id, movementId: movement.id, replayed: false };
}
// ============================================================
// RECONCILIATION / STOCK COUNT
// Expected quantities are snapshotted from the balance at
// opening; each line variance is corrected on completion by a
// RECONCILIATION ledger movement in the direction of the
// variance. Approval is a status transition with auditing.
// ============================================================

export async function countCreate(ctx: RequestContext, input: z.infer<typeof countCreateInput>) {
  requireInventory(ctx, "INVENTORY_RECONCILE");
  const countId = await prisma.$transaction(async (tx) => {
    const location = await requireLocation(tx, ctx, input.locationId);
    if (!location.active) throw new StockError("LOCATION_INACTIVE", "A reconciliation requires an active location.");
    const lines: {
      companyId: string;
      countId: string;
      partId: string;
      expectedQuantity: Quantity;
      countedQuantity: Quantity;
      variance: Quantity;
      reason: string | null;
    }[] = [];
    for (const line of input.lines) {
      const part = await requirePart(tx, ctx, line.partId);
      const balance = await tx.stockBalance.findFirst({
        where: { companyId: ctx.companyId, partId: part.id, locationId: location.id },
      });
      const expected = balance ? new D(balance.quantityOnHand) : new D(0);
      const counted = new D(line.countedQuantity);
      lines.push({
        companyId: ctx.companyId,
        countId: "",
        partId: part.id,
        expectedQuantity: expected,
        countedQuantity: counted,
        variance: counted.minus(expected),
        reason: line.reason ?? null,
      });
    }
    const count = await tx.stockCount.create({
      data: {
        companyId: ctx.companyId,
        locationId: location.id,
        status: "OPEN",
        referenceNumber: input.referenceNumber ?? null,
        notes: input.notes ?? null,
        countedById: ctx.userId,
        correlationId: ctx.correlationId,
      },
    });
    if (lines.length > 0) {
      await tx.stockCountLine.createMany({
        data: lines.map((l) => ({ ...l, countId: count.id })),
      });
    }
    return count.id;
  });
  await recordAudit(ctx, {
    source: "UI",
    module: "INVENTORY",
    entityType: "StockCount",
    entityId: countId,
    action: "STOCK_COUNT_CREATE",
    afterData: { locationId: input.locationId, lineCount: input.lines.length },
  });
  return { countId };
}

export async function countComplete(ctx: RequestContext, countId: string, input: z.infer<typeof countNoteInput>) {
  requireInventory(ctx, "INVENTORY_RECONCILE");
  const result = await prisma.$transaction(async (tx) => {
    const count = await tx.stockCount.findFirst({ where: { id: countId, companyId: ctx.companyId } });
    if (!count || count.status !== "OPEN") notFound();
    const lines = await getCountLines(tx, countId, ctx.companyId);
    const createdIds: string[] = [];
    for (const line of lines) {
      const variance = new D(line.variance);
      if (variance.isZero()) continue;
      const balance = await lockBalance(tx, ctx.companyId, line.partId, count.locationId, { createIfMissing: true });
      if (!balance) notFound();
      const increasing = variance.gt(0);
      const absVariance = variance.abs();
      const nextOnHand = increasing ? balance.onHand.plus(absVariance) : balance.onHand.minus(absVariance);
      if (!increasing && nextOnHand.lt(balance.reserved)) insufficient();
      const movement = await tx.stockMovement.create({
        data: buildMovement({
          companyId: ctx.companyId,
          partId: line.partId,
          movementType: "RECONCILIATION",
          quantity: absVariance,
          fromLocationId: increasing ? null : count.locationId,
          toLocationId: increasing ? count.locationId : null,
          referenceType: "RECONCILIATION",
          referenceId: countId,
          referenceNumber: count.referenceNumber ?? null,
          reason: line.reason ?? "Stock count correction",
          notes: input.notes ?? null,
          actorId: ctx.userId,
          resultingToQuantity: increasing ? nextOnHand : null,
          resultingFromQuantity: increasing ? null : nextOnHand,
          idempotencyKey: null,
          correlationId: ctx.correlationId,
        }),
      });
      await saveBalance(tx, balance, { onHand: nextOnHand });
      createdIds.push(movement.id);
    }
    const updated = await tx.stockCount.update({
      where: { id: count.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return { countId: updated.id, movementIds: createdIds };
  });
  await recordAudit(ctx, {
    source: "UI",
    module: "INVENTORY",
    entityType: "StockCount",
    entityId: result.countId,
    action: "STOCK_COUNT_COMPLETE",
    afterData: { movementCount: result.movementIds.length },
  });
  return result;
}

export async function countApprove(ctx: RequestContext, countId: string) {
  requireInventory(ctx, "INVENTORY_RECONCILE");
  const result = await prisma.$transaction(async (tx) => {
    const count = await tx.stockCount.findFirst({ where: { id: countId, companyId: ctx.companyId } });
    if (!count || count.status !== "COMPLETED") notFound();
    return tx.stockCount.update({
      where: { id: count.id },
      data: { status: "APPROVED", approvedById: ctx.userId, approvedAt: new Date() },
    });
  });
  await recordAudit(ctx, {
    source: "UI",
    module: "INVENTORY",
    entityType: "StockCount",
    entityId: result.id,
    action: "STOCK_COUNT_APPROVE",
  });
  return { countId: result.id };
}

export async function countCancel(ctx: RequestContext, countId: string, input: z.infer<typeof countNoteInput>) {
  requireInventory(ctx, "INVENTORY_RECONCILE");
  const result = await prisma.$transaction(async (tx) => {
    const count = await tx.stockCount.findFirst({ where: { id: countId, companyId: ctx.companyId } });
    if (!count || count.status !== "OPEN") notFound();
    return tx.stockCount.update({
      where: { id: count.id },
      data: { status: "CANCELLED", notes: input.notes ?? count.notes },
    });
  });
  await recordAudit(ctx, {
    source: "UI",
    module: "INVENTORY",
    entityType: "StockCount",
    entityId: result.id,
    action: "STOCK_COUNT_CANCEL",
    afterData: { notes: input.notes ?? null },
  });
  return { countId: result.id };
}

async function getCountLines(tx: Tx, countId: string, companyId: string) {
  return tx.stockCountLine.findMany({
    where: { countId, companyId },
    orderBy: { partId: "asc" },
  });
}

// ============================================================
// QUERIES / VIEWS â€” tenant-scoped reads only. The parts master
// and its stock position are deliberately separated so a part
// can exist with zero stock and never be confused for it.
// ============================================================

// 2026-09-23, user report: "searching for a part number 3j1907 doesn't
// pickup but searching for 3j-1907 does, this must be searched both ways
// spaces included." Part numbers get typed with or without their
// separators pretty interchangeably (hyphens, spaces) — this strips
// anything that isn't a letter or digit before comparing, on both the
// typed search term and the stored value, so "3J1907", "3j-1907" and
// "3J 1907" all find the same part no matter which way either side was
// typed. Deliberately separate from partNumberNormalized (the schema
// field listInventoryPositions used to search against — it only trims and
// uppercases, and is unique-constrained per company, so widening its own
// meaning here would risk collisions between two real parts whose numbers
// already differ only by punctuation).
function stripSeparators(value: string | null | undefined) {
  return (value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export async function listInventoryPositions(ctx: RequestContext, input: z.infer<typeof positionQuery>) {
  requireInventory(ctx, "INVENTORY_VIEW", "READ");
  const viewCost = canViewInventoryCost(ctx);
  const page = input.page;
  const pageSize = input.pageSize;
  // 2026-09-10 — Stock Levels is now the merged Parts Catalog + stock page,
  // so it filters out operationalStatus:"HISTORICAL_REFERENCE" the same
  // way the old Parts Catalog list (listMaster's "parts" case) already
  // did — those are parts a delete attempt fell back to deactivating
  // because stock/job history still references them (see deletePart in
  // master-data/service.ts), not parts a user would expect to keep seeing
  // in the normal list.
  const where: Prisma.PartWhereInput = { companyId: ctx.companyId, operationalStatus: "OPERATIONAL" };
  if (input.active === "active") where.active = true;
  else if (input.active === "inactive") where.active = false;
  // 2026-09-23 — the search itself moved out of the DB `where` and into
  // JS below (see stripSeparators' comment): matching hyphens/spaces
  // interchangeably against partNumber isn't something a plain `contains`
  // can do, so the text filter now runs after fetching. Non-text filters
  // (active/location/manufacturer/category) stay in the DB query as
  // before — only the free-text search moved.
  if (input.locationId) {
    where.stockBalances = { some: { locationId: input.locationId } };
  }
  if (input.manufacturerId) where.manufacturerId = input.manufacturerId;
  if (input.category) where.category = input.category;

  const stockBalanceWhere = input.locationId ? { locationId: input.locationId } : undefined;

  const parts = await prisma.part.findMany({
    where,
    include: {
      manufacturer: { select: { name: true } },
      taxCode: { select: { code: true } },
      binLocation: { select: { id: true, code: true, name: true } },
      // location select added 2026-09-16 — see binLocationLabel's own
      // comment below for why.
      stockBalances: { where: stockBalanceWhere, include: { location: { select: { code: true, name: true } } }, orderBy: { location: { code: "asc" } } },
      // 2026-09-29 — user request: "how can we add additional part
      // numbers for parts that have superseded numbers and also have
      // group numbers?" Selected here so both the search below and the
      // returned row (alternateNumbers, for the small badges under the
      // part number) have them without a second round-trip per part.
      alternateNumbers: { select: { id: true, number: true, kind: true }, orderBy: { number: "asc" } },
    },
    orderBy: { partNumber: "asc" },
  });

  // 2026-09-23 — search now runs here in JS rather than as a DB `contains`
  // (see stripSeparators' comment above): first pass keeps the original
  // "type it exactly as stored" behaviour across every field the 2026-09-14
  // change added (part number, description, manufacturer part number,
  // manufacturer name, bin code/name); second pass additionally matches
  // part number / manufacturer part number with hyphens, spaces and other
  // separators ignored on both sides, so "3j1907" finds "3J-1907" and
  // vice versa.
  let selected = parts;
  if (input.q) {
    const q = input.q.trim().toLowerCase();
    const qStripped = stripSeparators(input.q);
    selected = selected.filter((p) => {
      if (q && (
        p.partNumber.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        (p.manufacturerPartNumber ?? "").toLowerCase().includes(q) ||
        (p.manufacturer?.name ?? "").toLowerCase().includes(q) ||
        (p.binLocation?.code ?? "").toLowerCase().includes(q) ||
        (p.binLocation?.name ?? "").toLowerCase().includes(q) ||
        // 2026-09-29 — a part's superseded/group numbers should find it
        // here the same way its own part number does (see
        // PartAlternateNumber in schema.prisma).
        p.alternateNumbers.some((a) => a.number.toLowerCase().includes(q))
      )) return true;
      if (qStripped && (
        stripSeparators(p.partNumber).includes(qStripped) ||
        stripSeparators(p.manufacturerPartNumber).includes(qStripped) ||
        p.alternateNumbers.some((a) => stripSeparators(a.number).includes(qStripped))
      )) return true;
      return false;
    });
  }

  // Stock-state filtering is derived per part before pagination so totals and
  // page contents stay consistent with the user's selected state.
  if (input.stockState !== "ALL") {
    selected = selected.filter((p) => {
      const totals = sumBalances(p.stockBalances);
      return deriveStockState({ onHand: totals.onHand, reserved: totals.reserved, threshold: p.reorderMinimum, partActive: p.active }) === input.stockState;
    });
  }

  const paged = selected.slice((page - 1) * pageSize, page * pageSize);

  // 2026-09-22, user request: "Stock Levels - add at the top right the
  // total inventory cost price with a label 'Total Stock Price'." Summed
  // across every part matching the current filters/search/stock-state (not
  // just the current page — a per-page total would jump around as the user
  // pages through and wouldn't answer "what's my stock worth"), on-hand
  // quantity times unit cost price. Gated by the same INVENTORY_VIEW_COST
  // check as the per-row Cost Price column (canViewCost below) — this is
  // literally a sum of that same cost figure, so it can't be visible to
  // anyone the per-row column is hidden from.
  const totalStockValue = viewCost
    ? selected
        .reduce((sum, p) => sum.plus(sumBalances(p.stockBalances).onHand.times(p.defaultPurchaseCost ?? new D(0))), new D(0))
        .toString()
    : null;

  return {
    items: paged.map((p) => {
      const totals = sumBalances(p.stockBalances);
      const available = totals.onHand.minus(totals.reserved);
      return {
        id: p.id,
        partNumber: p.partNumber,
        description: p.description,
        manufacturerId: p.manufacturerId,
        manufacturerName: p.manufacturer?.name ?? null,
        manufacturerPartNumber: p.manufacturerPartNumber,
        category: p.category,
        unitOfMeasure: p.unitOfMeasure,
        notes: p.notes,
        taxCodeId: p.taxCodeId,
        taxCodeLabel: p.taxCode?.code ?? null,
        binLocationId: p.binLocationId,
        // 2026-09-16 — user request: "Part numbers can have multiple bin
        // locations, reference bin locations next to each other comma
        // seperated." A part's real bin locations are wherever it
        // actually has stock (StockBalance, already multi-location — see
        // that model's own comment), not just Part.binLocationId's single
        // "default bin" assigned at creation. So this now lists every
        // location the part currently has stock in, comma-separated,
        // falling back to the single default bin only for a part with no
        // stock anywhere yet (e.g. just created).
        binLocationLabel: buildBinLocationLabel(p.stockBalances, p.binLocation),
        // 2026-09-29 — badges under the part number in the Stock Levels
        // table (see StockLevelsWorkspace.tsx) and the "Also known as"
        // section on the Part Detail page.
        alternateNumbers: p.alternateNumbers.map((a) => ({ id: a.id, number: a.number, kind: a.kind })),
        reorderMinimum: p.reorderMinimum?.toString() ?? null,
        reorderMaximum: p.reorderMaximum?.toString() ?? null,
        reorderQuantity: p.reorderQuantity?.toString() ?? null,
        active: p.active,
        quantityOnHand: totals.onHand.toString(),
        quantityReserved: totals.reserved.toString(),
        quantityAvailable: available.toString(),
        stockState: deriveStockState({ onHand: totals.onHand, reserved: totals.reserved, threshold: p.reorderMinimum, partActive: p.active }),
        locationCount: p.stockBalances.length,
        cost: viewCost ? (p.defaultPurchaseCost?.toString() ?? null) : null,
        sellingPrice: viewCost ? (p.defaultSellingPrice?.toString() ?? null) : null,
      };
    }),
    // 2026-09-23 — used to read the DB's prisma.part.count({where}) when
    // stockState was "ALL", back when search was also a DB `where` filter
    // and that count already reflected it. Search now runs in JS above, so
    // that DB count would no longer include it; selected.length is correct
    // in every case now (it already reflects active/location/manufacturer/
    // category from the DB query, search and stock-state from JS above).
    total: selected.length,
    page,
    pageSize,
    // 2026-09-22, user request: "Stock Levels - add columns Cost Price and
    // Selling Price... only visible to company admins." cost/sellingPrice
    // on each item above are already gated per-row (null when the caller
    // lacks INVENTORY_VIEW_COST), but the Stock Levels table itself needs
    // to know whether to render those two columns AT ALL — a null cost on
    // every row (nobody's priced anything yet) must not look the same as
    // "you're not allowed to see this". Exposed here once instead of
    // re-deriving it per row on the client.
    canViewCost: viewCost,
    totalStockValue,
  };
}

// Shared by listInventoryPositions and getInventoryDetail — see the
// binLocationLabel comment on each for why this exists. Only balances with
// stock on hand are listed (a zero-quantity StockBalance row, e.g. after a
// full transfer out, isn't a location the part is meaningfully "in"
// anymore); a part with no stock anywhere yet falls back to its single
// assigned default bin, same as before this change.
// 2026-10-02 — user report: Stock Levels' bin location column showed
// "C1 (C1)", "C6 (C6)" — redundant when a location's name is just its own
// code (the default a location gets when auto-created by import, or when
// someone never bothered giving it a separate name). Only appends the
// "(code)" parenthetical when the name is actually DIFFERENT from the
// code (case/whitespace-insensitive) — a location someone genuinely named
// "Main Warehouse" with code "A1" still shows as "Main Warehouse (A1)".
function formatLocationLabel(name: string, code: string) {
  return name.trim().toLowerCase() === code.trim().toLowerCase() ? code : `${name} (${code})`;
}

function buildBinLocationLabel(balances: { quantityOnHand: Prisma.Decimal; location: { code: string; name: string } }[], defaultBin: { code: string; name: string } | null) {
  const withStock = balances.filter((b) => b.quantityOnHand.greaterThan(0));
  if (withStock.length > 0) return withStock.map((b) => formatLocationLabel(b.location.name, b.location.code)).join(", ");
  return defaultBin ? formatLocationLabel(defaultBin.name, defaultBin.code) : null;
}

function sumBalances(balances: { quantityOnHand: Prisma.Decimal; quantityReserved: Prisma.Decimal }[]) {
  return balances.reduce(
    (acc, b) => ({ onHand: acc.onHand.plus(b.quantityOnHand), reserved: acc.reserved.plus(b.quantityReserved) }),
    { onHand: new D(0), reserved: new D(0) }
  );
}
export async function listStockMovements(ctx: RequestContext, input: z.infer<typeof movementQuery>) {
  requireInventory(ctx, "STOCK_MOVEMENTS_VIEW", "READ");
  const where: Prisma.StockMovementWhereInput = { companyId: ctx.companyId };
  if (input.partId) where.partId = input.partId;
  if (input.locationId) where.OR = [{ fromLocationId: input.locationId }, { toLocationId: input.locationId }];
  if (input.movementType) where.movementType = input.movementType;
  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: {
        part: { select: { partNumber: true, description: true } },
        fromLocation: { select: { code: true, name: true } },
        toLocation: { select: { code: true, name: true } },
      },
      orderBy: { occurredAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.stockMovement.count({ where }),
  ]);
  return {
    items: rows.map((m) => ({
      id: m.id,
      movementType: m.movementType,
      quantity: m.quantity.toString(),
      partNumber: m.part.partNumber,
      partDescription: m.part.description,
      fromLocation: m.fromLocation ? { code: m.fromLocation.code, name: m.fromLocation.name } : null,
      toLocation: m.toLocation ? { code: m.toLocation.code, name: m.toLocation.name } : null,
      referenceType: m.referenceType,
      referenceNumber: m.referenceNumber,
      actor: m.actorId,
      occurredAt: m.occurredAt.toISOString(),
      reason: m.reason,
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function listReservations(ctx: RequestContext, input: z.infer<typeof countQuery>) {
  requireInventory(ctx, "INVENTORY_RESERVE", "READ");
  const where: Prisma.StockReservationWhereInput = { companyId: ctx.companyId };
  if (input.status) where.status = input.status as never;
  if (input.locationId) where.locationId = input.locationId;
  const [rows, total] = await Promise.all([
    prisma.stockReservation.findMany({
      where,
      include: { part: { select: { partNumber: true, description: true } }, location: { select: { code: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.stockReservation.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      partNumber: r.part.partNumber,
      partDescription: r.part.description,
      location: r.location ? { code: r.location.code, name: r.location.name } : null,
      quantity: r.quantity.toString(),
      status: r.status,
      referenceType: r.referenceType,
      referenceId: r.referenceId,
      referenceNumber: r.referenceNumber,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function listStockCounts(ctx: RequestContext, input: z.infer<typeof countQuery>) {
  requireInventory(ctx, "INVENTORY_RECONCILE", "READ");
  const where: Prisma.StockCountWhereInput = { companyId: ctx.companyId };
  if (input.status) where.status = input.status;
  if (input.locationId) where.locationId = input.locationId;
  const [rows, total] = await Promise.all([
    prisma.stockCount.findMany({
      where,
      include: { location: { select: { code: true, name: true } }, lines: { select: { partId: true } } },
      orderBy: { startedAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.stockCount.count({ where }),
  ]);
  return {
    items: rows.map((c) => ({
      id: c.id,
      referenceNumber: c.referenceNumber,
      location: c.location ? { code: c.location.code, name: c.location.name } : null,
      status: c.status,
      startedAt: c.startedAt.toISOString(),
      completedAt: c.completedAt?.toISOString() ?? null,
      approvedAt: c.approvedAt?.toISOString() ?? null,
      lineCount: c.lines.length,
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}
export async function getInventoryDetail(ctx: RequestContext, partId: string) {
  requireInventory(ctx, "INVENTORY_VIEW", "READ");
  const viewCost = canViewInventoryCost(ctx);
  const part = await prisma.part.findFirst({
    where: { id: partId, companyId: ctx.companyId },
    include: {
      manufacturer: { select: { name: true } },
      binLocation: { select: { id: true, code: true, name: true } },
      alternateNumbers: { select: { id: true, number: true, kind: true }, orderBy: { number: "asc" } },
      stockBalances: { include: { location: { select: { id: true, code: true, name: true, type: true } } } },
      stockMovements: {
        take: 25,
        orderBy: { occurredAt: "desc" },
        include: { fromLocation: { select: { code: true } }, toLocation: { select: { code: true } } },
      },
    },
  });
  if (!part) notFound();
  const totals = sumBalances(part.stockBalances);
  return {
    part: {
      id: part.id,
      partNumber: part.partNumber,
      description: part.description,
      manufacturerName: part.manufacturer?.name ?? null,
      manufacturerPartNumber: part.manufacturerPartNumber,
      unitOfMeasure: part.unitOfMeasure,
      category: part.category,
      active: part.active,
      notes: part.notes,
      // 2026-09-16 — same "list every location with stock, not just the
      // single default bin" change as listInventoryPositions above; see
      // buildBinLocationLabel's comment.
      binLocationLabel: buildBinLocationLabel(part.stockBalances, part.binLocation),
      // 2026-09-29 — "Also known as" on the Part Detail page (see
      // PartAlternateNumber in schema.prisma).
      alternateNumbers: part.alternateNumbers.map((a) => ({ id: a.id, number: a.number, kind: a.kind })),
      defaultSellingPrice: viewCost ? (part.defaultSellingPrice?.toString() ?? null) : null,
      reorderMinimum: part.reorderMinimum?.toString() ?? null,
      reorderMaximum: part.reorderMaximum?.toString() ?? null,
      reorderQuantity: part.reorderQuantity?.toString() ?? null,
    },
    quantityOnHand: totals.onHand.toString(),
    quantityReserved: totals.reserved.toString(),
    quantityAvailable: totals.onHand.minus(totals.reserved).toString(),
    locations: part.stockBalances.map((b) => ({
      locationId: b.location.id,
      code: b.location.code,
      name: b.location.name,
      type: b.location.type,
      quantityOnHand: b.quantityOnHand.toString(),
      quantityReserved: b.quantityReserved.toString(),
      quantityAvailable: b.quantityOnHand.minus(b.quantityReserved).toString(),
      lowStockThreshold: b.lowStockThreshold?.toString() ?? null,
    })),
    recentMovements: part.stockMovements.map((m) => ({
      id: m.id,
      movementType: m.movementType,
      quantity: m.quantity.toString(),
      fromLocationCode: m.fromLocation?.code ?? null,
      toLocationCode: m.toLocation?.code ?? null,
      referenceNumber: m.referenceNumber,
      occurredAt: m.occurredAt.toISOString(),
      reason: m.reason,
    })),
  };
}

export async function getLocationDetail(ctx: RequestContext, locationId: string) {
  requireInventory(ctx, "INVENTORY_VIEW", "READ");
  const location = await prisma.storageLocation.findFirst({
    where: { id: locationId, companyId: ctx.companyId },
    include: { stockBalances: { include: { part: { select: { id: true, partNumber: true, description: true, active: true } } } } },
  });
  if (!location) notFound();
  return {
    id: location.id,
    code: location.code,
    name: location.name,
    type: location.type,
    description: location.description,
    active: location.active,
    parts: location.stockBalances.map((b) => ({
      partId: b.part.id,
      partNumber: b.part.partNumber,
      description: b.part.description,
      active: b.part.active,
      quantityOnHand: b.quantityOnHand.toString(),
      quantityReserved: b.quantityReserved.toString(),
      quantityAvailable: b.quantityOnHand.minus(b.quantityReserved).toString(),
    })),
  };
}

// ============================================================
// Storage-location options for inventory forms (Adjust stock, and the
// bin-location picker in Add/Edit Part). 2026-09-16 — user report: "When
// clicking Adjust, locations do not pickup on dropdown." Root cause: the
// dropdown was populated from the master-data storage-locations endpoint,
// which is gated behind a *different* module (STORAGE/STORAGE_LOCATIONS_VIEW
// — see src/lib/master-data/service.ts) than the one that gates Stock
// Levels and Adjust itself (INVENTORY/INVENTORY_ADJUST). A user who can see
// Stock Levels and adjust stock but wasn't separately granted STORAGE
// access got a 403 from that fetch, which StockLevelsWorkspace's
// loadOptions() silently swallows (options are "a convenience," the form
// still works — except this dropdown IS the form here), so the location
// list just stayed empty with no visible error. This gives the same active
// locations, scoped to the INVENTORY module/permission that already gates
// this page, so anyone who can open Stock Levels can populate it.
// ============================================================

export async function listStorageLocationOptions(ctx: RequestContext) {
  requireInventory(ctx, "INVENTORY_VIEW", "READ");
  const locations = await prisma.storageLocation.findMany({
    where: { companyId: ctx.companyId, active: true },
    select: { id: true, code: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return { items: locations };
}

// Manufacturer options for Add/Edit Part's Manufacturer dropdown —
// 2026-09-16 user report: "When creating a new part in Part stock,
// manufacturer field not populating." Same root cause and same fix as
// listStorageLocationOptions right above: the dropdown was populated from
// the master-data manufacturers endpoint, gated behind a *separate*
// permission (INVENTORY/MANUFACTURERS_VIEW — see src/lib/master-data/
// service.ts's policy table) from the one that gates Stock Levels itself
// (INVENTORY_VIEW). A user who can open Stock Levels and create parts but
// wasn't separately granted Manufacturers admin access got a 403 from that
// fetch, which StockLevelsWorkspace's loadOptions() silently swallows, so
// the dropdown just stayed empty (only the blank "—" option) with no
// visible error. This gives the same active manufacturers, scoped to the
// permission that already gates this page.
export async function listManufacturerOptions(ctx: RequestContext) {
  requireInventory(ctx, "INVENTORY_VIEW", "READ");
  const manufacturers = await prisma.manufacturer.findMany({
    where: { companyId: ctx.companyId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { items: manufacturers };
}

// ============================================================
// Bulk part-number search ("Check stock" on Stock Levels) — paste a list
// of part numbers, see what's on hand for each. Read-only: nothing here
// ever creates, updates, or moves stock. Matches by partNumber, exact and
// case-insensitive (same convention the rest of this app's part-number
// lookups use, e.g. import-export's manufacturer/tax-code resolution) —
// not a fuzzy `contains`, since a bulk check is about confirming specific
// part numbers exist, not discovering new ones.
//
// FIX 2026-09-29 — user report: "when clicking check stock button, and i
// type in 3J1907 it does not pick up stock, but when I type 3J-1907 it
// does." Same root cause (and same fix, ported over) as the 2026-09-23
// "3j1907 doesn't pickup but 3j-1907 does" report on the main Stock
// Levels search (see stripSeparators' own comment above) — this function
// never got that fix, since it's a separate code path (a batched exact
// DB match, not the JS filter listInventoryPositions uses) that was added
// after that fix landed. Exact match still runs first and is the fast
// path for the common case; only numbers that still don't match after
// that (and after the alternate-number check just below) fall back to
// loading the company's parts and comparing with hyphens/spaces/other
// separators ignored on both sides, same as the main search.
// ============================================================

export async function searchPartsByNumbers(ctx: RequestContext, input: z.infer<typeof bulkPartSearchInput>) {
  requireInventory(ctx, "INVENTORY_VIEW", "READ");
  const companyId = ctx.companyId!;

  // Preserves first-seen order while de-duplicating (same input part number
  // pasted twice only needs one lookup / one result row).
  const requested = Array.from(new Set(input.partNumbers.map((p) => p.trim()).filter(Boolean)));

  const partSelect = { binLocation: { select: { code: true, name: true } }, stockBalances: true, alternateNumbers: { select: { number: true } } } as const;

  const parts = requested.length
    ? await prisma.part.findMany({
        where: {
          companyId,
          operationalStatus: "OPERATIONAL",
          OR: requested.map((partNumber) => ({ partNumber: { equals: partNumber, mode: "insensitive" as const } })),
        },
        include: partSelect,
      })
    : [];
  const byPartNumber = new Map(parts.map((p) => [p.partNumber.toLowerCase(), p]));

  // 2026-09-29 — a pasted number that doesn't match any part's own
  // partNumber directly might still be a SUPERSEDED or GROUP number
  // recorded against one (see PartAlternateNumber in schema.prisma). Only
  // the numbers that missed the direct match above are checked here — one
  // batched lookup, not a query per line — so "check stock" on an old or
  // group number resolves to the same part its current number would.
  const unmatched = requested.filter((p) => !byPartNumber.has(p.toLowerCase()));
  const byNormalizedAlt = new Map<string, (typeof parts)[number]>();
  if (unmatched.length) {
    const alts = await prisma.partAlternateNumber.findMany({
      where: { companyId, numberNormalized: { in: unmatched.map((p) => normalized(p)!) } },
      select: { numberNormalized: true, partId: true },
    });
    if (alts.length) {
      const altParts = await prisma.part.findMany({ where: { id: { in: Array.from(new Set(alts.map((a) => a.partId))) }, companyId }, include: partSelect });
      const partsById = new Map(altParts.map((p) => [p.id, p]));
      for (const alt of alts) {
        const part = partsById.get(alt.partId);
        if (part) byNormalizedAlt.set(alt.numberNormalized, part);
      }
    }
  }

  // Separator-insensitive fallback (see this function's FIX comment
  // above) — only reached for a number that matched neither a part's own
  // number nor an alternate number exactly. Loads every operational part
  // once (own number + alternate numbers) and compares with hyphens/
  // spaces/etc. stripped from both sides, same as the main Stock Levels
  // search already does.
  const stillUnmatched = unmatched.filter((p) => !byNormalizedAlt.has(normalized(p)!));
  const byStrippedNumber = new Map<string, (typeof parts)[number]>();
  if (stillUnmatched.length) {
    const allParts = await prisma.part.findMany({ where: { companyId, operationalStatus: "OPERATIONAL" }, include: partSelect });
    for (const p of allParts) {
      const ownKey = stripSeparators(p.partNumber);
      if (ownKey && !byStrippedNumber.has(ownKey)) byStrippedNumber.set(ownKey, p);
      for (const alt of p.alternateNumbers) {
        const altKey = stripSeparators(alt.number);
        if (altKey && !byStrippedNumber.has(altKey)) byStrippedNumber.set(altKey, p);
      }
    }
  }

  return {
    rows: requested.map((partNumber) => {
      const part = byPartNumber.get(partNumber.toLowerCase())
        ?? byNormalizedAlt.get(normalized(partNumber)!)
        ?? byStrippedNumber.get(stripSeparators(partNumber))
        ?? null;
      if (!part) {
        return { partNumber, found: false, partId: null, description: null, binLocationLabel: null, quantityAvailable: "0" };
      }
      const totals = sumBalances(part.stockBalances);
      return {
        // The part's own current number, not necessarily the (possibly
        // superseded/group) number that was typed to find it — same
        // "resolves to the real thing" behavior as everywhere else this
        // lookup happens.
        partNumber: part.partNumber,
        found: true,
        partId: part.id,
        description: part.description,
        binLocationLabel: part.binLocation ? formatLocationLabel(part.binLocation.name, part.binLocation.code) : null,
        quantityAvailable: totals.onHand.minus(totals.reserved).toString(),
      };
    }),
  };
}

// ============================================================
// Picking slips — "create a picking slip, which can be allocated to a job,
// printed, saved" (explicit request). Apollo X's stock is companyId +
// partId + locationId scoped (StockBalance), unlike ModApp's flat
// per-part quantity, so picking works against each selected part's own
// default bin location (Part.binLocationId — the same location every
// other part-scoped stock figure on Stock Levels already aggregates
// around, and the one receiveStock/import already post against). A part
// with no default bin, or insufficient stock there, has its shortfall
// added to the job's parts list as a PENDING (backordered) line instead of
// failing the whole request — same "in-stock picks immediately,
// out-of-stock backorders" behavior ModApp's own picking flow has.
// ============================================================

// 2026-10-06 — user request: "when creating picking slip, add supersede number
// in a column next to part number." The superseded (old) numbers recorded
// against each part (PartAlternateNumber kind SUPERSEDED), comma-joined, keyed by
// partId — looked up when a slip is created or listed rather than copied onto
// PickSlipLine, so a number added later also shows on older slips.
async function supersededNumbersByPart(companyId: string, partIds: string[]) {
  const map = new Map<string, string>();
  const ids = [...new Set(partIds)];
  if (ids.length === 0) return map;
  const rows = await prisma.partAlternateNumber.findMany({ where: { companyId, partId: { in: ids }, kind: "SUPERSEDED" }, select: { partId: true, number: true }, orderBy: { createdAt: "asc" } });
  for (const row of rows) map.set(row.partId, map.has(row.partId) ? `${map.get(row.partId)}, ${row.number}` : row.number);
  return map;
}

export async function createPickSlip(ctx: RequestContext, input: z.infer<typeof pickSlipCreateInput>) {
  requireInventory(ctx, "INVENTORY_ISSUE");

  const job = await prisma.job.findFirst({ where: { id: input.jobId, companyId: ctx.companyId }, include: { customer: true } });
  if (!job) notFound();

  // Merge duplicate partIds in the request into one line — a UI shouldn't
  // send the same part twice, but this keeps the transaction below correct
  // (one StockBalance lock per part) even if it does.
  const merged = new Map<string, Quantity>();
  for (const line of input.lines) {
    merged.set(line.partId, (merged.get(line.partId) ?? new D(0)).plus(new D(line.quantity)));
  }

  type PickedLine = { partId: string; partNumber: string; description: string; binLocationId: string; binLocationLabel: string; quantity: Quantity };

  const result = await prisma.$transaction(async (tx) => {
    const picked: PickedLine[] = [];
    let backorderCount = 0;

    for (const [partId, requestedQty] of merged) {
      const part = await requirePart(tx, ctx, partId);
      const location = part.binLocationId ? await tx.storageLocation.findFirst({ where: { id: part.binLocationId, companyId: ctx.companyId } }) : null;
      const balance = location ? await lockBalance(tx, ctx.companyId, part.id, location.id) : null;
      const available = balance ? balance.onHand.minus(balance.reserved) : new D(0);
      const pickQty = available.gt(0) ? D.min(requestedQty, available) : new D(0);
      const backorderQty = requestedQty.minus(pickQty);

      if (pickQty.gt(0) && location && balance) {
        assertOperable(part, location);
        const nextOnHand = balance.onHand.minus(pickQty);
        await tx.stockMovement.create({
          data: buildMovement({
            companyId: ctx.companyId,
            partId: part.id,
            movementType: "ISSUE",
            quantity: pickQty,
            fromLocationId: location.id,
            referenceType: "JOB",
            referenceId: job.id,
            referenceNumber: job.jobNumber ?? job.draftNumber,
            reason: "Pick slip",
            actorId: ctx.userId,
            resultingFromQuantity: nextOnHand,
            correlationId: ctx.correlationId,
          }),
        });
        await saveBalance(tx, balance, { onHand: nextOnHand });
        picked.push({
          partId: part.id,
          partNumber: part.partNumber,
          description: part.description,
          binLocationId: location.id,
          binLocationLabel: formatLocationLabel(location.name, location.code),
          quantity: pickQty,
        });
        await tx.jobPartLine.create({
          data: {
            companyId: ctx.companyId,
            jobId: job.id,
            partId: part.id,
            partNumber: part.partNumber,
            description: part.description,
            quantity: pickQty,
            status: "RECEIVED",
            receivedQuantity: pickQty,
            // Taken off the shelf right here (this flow has always issued
            // immediately), so Mark received / Undo receive must not take
            // it a second time.
            stockIssuedQuantity: pickQty,
            createdById: ctx.userId,
          },
        });
      }

      if (backorderQty.gt(0)) {
        backorderCount += 1;
        await tx.jobPartLine.create({
          data: {
            companyId: ctx.companyId,
            jobId: job.id,
            partId: part.id,
            partNumber: part.partNumber,
            description: part.description,
            quantity: backorderQty,
            status: "PENDING",
            createdById: ctx.userId,
          },
        });
      }
    }

    if (picked.length === 0) return { pickSlipId: null, picked, backorderCount };

    const pickSlip = await tx.pickSlip.create({ data: { companyId: ctx.companyId, jobId: job.id, createdById: ctx.userId } });
    await tx.pickSlipLine.createMany({
      data: picked.map((l) => ({ pickSlipId: pickSlip.id, partId: l.partId, partNumber: l.partNumber, description: l.description, binLocationId: l.binLocationId, quantity: l.quantity })),
    });
    return { pickSlipId: pickSlip.id, picked, backorderCount };
  });

  await recordAudit(ctx, {
    source: "UI",
    module: "INVENTORY",
    entityType: "PickSlip",
    entityId: result.pickSlipId ?? job.id,
    action: "PICK_SLIP_CREATED",
    afterData: { jobId: job.id, pickedLines: result.picked.length, backorderLines: result.backorderCount },
  });

  const customerName = job.customer?.tradingName || job.customer?.name || null;
  const supersededByPart = await supersededNumbersByPart(ctx.companyId!, result.picked.map((l) => l.partId));
  return {
    pickSlip:
      result.pickSlipId == null
        ? null
        : {
            id: result.pickSlipId,
            jobId: job.id,
            jobNumber: job.jobNumber ?? job.draftNumber,
            customerName,
            createdAt: new Date().toISOString(),
            lines: result.picked.map((l) => ({ partNumber: l.partNumber, supersededNumbers: supersededByPart.get(l.partId) ?? "", description: l.description, quantity: l.quantity.toString(), binLocationLabel: l.binLocationLabel })),
          },
    pickedCount: result.picked.length,
    backorderCount: result.backorderCount,
  };
}

// ============================================================
// JOB PART LINE STOCK — 2026-10-05, user request: "when creating a pick slip
// it should not automatically take from stock already, it should only take
// from stock when mark received is clicked." These three are what Mark
// received / Undo receive / changing a line's ordered quantity
// (jobs/service.ts) use to move the stock. Every ISSUE movement made here
// carries "PARTLINE:<line id>" in its notes so Undo receive can find and
// reverse exactly this line's movements later.
// ============================================================

const JOB_PART_LINE_NOTE_PREFIX = "PARTLINE:";

// Reserves up to `quantity` units for a job part line, best-effort, and
// returns how many it managed to reserve. The database allows only ONE
// ACTIVE reservation per reference (StockReservation_active_reference_key, a
// partial unique index on company + referenceType + referenceId), so a line
// can't hold a second one: if it already has an active reservation this adds
// to it (at its own bin), otherwise it makes one at a single bin — the
// preferred bin, else the default bin, else whichever bin has the most
// available. Trying to insert a second ACTIVE reservation would raise a
// unique-violation, and inside a transaction that aborts the whole
// transaction even when the error is caught — which is what made Undo
// receive fail on a line whose reservation was only partly used.
export async function reserveJobPartLineStockTx(
  tx: Tx,
  ctx: RequestContext & { companyId: string },
  input: { jobNumber: string; lineId: string; partId: string; quantity: Quantity; preferredLocationId?: string | null },
): Promise<Quantity> {
  if (input.quantity.lte(0)) return new D(0);
  const existing = await tx.stockReservation.findFirst({
    where: { companyId: ctx.companyId, referenceType: "JOB", referenceId: input.lineId, status: "ACTIVE", partId: input.partId },
  });
  if (existing) {
    const balance = await lockBalance(tx, ctx.companyId, input.partId, existing.locationId);
    if (!balance) return new D(0);
    const add = D.min(input.quantity, balance.onHand.minus(balance.reserved));
    if (add.lte(0)) return new D(0);
    const nextReserved = balance.reserved.plus(add);
    await tx.stockReservation.update({ where: { id: existing.id }, data: { quantity: existing.quantity.plus(add) } });
    await tx.stockMovement.create({
      data: buildMovement({
        companyId: ctx.companyId,
        partId: input.partId,
        movementType: "RESERVATION",
        quantity: add,
        fromLocationId: existing.locationId,
        referenceType: "RESERVATION",
        referenceId: existing.id,
        referenceNumber: input.jobNumber,
        reason: `Reserved for job ${input.jobNumber}`,
        actorId: ctx.userId,
        resultingFromQuantity: balance.onHand.minus(nextReserved),
        correlationId: ctx.correlationId,
      }),
    });
    await saveBalance(tx, balance, { reserved: nextReserved });
    return add;
  }

  const part = await tx.part.findFirst({ where: { id: input.partId, companyId: ctx.companyId }, select: { binLocationId: true } });
  const candidates = await tx.stockBalance.findMany({ where: { companyId: ctx.companyId, partId: input.partId, quantityOnHand: { gt: 0 } }, select: { locationId: true } });
  const orderedLocationIds = Array.from(new Set([
    ...(input.preferredLocationId ? [input.preferredLocationId] : []),
    ...(part?.binLocationId ? [part.binLocationId] : []),
    ...candidates.map((c) => c.locationId),
  ]));
  let best: { locationId: string; available: Quantity } | null = null;
  for (const locationId of orderedLocationIds) {
    const balance = await tx.stockBalance.findFirst({ where: { companyId: ctx.companyId, partId: input.partId, locationId } });
    const available = balance ? balance.quantityOnHand.minus(balance.quantityReserved) : new D(0);
    if (available.lte(0)) continue;
    if (available.gte(input.quantity)) { best = { locationId, available }; break; }
    if (!best || available.gt(best.available)) best = { locationId, available };
  }
  if (!best) return new D(0);
  const qty = D.min(input.quantity, best.available);
  try {
    await reserveStockTx(tx, ctx, {
      partId: input.partId,
      locationId: best.locationId,
      quantity: qty.toString(),
      referenceType: "JOB",
      referenceId: input.lineId,
      referenceNumber: input.jobNumber,
      reason: `Reserved for job ${input.jobNumber}`,
      notes: null,
      expiresAt: null,
      idempotencyKey: undefined,
    });
    return qty;
  } catch {
    return new D(0);
  }
}

// Takes up to `quantity` units of the line's part off the shelf: the line's
// own reservation(s) first (so a reservation is never mistaken for
// unavailable stock), then any other bin's available (onHand - reserved)
// stock, default bin first. Never throws for lack of stock — it takes what
// there is and reports how many units it actually issued, so Mark received
// still works for a part that was never recorded in stock.
export async function issueStockForJobPartLineTx(
  tx: Tx,
  ctx: RequestContext & { companyId: string },
  input: { jobNumber: string; jobId: string; lineId: string; partId: string; quantity: Quantity },
): Promise<{ issued: Quantity }> {
  const part = await requirePart(tx, ctx, input.partId);
  if (!part.active) return { issued: new D(0) };
  let remaining = input.quantity;
  const note = `${JOB_PART_LINE_NOTE_PREFIX}${input.lineId}`;

  const lineReservations = await tx.stockReservation.findMany({
    where: { companyId: ctx.companyId, referenceType: "JOB", referenceId: input.lineId, status: "ACTIVE", partId: part.id },
    orderBy: { createdAt: "asc" },
  });
  for (const reservation of lineReservations) {
    if (remaining.lte(0)) break;
    const location = await tx.storageLocation.findFirst({ where: { id: reservation.locationId, companyId: ctx.companyId, active: true } });
    if (!location) continue;
    const locked = await lockReservation(tx, ctx.companyId, reservation.id);
    const balance = await lockBalance(tx, ctx.companyId, part.id, location.id);
    if (!locked || locked.status !== "ACTIVE" || !balance) continue;
    const usage = await getReservationRemaining(tx, locked);
    const pickQty = D.min(remaining, D.min(usage.remaining, D.min(balance.onHand, balance.reserved)));
    if (pickQty.lte(0)) continue;
    const nextOnHand = balance.onHand.minus(pickQty);
    const nextReserved = balance.reserved.minus(pickQty);
    await tx.stockMovement.create({
      data: buildMovement({
        companyId: ctx.companyId,
        partId: part.id,
        movementType: "ISSUE",
        quantity: pickQty,
        fromLocationId: location.id,
        referenceType: "RESERVATION",
        referenceId: reservation.id,
        referenceNumber: input.jobNumber,
        reason: "Job part received",
        notes: note,
        actorId: ctx.userId,
        resultingFromQuantity: nextOnHand,
        correlationId: ctx.correlationId,
      }),
    });
    await saveBalance(tx, balance, { onHand: nextOnHand, reserved: nextReserved });
    if (usage.remaining.eq(pickQty)) {
      await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: "CONVERTED" } });
    }
    remaining = remaining.minus(pickQty);
  }

  if (remaining.gt(0)) {
    const candidates = await tx.stockBalance.findMany({
      where: { companyId: ctx.companyId, partId: part.id, quantityOnHand: { gt: 0 } },
      select: { locationId: true },
    });
    const orderedLocationIds = [
      ...(part.binLocationId ? [part.binLocationId] : []),
      ...candidates.map((c) => c.locationId).filter((id) => id !== part.binLocationId),
    ];
    for (const locationId of orderedLocationIds) {
      if (remaining.lte(0)) break;
      const location = await tx.storageLocation.findFirst({ where: { id: locationId, companyId: ctx.companyId, active: true } });
      if (!location) continue;
      const balance = await lockBalance(tx, ctx.companyId, part.id, location.id);
      const available = balance ? balance.onHand.minus(balance.reserved) : new D(0);
      if (!balance || available.lte(0)) continue;
      const pickQty = D.min(remaining, available);
      const nextOnHand = balance.onHand.minus(pickQty);
      await tx.stockMovement.create({
        data: buildMovement({
          companyId: ctx.companyId,
          partId: part.id,
          movementType: "ISSUE",
          quantity: pickQty,
          fromLocationId: location.id,
          referenceType: "JOB",
          referenceId: input.jobId,
          referenceNumber: input.jobNumber,
          reason: "Job part received",
          notes: note,
          actorId: ctx.userId,
          resultingFromQuantity: nextOnHand,
          correlationId: ctx.correlationId,
        }),
      });
      await saveBalance(tx, balance, { onHand: nextOnHand });
      remaining = remaining.minus(pickQty);
    }
  }

  return { issued: input.quantity.minus(remaining) };
}

// Undo receive: puts back every unit issueStockForJobPartLineTx took for this
// line that hasn't already been reversed (UNPICK movements pointing back at
// the original ISSUE), then re-reserves what came back so the line's stock is
// protected from other jobs again, same as before it was received.
export async function returnStockForJobPartLineTx(
  tx: Tx,
  ctx: RequestContext & { companyId: string },
  input: { jobNumber: string; jobId: string; lineId: string; partId: string },
): Promise<{ returned: Quantity }> {
  const note = `${JOB_PART_LINE_NOTE_PREFIX}${input.lineId}`;
  const issues = await tx.stockMovement.findMany({
    where: { companyId: ctx.companyId, partId: input.partId, movementType: "ISSUE", notes: note },
    orderBy: { occurredAt: "asc" },
  });
  if (issues.length === 0) return { returned: new D(0) };
  const reversals = await tx.stockMovement.findMany({
    where: { companyId: ctx.companyId, reversalOfId: { in: issues.map((i) => i.id) } },
    select: { reversalOfId: true },
  });
  const alreadyReversed = new Set(reversals.map((r) => r.reversalOfId));

  let returned = new D(0);
  const byLocation = new Map<string, Quantity>();
  for (const issue of issues) {
    if (alreadyReversed.has(issue.id) || !issue.fromLocationId) continue;
    const balance = await lockBalance(tx, ctx.companyId, input.partId, issue.fromLocationId, { createIfMissing: true });
    if (!balance) continue;
    const nextOnHand = balance.onHand.plus(issue.quantity);
    await tx.stockMovement.create({
      data: buildMovement({
        companyId: ctx.companyId,
        partId: input.partId,
        movementType: "UNPICK",
        quantity: issue.quantity,
        toLocationId: issue.fromLocationId,
        referenceType: "JOB",
        referenceId: input.jobId,
        referenceNumber: input.jobNumber,
        reason: "Job part receiving undone",
        actorId: ctx.userId,
        resultingToQuantity: nextOnHand,
        reversalOfId: issue.id,
        correlationId: ctx.correlationId,
      }),
    });
    await saveBalance(tx, balance, { onHand: nextOnHand });
    returned = returned.plus(issue.quantity);
    byLocation.set(issue.fromLocationId, (byLocation.get(issue.fromLocationId) ?? new D(0)).plus(issue.quantity));
  }

  // Put the returned stock back under a reservation for the line, so other
  // jobs can't take it. Best-effort, and always a single reservation (see
  // reserveJobPartLineStockTx for why).
  if (returned.gt(0)) {
    const firstLocationId = byLocation.keys().next().value as string | undefined;
    await reserveJobPartLineStockTx(tx, ctx, { jobNumber: input.jobNumber, lineId: input.lineId, partId: input.partId, quantity: returned, preferredLocationId: firstLocationId ?? null });
  }
  return { returned };
}

// 2026-10-05, user report (BRE1071 / 4D3107): a job part line can end up linked
// to an inactive/"historical" Part record (deleting a part that has history
// only deactivates it) while the live part with the same number is the one
// Stock Levels shows. Stock can't be listed or issued against the dead record,
// so Create pick slip skipped the line as "inactive" and Mark received would
// silently take nothing. If the line's part is inactive, find the live part
// for the line's own part number and move the line (and its reservation) to
// it. Returns the part id to use from here on; relinked says whether it moved.
export async function relinkJobPartLineToActivePartTx(
  tx: Tx,
  ctx: RequestContext & { companyId: string },
  input: { jobNumber: string; line: { id: string; partId: string; partNumber: string; quantity: Quantity; orderedQuantity: Quantity | null; orderNumber: string | null; hasSupplier: boolean; receivedQuantity: Quantity | null; stockIssuedQuantity: Quantity | null; pickedQuantity: Quantity | null } },
): Promise<{ partId: string; relinked: boolean }> {
  const { line } = input;
  const current = await tx.part.findFirst({ where: { id: line.partId, companyId: ctx.companyId }, select: { id: true, active: true, operationalStatus: true } });
  if (!current || (current.active && current.operationalStatus === "OPERATIONAL")) return { partId: line.partId, relinked: false };
  const replacement = await findPartByNumber(tx, ctx.companyId, line.partNumber, { id: true, active: true, operationalStatus: true, binLocationId: true });
  if (!replacement || replacement.id === line.partId || !replacement.active || replacement.operationalStatus !== "OPERATIONAL") return { partId: line.partId, relinked: false };

  const old = await tx.stockReservation.findMany({ where: { companyId: ctx.companyId, referenceType: "JOB", referenceId: line.id, status: "ACTIVE" } });
  for (const reservation of old) {
    try { await releaseReservationTx(tx, ctx, reservation.id, { reason: "Part line moved to the active part record" }); } catch { /* best-effort */ }
  }
  await tx.jobPartLine.update({ where: { id: line.id }, data: { partId: replacement.id, updatedById: ctx.userId } });

  const qtys = partLineQuantities({
    quantity: line.quantity.toString(),
    orderedQuantity: line.orderedQuantity?.toString() ?? null,
    orderNumber: line.orderNumber,
    hasSupplier: line.hasSupplier,
    receivedQuantity: line.receivedQuantity?.toString() ?? null,
    stockIssuedQuantity: line.stockIssuedQuantity?.toString() ?? null,
    pickedQuantity: line.pickedQuantity?.toString() ?? null,
  });
  const target = D.max(new D(qtys.stockQty.toString()).minus(line.stockIssuedQuantity ?? new D(0)), new D(0));
  if (target.gt(0) && !line.receivedQuantity) {
    await reserveJobPartLineStockTx(tx, ctx, { jobNumber: input.jobNumber, lineId: line.id, partId: replacement.id, quantity: target, preferredLocationId: replacement.binLocationId ?? null });
  }
  return { partId: replacement.id, relinked: true };
}

// Brings a line's active reservation(s) in line with how many units are now
// meant to come from stock (targetQuantity) — used when its ordered quantity
// changes, so units ordered elsewhere stop being held back from other jobs
// and units moved back to stock are held again. Best-effort on the reserve
// side, same as when a line is first added.
export async function reconcileJobPartLineReservationTx(
  tx: Tx,
  ctx: RequestContext & { companyId: string },
  input: { jobNumber: string; lineId: string; partId: string; targetQuantity: Quantity },
): Promise<void> {
  const reservations = await tx.stockReservation.findMany({
    where: { companyId: ctx.companyId, referenceType: "JOB", referenceId: input.lineId, status: "ACTIVE", partId: input.partId },
    orderBy: { createdAt: "asc" },
  });
  let held = new D(0);
  for (const reservation of reservations) {
    const locked = await lockReservation(tx, ctx.companyId, reservation.id);
    if (!locked || locked.status !== "ACTIVE") continue;
    held = held.plus((await getReservationRemaining(tx, locked)).remaining);
  }
  const target = D.max(input.targetQuantity, new D(0));
  if (held.eq(target)) return;

  let toReserve = target.minus(held);
  if (held.gt(target)) {
    for (const reservation of reservations) {
      await releaseReservationTx(tx, ctx, reservation.id, { reason: "Part line quantity from stock changed" });
    }
    toReserve = target;
  }
  if (toReserve.lte(0)) return;

  await reserveJobPartLineStockTx(tx, ctx, { jobNumber: input.jobNumber, lineId: input.lineId, partId: input.partId, quantity: toReserve });
}

// ============================================================
// JOB-SCOPED PICK SLIP — "Create picking slip" button on the Job's own
// Parts list section (2026-09-16 user request). Unlike createPickSlip
// above (used from Stock Levels' "Check stock" / floating pick bar, which
// always creates brand-new JobPartLine rows because the job might not
// have those parts listed at all yet), this targets the job's EXISTING
// part lines — creating new lines here would duplicate every part
// already on the list. Each outstanding line (not yet fully received,
// and with a linked catalog part — a free-text line has nothing to pick
// against) is picked against its own bin-location stock and updated in
// place, using the exact same RECEIVED/PARTIALLY_RECEIVED transition
// markPartLineReceived (jobs/service.ts) uses for a manual receipt, so a
// stock-backed pick and a manual "mark received" always agree on what a
// line's status means. A line with nothing available just stays as-is —
// it's already sitting on the job's parts list as PENDING/ON_ORDER, no
// separate "backorder" row needed the way the bare Stock Levels flow
// needs one.
// ============================================================

// 2026-10-08, user request (picking slips): "when clicking generate picking
// slip, and a part is reserved, allow a window to show all reserved part
// numbers, next to part number allow user to override reservation to pull the
// part from stock." Read-only look at what Create picking slip would do for
// this job: for every part line that cannot be listed in full because the
// stock it needs is reserved for OTHER jobs, one row saying how much can be
// listed now, how much is held back and by whom. Nothing is changed here; the
// person picks which rows to override and createPickSlipForJob does it.
export type PickSlipReservationConflict = {
  lineId: string;
  partNumber: string;
  description: string | null;
  needed: string;
  availableNow: string;
  heldBack: string;
  onHand: string;
  reservedForThisJob: string;
  reservedByOthers: { reference: string; quantity: string }[];
};

export async function previewPickSlipForJob(ctx: RequestContext, jobId: string): Promise<{ conflicts: PickSlipReservationConflict[] }> {
  requireInventory(ctx, "INVENTORY_ISSUE");
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId: ctx.companyId }, select: { id: true } });
  if (!job) notFound();
  const eligibleLines = await prisma.jobPartLine.findMany({
    where: { companyId: ctx.companyId, jobId: job.id, partId: { not: null }, status: { not: "RECEIVED" } },
  });

  const conflicts = await prisma.$transaction(async (tx) => {
    const out: PickSlipReservationConflict[] = [];
    for (const line of eligibleLines) {
      if (!line.partId) continue;
      const qtys = partLineQuantities({
        quantity: line.quantity.toString(),
        orderedQuantity: line.orderedQuantity?.toString() ?? null,
        orderNumber: line.orderNumber,
        hasSupplier: Boolean(line.orderedFromSupplierId),
        receivedQuantity: line.receivedQuantity?.toString() ?? null,
        stockIssuedQuantity: line.stockIssuedQuantity?.toString() ?? null,
        pickedQuantity: line.pickedQuantity?.toString() ?? null,
      });
      const needed = new D(qtys.toListOnPickSlip.toString());
      if (needed.lte(0)) continue;
      const part = await tx.part.findFirst({ where: { id: line.partId, companyId: ctx.companyId } });
      if (!part || !part.active) continue;

      const reservations = await tx.stockReservation.findMany({
        where: { companyId: ctx.companyId, partId: part.id, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
      });
      let own = new D(0);
      const others = new Map<string, Quantity>();
      for (const reservation of reservations) {
        const usage = await getReservationRemaining(tx, reservation as unknown as LockedReservation);
        if (usage.remaining.lte(0)) continue;
        if (reservation.referenceId === line.id) own = own.plus(usage.remaining);
        else others.set(reservation.referenceNumber || "Manual reservation", (others.get(reservation.referenceNumber || "Manual reservation") ?? new D(0)).plus(usage.remaining));
      }
      const balances = await tx.stockBalance.findMany({ where: { companyId: ctx.companyId, partId: part.id, quantityOnHand: { gt: 0 } } });
      let onHand = new D(0);
      let freeToAnyone = new D(0);
      for (const balance of balances) {
        onHand = onHand.plus(balance.quantityOnHand);
        freeToAnyone = freeToAnyone.plus(D.max(balance.quantityOnHand.minus(balance.quantityReserved), new D(0)));
      }
      const availableNow = D.min(needed, own.plus(freeToAnyone));
      const heldBack = needed.minus(availableNow);
      const othersTotal = Array.from(others.values()).reduce((sum, q) => sum.plus(q), new D(0));
      if (heldBack.lte(0) || othersTotal.lte(0)) continue;
      out.push({
        lineId: line.id,
        partNumber: line.partNumber,
        description: line.description,
        needed: needed.toString(),
        availableNow: availableNow.toString(),
        heldBack: D.min(heldBack, othersTotal).toString(),
        onHand: onHand.toString(),
        reservedForThisJob: own.toString(),
        reservedByOthers: Array.from(others.entries()).map(([reference, quantity]) => ({ reference, quantity: quantity.toString() })),
      });
    }
    return out;
  });
  return { conflicts };
}

// Takes `by` units off another reservation's hold without cancelling the
// rest of it — a RESERVATION_RELEASE movement for just that many, so the
// reservation's remaining quantity (quantity - issued - released) shrinks and
// the bin's reserved figure drops with it. Returns how many were freed.
async function reduceReservationTx(tx: Tx, ctx: RequestContext & { companyId: string }, reservationId: string, by: Quantity, reason: string): Promise<Quantity> {
  const reservation = await lockReservation(tx, ctx.companyId, reservationId);
  if (!reservation || reservation.status !== "ACTIVE") return new D(0);
  const balance = await lockBalance(tx, ctx.companyId, reservation.partId, reservation.locationId);
  if (!balance) return new D(0);
  const usage = await getReservationRemaining(tx, reservation);
  const take = D.min(by, D.min(usage.remaining, balance.reserved));
  if (take.lte(0)) return new D(0);
  const nextReserved = balance.reserved.minus(take);
  const originalMovement = await tx.stockMovement.findFirst({
    where: { companyId: ctx.companyId, referenceType: "RESERVATION", referenceId: reservation.id },
    orderBy: { occurredAt: "asc" },
  });
  await tx.stockMovement.create({
    data: buildMovement({
      companyId: ctx.companyId,
      partId: reservation.partId,
      movementType: "RESERVATION_RELEASE",
      quantity: take,
      toLocationId: reservation.locationId,
      referenceType: "RESERVATION",
      referenceId: reservation.id,
      referenceNumber: reservation.referenceNumber ?? null,
      reason,
      notes: null,
      actorId: ctx.userId,
      resultingToQuantity: balance.onHand.minus(nextReserved),
      idempotencyKey: null,
      reversalOfId: originalMovement?.id ?? null,
      correlationId: ctx.correlationId,
    }),
  });
  if (take.eq(usage.remaining)) {
    await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED", releasedById: ctx.userId, releasedAt: new Date() } });
  }
  await saveBalance(tx, balance, { reserved: nextReserved });
  return take;
}

// The override itself: frees up to `need` units that other jobs hold (newest
// reservations first), tells each affected job on its activity log, and
// reserves the freed units for this line so the stock is still held for it
// until Mark received takes it off the shelf. Only frees what is actually
// short after this line's own reservation and any unreserved stock.
async function takeOverReservationsForLineTx(
  tx: Tx,
  ctx: RequestContext & { companyId: string },
  input: { jobNumber: string; lineId: string; partId: string; partNumber: string; need: Quantity },
): Promise<Quantity> {
  // 2026-10-08, user request: "when taking from reserved stock take from the
  // last listed job." The Reserved parts window lists the jobs holding the
  // part oldest reservation first (previewPickSlipForJob), so the units are
  // taken from the bottom of that list upwards: reservations are grouped by
  // job reference in the same first-seen order and the groups are walked in
  // reverse.
  const reservationsAsc = await tx.stockReservation.findMany({
    where: { companyId: ctx.companyId, partId: input.partId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  const groupOrder: string[] = [];
  for (const r of reservationsAsc) {
    const key = r.referenceNumber || "Manual reservation";
    if (!groupOrder.includes(key)) groupOrder.push(key);
  }
  const reservations = reservationsAsc
    .map((r, index) => ({ r, index, group: groupOrder.indexOf(r.referenceNumber || "Manual reservation") }))
    .sort((a, b) => b.group - a.group || b.index - a.index)
    .map((x) => x.r);
  let own = new D(0);
  for (const reservation of reservations) {
    if (reservation.referenceId !== input.lineId) continue;
    own = own.plus((await getReservationRemaining(tx, reservation as unknown as LockedReservation)).remaining);
  }
  const balances = await tx.stockBalance.findMany({ where: { companyId: ctx.companyId, partId: input.partId, quantityOnHand: { gt: 0 } } });
  const free = balances.reduce((sum, b) => sum.plus(D.max(b.quantityOnHand.minus(b.quantityReserved), new D(0))), new D(0));
  let short = input.need.minus(own).minus(free);
  if (short.lte(0)) return new D(0);

  let freed = new D(0);
  const affected: Array<{ line: { id: string; jobId: string; partNumber: string; status: string; quantity: Quantity; orderedQuantity: Quantity | null; stockIssuedQuantity: Quantity | null; job: { jobNumber: string | null; draftNumber: string | null } }; took: Quantity }> = [];
  for (const reservation of reservations) {
    if (short.lte(0)) break;
    if (reservation.referenceId === input.lineId) continue;
    const took = await reduceReservationTx(tx, ctx, reservation.id, short, `Pulled for job ${input.jobNumber} picking slip (reservation overridden)`);
    if (took.lte(0)) continue;
    freed = freed.plus(took);
    short = short.minus(took);
    if (reservation.referenceType === "JOB" && reservation.referenceId) {
      const otherLine = await tx.jobPartLine.findFirst({
        where: { id: reservation.referenceId, companyId: ctx.companyId },
        select: { id: true, jobId: true, partNumber: true, status: true, quantity: true, orderedQuantity: true, stockIssuedQuantity: true, job: { select: { jobNumber: true, draftNumber: true } } },
      });
      if (otherLine) {
        affected.push({ line: otherLine, took });
      }
    }
  }
  if (freed.gt(0)) {
    await reserveJobPartLineStockTx(tx, ctx, { jobNumber: input.jobNumber, lineId: input.lineId, partId: input.partId, quantity: freed });
  }

  // 2026-10-08, user request: "create the picking slip override with the
  // pending status automatically switching." Once the units are re-held for
  // the overriding line, each job that lost units is checked the way a newly
  // added part is: a line showing In stock stays In stock only while what it
  // still holds plus the unreserved stock covers what it needs; otherwise it
  // switches to Pending. Lines already picked, ordered or received are left
  // alone, they are not waiting on shelf stock.
  const afterBalances = await tx.stockBalance.findMany({ where: { companyId: ctx.companyId, partId: input.partId, quantityOnHand: { gt: 0 } } });
  const unreservedNow = afterBalances.reduce((sum, b) => sum.plus(D.max(b.quantityOnHand.minus(b.quantityReserved), new D(0))), new D(0));
  const handled = new Map<string, { jobId: string; partNumber: string; took: Quantity; status: string; toPending: boolean }>();
  for (const { line, took } of affected) {
    const prior = handled.get(line.id);
    if (prior) {
      prior.took = prior.took.plus(took);
      continue;
    }
    let toPending = false;
    if (line.status === "IN_STOCK") {
      const heldRows = await tx.stockReservation.findMany({ where: { companyId: ctx.companyId, referenceType: "JOB", referenceId: line.id, status: "ACTIVE" } });
      let held = new D(0);
      for (const row of heldRows) held = held.plus((await getReservationRemaining(tx, row as unknown as LockedReservation)).remaining);
      const needed = line.quantity.minus(line.orderedQuantity ?? new D(0)).minus(line.stockIssuedQuantity ?? new D(0));
      if (needed.gt(0) && held.plus(unreservedNow).lt(needed)) {
        toPending = true;
        await tx.jobPartLine.update({ where: { id: line.id }, data: { status: "PENDING" as never } });
        // A Pending line holds nothing (same as everywhere else), so what it
        // still held goes back to free stock.
        await reconcileJobPartLineReservationTx(tx, ctx, { jobNumber: line.job.jobNumber ?? line.job.draftNumber ?? "", lineId: line.id, partId: input.partId, targetQuantity: new D(0) });
      }
    }
    handled.set(line.id, { jobId: line.jobId, partNumber: line.partNumber, took, status: line.status, toPending });
  }
  for (const [lineId, info] of handled) {
    await tx.jobActivity.create({
      data: {
        companyId: ctx.companyId,
        jobId: info.jobId,
        actorId: ctx.userId,
        type: "RESERVATION_RELEASED",
        description: `${info.took.toString()} x ${info.partNumber} reserved for this job were pulled for job ${input.jobNumber}'s picking slip.${info.toPending ? " The line was set to Pending." : ""}`,
        metadata: { lineId, partNumber: info.partNumber, quantity: info.took.toString(), takenByJob: input.jobNumber, statusChangedTo: info.toPending ? "PENDING" : null } as Prisma.InputJsonValue,
      },
    });
  }
  return freed;
}

export async function createPickSlipForJob(ctx: RequestContext, jobId: string, options?: { overrideLineIds?: string[] }) {
  requireInventory(ctx, "INVENTORY_ISSUE");
  // Part lines whose reservations held by other jobs the person chose to
  // override (see previewPickSlipForJob).
  const overrideLineIds = new Set(options?.overrideLineIds ?? []);

  const job = await prisma.job.findFirst({ where: { id: jobId, companyId: ctx.companyId }, include: { customer: true } });
  if (!job) notFound();

  // 2026-09-29 — follow-up to the multi-bin fix above: job BRE1116 was
  // STILL failing with "No stock was available to pick right now" even
  // after that fix landed. Root cause #2: this filter never included
  // "IN_STOCK" at all. addPartLinesBulk (jobs/service.ts) sets a new line's
  // status to IN_STOCK — not PENDING — whenever the part's aggregate
  // on-hand stock already covers the requested quantity at add-time (see
  // its own comment there); it does NOT set receivedQuantity, so such a
  // line is genuinely un-picked, just like a PENDING one. Any job whose
  // parts already showed the "In Stock" status badge (BRE1116 included) had
  // every one of those lines silently excluded here before the multi-bin
  // lookup below ever ran, no matter how good that lookup was.
  //
  // 2026-09-29, same day — switched from an allow-list to a deny-list
  // (exclude only RECEIVED, the one truly terminal status — nothing left
  // to pick once a line is fully received) after this exact mistake bit
  // twice in one day: the allow-list above had to be patched once
  // already for IN_STOCK, and would otherwise have needed patching AGAIN
  // for the new PICKED status added below (a partially-picked line still
  // needs to be pickable again for its remaining quantity). A deny-list
  // means the next new status doesn't require remembering to come back
  // here.
  const eligibleLines = await prisma.jobPartLine.findMany({
    where: {
      companyId: ctx.companyId,
      jobId: job.id,
      partId: { not: null },
      status: { not: "RECEIVED" },
    },
  });

  // 2026-09-29 — jobPartLineId/previousStatus/stockMovementId added
  // alongside the "cancel picking slip" feature (user request: "need a
  // way to cancel picking slip if a error was made") — see
  // cancelPickSlip below, and PickSlipLine's own schema comment.
  //
  // 2026-10-05, user request: "when creating a pick slip it should not
  // automatically take from stock already, it should only take from stock
  // when mark received is clicked." A pick slip is now only a list of what
  // to fetch and from which bin: nothing is issued, no balance changes and
  // no reservation is consumed here, so stockMovementId is null on every new
  // PickSlipLine (cancelPickSlip uses that to tell old slips, which did take
  // stock, from new ones). The stock leaves the shelf in
  // markPartLineReceived (jobs/service.ts), through
  // issueStockForJobPartLineTx below. A line's pickedQuantity now means
  // "listed on a pick slip", and the list is limited to the units meant to
  // come from stock (quantity - orderedQuantity), so a part ordered from
  // somewhere else is never listed.
  type PickedLine = { partId: string; partNumber: string; description: string; binLocationId: string; binLocationLabel: string; quantity: Quantity; jobPartLineId: string; previousStatus: string; stockMovementId: string | null };

  const result = await prisma.$transaction(async (tx) => {
    const picked: PickedLine[] = [];
    // 2026-10-05, user report (job BRE1071, part 4D3107): after removing a
    // typed supplier, Create pick slip said "No stock was available to list
    // right now (parts ordered from a supplier are skipped)" with no hint
    // which line or why. Every line that is left off the slip now says so.
    const skipped: { partNumber: string; reason: string }[] = [];

    for (const line of eligibleLines) {
      if (!line.partId) continue;
      let part = await requirePart(tx, ctx, line.partId);
      if (!part.active || part.operationalStatus !== "OPERATIONAL") {
        const moved = await relinkJobPartLineToActivePartTx(tx, ctx, {
          jobNumber: job.jobNumber ?? job.draftNumber ?? job.id,
          line: { id: line.id, partId: line.partId, partNumber: line.partNumber, quantity: line.quantity, orderedQuantity: line.orderedQuantity ?? null, orderNumber: line.orderNumber, hasSupplier: Boolean(line.orderedFromSupplierId), receivedQuantity: line.receivedQuantity ?? null, stockIssuedQuantity: line.stockIssuedQuantity ?? null, pickedQuantity: line.pickedQuantity ?? null },
        });
        if (moved.relinked) part = await requirePart(tx, ctx, moved.partId);
      }
      // Inactive parts used to abort the WHOLE pick slip via
      // assertOperable's throw (one bad line blocking every other line on
      // the job) — skipping instead keeps this function's own "list what
      // is there" promise intact even for this case.
      if (!part.active) { skipped.push({ partNumber: line.partNumber, reason: `the part record this line is linked to (${part.partNumber}) is inactive and no active part matches this number` }); continue; }

      const statusBeforeThisPick = String(line.status);
      const alreadyPicked = line.pickedQuantity ?? new D(0);
      const qtys = partLineQuantities({
        quantity: line.quantity.toString(),
        orderedQuantity: line.orderedQuantity?.toString() ?? null,
        orderNumber: line.orderNumber,
        hasSupplier: Boolean(line.orderedFromSupplierId),
        receivedQuantity: line.receivedQuantity?.toString() ?? null,
        stockIssuedQuantity: line.stockIssuedQuantity?.toString() ?? null,
        pickedQuantity: line.pickedQuantity?.toString() ?? null,
      });
      let remaining = new D(qtys.toListOnPickSlip.toString());
      if (remaining.lte(0)) {
        if (qtys.stockQty <= 0) {
          const why = [line.orderNumber ? `Order # ${line.orderNumber}` : null, line.orderedFromSupplierId ? "a supplier" : null].filter(Boolean).join(" and ");
          skipped.push({ partNumber: line.partNumber, reason: `it is marked as ordered (${why || "ordered quantity"}) — clear the Order # and supplier, or lower Qty ordered, to pick it from stock` });
        } else {
          skipped.push({ partNumber: line.partNumber, reason: "it is already listed on a pick slip" });
        }
        continue;
      }

      const pickedForLine: PickedLine[] = [];

      // Person chose to override other jobs' reservations for this line: free
      // what is short (and hold it for this line) before listing, so the
      // normal steps below find it as this line's own reserved stock.
      if (overrideLineIds.has(line.id)) {
        await takeOverReservationsForLineTx(tx, { ...ctx, companyId: ctx.companyId }, {
          jobNumber: job.jobNumber ?? job.draftNumber ?? job.id,
          lineId: line.id,
          partId: part.id,
          partNumber: line.partNumber,
          need: remaining,
        });
      }

      // 1. Bins this line already has stock reserved at, first — a line's
      // own reservation shouldn't look like unavailable stock to itself.
      // Read-only: the reservation is left exactly as it is until Mark
      // received consumes it.
      const lineReservations = await tx.stockReservation.findMany({
        where: { companyId: ctx.companyId, referenceType: "JOB", referenceId: line.id, status: "ACTIVE", partId: part.id },
        orderBy: { createdAt: "asc" },
      });
      for (const reservation of lineReservations) {
        if (remaining.lte(0)) break;
        const location = await tx.storageLocation.findFirst({ where: { id: reservation.locationId, companyId: ctx.companyId, active: true } });
        if (!location) continue;
        const balance = await tx.stockBalance.findFirst({ where: { companyId: ctx.companyId, partId: part.id, locationId: location.id } });
        if (!balance) continue;
        const usage = await getReservationRemaining(tx, reservation);
        const listQty = D.min(remaining, D.min(usage.remaining, balance.quantityOnHand));
        if (listQty.lte(0)) continue;
        pickedForLine.push({ partId: part.id, partNumber: part.partNumber, description: part.description, binLocationId: location.id, binLocationLabel: formatLocationLabel(location.name, location.code), quantity: listQty, jobPartLineId: line.id, previousStatus: statusBeforeThisPick, stockMovementId: null });
        remaining = remaining.minus(listQty);
      }

      // 2. Still short? List any OTHER bin with available (onHand -
      // reserved) stock for this part, default bin first, then the rest —
      // see the 2026-09-29 multi-bin note on issueStockForJobPartLineTx.
      if (remaining.gt(0)) {
        const candidates = await tx.stockBalance.findMany({
          where: { companyId: ctx.companyId, partId: part.id, quantityOnHand: { gt: 0 } },
          select: { locationId: true },
        });
        const orderedLocationIds = [
          ...(part.binLocationId ? [part.binLocationId] : []),
          ...candidates.map((c) => c.locationId).filter((id) => id !== part.binLocationId),
        ];
        for (const locationId of orderedLocationIds) {
          if (remaining.lte(0)) break;
          const location = await tx.storageLocation.findFirst({ where: { id: locationId, companyId: ctx.companyId, active: true } });
          if (!location) continue;
          const balance = await tx.stockBalance.findFirst({ where: { companyId: ctx.companyId, partId: part.id, locationId: location.id } });
          const available = balance ? balance.quantityOnHand.minus(balance.quantityReserved) : new D(0);
          if (!balance || available.lte(0)) continue;
          const listQty = D.min(remaining, available);
          pickedForLine.push({ partId: part.id, partNumber: part.partNumber, description: part.description, binLocationId: location.id, binLocationLabel: formatLocationLabel(location.name, location.code), quantity: listQty, jobPartLineId: line.id, previousStatus: statusBeforeThisPick, stockMovementId: null });
          remaining = remaining.minus(listQty);
        }
      }

      if (pickedForLine.length === 0) { skipped.push({ partNumber: line.partNumber, reason: "no stock is on hand in an active bin for it (or it is all reserved for other jobs)" }); continue; }

      const totalPicked = pickedForLine.reduce((sum, p) => sum.plus(p.quantity), new D(0));
      const newPickedQuantity = alreadyPicked.plus(totalPicked);
      // PICKED = "on a pick slip, not confirmed yet". A line that has
      // already had some units received keeps its (PARTIALLY_RECEIVED)
      // status rather than being pulled back to PICKED.
      await tx.jobPartLine.update({
        where: { id: line.id },
        data: {
          ...(line.status === "PARTIALLY_RECEIVED" ? {} : { status: "PICKED" as const }),
          pickedQuantity: newPickedQuantity,
          updatedById: ctx.userId,
        },
      });

      picked.push(...pickedForLine);
    }

    if (picked.length === 0) return { pickSlipId: null as string | null, picked, skipped };

    const pickSlip = await tx.pickSlip.create({ data: { companyId: ctx.companyId, jobId: job.id, createdById: ctx.userId } });
    await tx.pickSlipLine.createMany({
      data: picked.map((l) => ({
        pickSlipId: pickSlip.id,
        partId: l.partId,
        partNumber: l.partNumber,
        description: l.description,
        binLocationId: l.binLocationId,
        quantity: l.quantity,
        jobPartLineId: l.jobPartLineId,
        previousStatus: l.previousStatus as never,
        stockMovementId: l.stockMovementId,
      })),
    });
    return { pickSlipId: pickSlip.id as string | null, picked, skipped };
  }, { maxWait: 10000, timeout: 30000 });

  const outstandingCount = eligibleLines.length - result.picked.length;

  if (result.pickSlipId) {
    await recordAudit(ctx, {
      source: "UI",
      module: "INVENTORY",
      entityType: "PickSlip",
      entityId: result.pickSlipId,
      action: "PICK_SLIP_CREATED",
      afterData: { jobId: job.id, pickedLines: result.picked.length, outstandingLines: outstandingCount },
    });
  }

  const customerName = job.customer?.tradingName || job.customer?.name || null;
  const supersededByPart = await supersededNumbersByPart(ctx.companyId!, result.picked.map((l) => l.partId));
  return {
    pickSlip:
      result.pickSlipId == null
        ? null
        : {
            id: result.pickSlipId,
            jobId: job.id,
            jobNumber: job.jobNumber ?? job.draftNumber,
            customerName,
            createdAt: new Date().toISOString(),
            lines: result.picked.map((l) => ({ partNumber: l.partNumber, supersededNumbers: supersededByPart.get(l.partId) ?? "", description: l.description, quantity: l.quantity.toString(), binLocationLabel: l.binLocationLabel })),
          },
    pickedCount: result.picked.length,
    outstandingCount,
    skipped: result.skipped,
  };
}

// 2026-09-29 — user request: "in a job, when creating a picking slip,
// need a way to cancel picking slip if a error was made." Reverses a
// pick slip: restores the stock each line took (a new UNPICK
// StockMovement per line — a value StockMovementType already had
// reserved and unused until now — with reversalOfId pointing back at
// the original ISSUE), then, only for a line whose JobPartLine hasn't
// moved on since (still status PICKED — see PartLineStatus's own
// comment), rolls its pickedQuantity back by this slip's share and, if
// that brings it to zero, restores whatever status it had right before
// THIS specific pick (PickSlipLine.previousStatus — see that model's
// own comment for why it's captured per pick-slip-line rather than
// reusing JobPartLine.previousStatus, which is reserved for the
// separate Mark received undo flow). A line that's since been marked
// received (status no longer PICKED) is left alone — its stock is
// still restored, but silently un-receiving a person's own explicit
// confirmation would be a much bigger surprise than leaving its
// pickedQuantity a little stale; the response's skippedLines count
// flags this so it's visible after the fact rather than silent. A
// PickSlipLine from before this migration has no jobPartLineId at all
// (older data) — its stock is still restored, there's just no
// JobPartLine to roll back.
//
// Works on a pick slip from either creation path (this job-scoped one,
// or Stock Levels' own createPickSlip) — the latter's lines simply
// have no jobPartLineId either, so cancelling one of those restores
// stock only, same as a pre-migration row.
//
// 2026-09-29, later same day — user request: "deleted pickslips must
// delete completely from the system." Originally this only flipped
// PickSlip.status to CANCELLED (kept the row as a visible audit entry
// in both list views); the user twice reported a cancelled slip still
// "showing" in the table — once from an actual deploy bug (Follow-up
// 6, since fixed), and once as a direct ask that a deleted slip simply
// not exist any more, anywhere, rather than linger as a greyed-out
// row a person has to mentally filter out. So this now genuinely
// deletes the PickSlip row (tx.pickSlip.delete — cascades to its
// PickSlipLine rows via the FK's own ON DELETE CASCADE from the
// original 20260914090000_pick_slips migration, no manual line
// deletion needed) rather than soft-cancelling it. PickSlipStatus/
// cancelledAt/cancelledById/cancelReason are left in the schema
// unused rather than migrated away — harmless dead columns, and a
// smaller/safer change than a schema rollback. The permanent record
// that a deletion happened at all now lives only in AuditEvent (via
// recordAudit below), which isn't surfaced in either Picking Slip
// History or a job's own pick slip list, so it can't "still show"
// the way the PickSlip row itself used to. Function name kept as
// cancelPickSlip (and the route path stays .../cancel) to avoid
// rippling a rename through both UI call sites for what's an internal
// behavior change, not a new capability.
export async function cancelPickSlip(ctx: RequestContext, pickSlipId: string, input: z.infer<typeof pickSlipCancelInput>) {
  requireInventory(ctx, "INVENTORY_ISSUE");

  const pickSlip = await prisma.pickSlip.findFirst({
    where: { id: pickSlipId, companyId: ctx.companyId },
    include: { lines: true, job: { select: { id: true, jobNumber: true, draftNumber: true } } },
  });
  if (!pickSlip) notFound();

  const result = await prisma.$transaction(async (tx) => {
    let revertedLines = 0;
    let skippedLines = 0;

    for (const line of pickSlip.lines) {
      // 2026-10-05 — job pick slips made from this date on never take stock
      // off the shelf: their lines point at a part line (jobPartLineId) but
      // carry no stockMovementId, so cancelling one has nothing to put back.
      // Everything else did issue stock when it was made — a job slip from
      // before this date (both ids set), a Stock Levels slip, or one from
      // before either id existed — and is reversed here as always.
      const tookStockAtPickTime = !(line.jobPartLineId && !line.stockMovementId);
      if (tookStockAtPickTime) {
        // binLocationId only goes null if that StorageLocation was later
        // deleted (onDelete: SetNull) — nowhere left to put the stock back,
        // so this line's physical reversal can't happen; still cancels the
        // slip overall rather than blocking on one unrestorable line.
        if (!line.binLocationId) continue;

        const balance = await lockBalance(tx, ctx.companyId, line.partId, line.binLocationId, { createIfMissing: true });
        if (!balance) continue;
        const nextOnHand = balance.onHand.plus(line.quantity);
        await tx.stockMovement.create({
          data: buildMovement({
            companyId: ctx.companyId,
            partId: line.partId,
            movementType: "UNPICK",
            quantity: line.quantity,
            toLocationId: line.binLocationId,
            referenceType: "JOB",
            referenceId: pickSlip.jobId,
            referenceNumber: pickSlip.job.jobNumber ?? pickSlip.job.draftNumber,
            reason: input.reason ? `Pick slip cancelled: ${input.reason}` : "Pick slip cancelled",
            actorId: ctx.userId,
            resultingToQuantity: nextOnHand,
            reversalOfId: line.stockMovementId,
            correlationId: ctx.correlationId,
          }),
        });
        await saveBalance(tx, balance, { onHand: nextOnHand });
      }

      if (line.jobPartLineId) {
        const jobPartLine = await tx.jobPartLine.findFirst({ where: { id: line.jobPartLineId, companyId: ctx.companyId } });
        if (jobPartLine && tookStockAtPickTime && jobPartLine.stockIssuedQuantity) {
          const nextIssued = D.max(jobPartLine.stockIssuedQuantity.minus(line.quantity), new D(0));
          await tx.jobPartLine.update({ where: { id: jobPartLine.id }, data: { stockIssuedQuantity: nextIssued.gt(0) ? nextIssued : null } });
        }
        if (jobPartLine && jobPartLine.status === "PICKED") {
          const newPickedQuantity = D.max((jobPartLine.pickedQuantity ?? new D(0)).minus(line.quantity), new D(0));
          if (newPickedQuantity.lte(0)) {
            await tx.jobPartLine.update({
              where: { id: jobPartLine.id },
              data: { status: (line.previousStatus ?? "PENDING") as never, pickedQuantity: null, updatedById: ctx.userId },
            });
          } else {
            await tx.jobPartLine.update({
              where: { id: jobPartLine.id },
              data: { pickedQuantity: newPickedQuantity, updatedById: ctx.userId },
            });
          }
          revertedLines += 1;
        } else if (jobPartLine) {
          if (!tookStockAtPickTime) {
            // A listing-only slip line on a line that has moved on (e.g.
            // already received): nothing was issued, so just take its units
            // off the "on a pick slip" count and leave the status alone.
            const nextPicked = D.max((jobPartLine.pickedQuantity ?? new D(0)).minus(line.quantity), new D(0));
            await tx.jobPartLine.update({ where: { id: jobPartLine.id }, data: { pickedQuantity: nextPicked.gt(0) ? nextPicked : null } });
          } else {
            skippedLines += 1;
          }
        }
      }
    }

    // Cascades to delete this slip's own PickSlipLine rows (FK's own ON
    // DELETE CASCADE) — nothing else references PickSlip, so nothing
    // else is affected. The StockMovement rows created above (and the
    // original ISSUE movements each line's stockMovementId pointed at)
    // are untouched — that ledger stays permanent regardless of what
    // happens to the slip that triggered it, same as every other stock
    // movement in the app.
    await tx.pickSlip.delete({ where: { id: pickSlip.id } });

    return { revertedLines, skippedLines };
  }, { maxWait: 10000, timeout: 30000 });

  await recordAudit(ctx, {
    source: "UI",
    module: "INVENTORY",
    entityType: "PickSlip",
    entityId: pickSlip.id,
    action: "PICK_SLIP_DELETED",
    afterData: { jobId: pickSlip.jobId, revertedLines: result.revertedLines, skippedLines: result.skippedLines, reason: input.reason ?? null },
  });

  return { ok: true, revertedLines: result.revertedLines, skippedLines: result.skippedLines };
}

// 2026-09-29 — jobId filter added (see pickSlipQuery's own comment) so
// JobWorkspace can list just one job's picking slips; status/cancelledAt/
// cancelReason added to the returned shape so either caller (this job-
// scoped list, or Stock Levels' company-wide history) can show a
// cancelled slip as cancelled rather than indistinguishable from an
// active one, and hide its own "Cancel"/"Delete" action once it's gone.
export async function listPickSlips(ctx: RequestContext, input: z.infer<typeof pickSlipQuery>) {
  requireInventory(ctx, "INVENTORY_VIEW", "READ");
  const where = { companyId: ctx.companyId, ...(input.jobId ? { jobId: input.jobId } : {}) };
  const [slips, total] = await Promise.all([
    prisma.pickSlip.findMany({
      where,
      include: { job: { include: { customer: true } }, lines: { include: { binLocation: { select: { code: true, name: true } } } } },
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.pickSlip.count({ where }),
  ]);
  const supersededByPart = await supersededNumbersByPart(ctx.companyId!, slips.flatMap((ps) => ps.lines.map((l) => l.partId)));
  return {
    items: slips.map((ps) => ({
      id: ps.id,
      jobId: ps.jobId,
      jobNumber: ps.job.jobNumber ?? ps.job.draftNumber,
      customerName: ps.job.customer?.tradingName || ps.job.customer?.name || null,
      createdAt: ps.createdAt.toISOString(),
      status: String(ps.status),
      cancelledAt: ps.cancelledAt ? ps.cancelledAt.toISOString() : null,
      cancelReason: ps.cancelReason,
      lines: ps.lines.map((l) => ({
        partNumber: l.partNumber,
        supersededNumbers: supersededByPart.get(l.partId) ?? "",
        description: l.description,
        quantity: l.quantity.toString(),
        binLocationLabel: l.binLocation ? formatLocationLabel(l.binLocation.name, l.binLocation.code) : null,
      })),
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}
