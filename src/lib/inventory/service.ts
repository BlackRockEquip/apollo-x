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
  bulkPartSearchInput,
} from "@/lib/inventory/validation";
import { deriveStockState } from "@/lib/inventory/stock-state";

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
  if (input.q) {
    // 2026-09-14 — extended to search across Bin location (code and name)
    // and Manufacturer name too, per explicit request ("Search function
    // across Part number, Description, Bin, manufacturer") — previously
    // only partNumber/description/manufacturerPartNumber were searched,
    // which meant typing a bin code or a manufacturer's actual name (as
    // opposed to their part number) found nothing.
    where.OR = [
      { partNumber: { contains: input.q, mode: "insensitive" } },
      { partNumberNormalized: { contains: input.q, mode: "insensitive" } },
      { description: { contains: input.q, mode: "insensitive" } },
      { manufacturerPartNumber: { contains: input.q, mode: "insensitive" } },
      { manufacturer: { name: { contains: input.q, mode: "insensitive" } } },
      { binLocation: { code: { contains: input.q, mode: "insensitive" } } },
      { binLocation: { name: { contains: input.q, mode: "insensitive" } } },
    ];
  }
  if (input.locationId) {
    where.stockBalances = { some: { locationId: input.locationId } };
  }
  if (input.manufacturerId) where.manufacturerId = input.manufacturerId;
  if (input.category) where.category = input.category;

  const stockBalanceWhere = input.locationId ? { locationId: input.locationId } : undefined;

  const [parts, total] = await Promise.all([
    prisma.part.findMany({
      where,
      include: {
        manufacturer: { select: { name: true } },
        taxCode: { select: { code: true } },
        binLocation: { select: { id: true, code: true, name: true } },
        // location select added 2026-09-16 — see binLocationLabel's own
        // comment below for why.
        stockBalances: { where: stockBalanceWhere, include: { location: { select: { code: true, name: true } } }, orderBy: { location: { code: "asc" } } },
      },
      orderBy: { partNumber: "asc" },
    }),
    prisma.part.count({ where }),
  ]);

  // Stock-state filtering is derived per part before pagination so totals and
  // page contents stay consistent with the user's selected state.
  let selected = parts;
  if (input.stockState !== "ALL") {
    selected = parts.filter((p) => {
      const totals = sumBalances(p.stockBalances);
      return deriveStockState({ onHand: totals.onHand, reserved: totals.reserved, threshold: p.reorderMinimum, partActive: p.active }) === input.stockState;
    });
  }

  const paged = selected.slice((page - 1) * pageSize, page * pageSize);

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
    total: input.stockState === "ALL" ? total : selected.length,
    page,
    pageSize,
  };
}

// Shared by listInventoryPositions and getInventoryDetail — see the
// binLocationLabel comment on each for why this exists. Only balances with
// stock on hand are listed (a zero-quantity StockBalance row, e.g. after a
// full transfer out, isn't a location the part is meaningfully "in"
// anymore); a part with no stock anywhere yet falls back to its single
// assigned default bin, same as before this change.
function buildBinLocationLabel(balances: { quantityOnHand: Prisma.Decimal; location: { code: string; name: string } }[], defaultBin: { code: string; name: string } | null) {
  const withStock = balances.filter((b) => b.quantityOnHand.greaterThan(0));
  if (withStock.length > 0) return withStock.map((b) => `${b.location.name} (${b.location.code})`).join(", ");
  return defaultBin ? `${defaultBin.name} (${defaultBin.code})` : null;
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
// ============================================================

export async function searchPartsByNumbers(ctx: RequestContext, input: z.infer<typeof bulkPartSearchInput>) {
  requireInventory(ctx, "INVENTORY_VIEW", "READ");

  // Preserves first-seen order while de-duplicating (same input part number
  // pasted twice only needs one lookup / one result row).
  const requested = Array.from(new Set(input.partNumbers.map((p) => p.trim()).filter(Boolean)));

  const parts = requested.length
    ? await prisma.part.findMany({
        where: {
          companyId: ctx.companyId,
          operationalStatus: "OPERATIONAL",
          OR: requested.map((partNumber) => ({ partNumber: { equals: partNumber, mode: "insensitive" as const } })),
        },
        include: { binLocation: { select: { code: true, name: true } }, stockBalances: true },
      })
    : [];
  const byPartNumber = new Map(parts.map((p) => [p.partNumber.toLowerCase(), p]));

  return {
    rows: requested.map((partNumber) => {
      const part = byPartNumber.get(partNumber.toLowerCase()) ?? null;
      if (!part) {
        return { partNumber, found: false, partId: null, description: null, binLocationLabel: null, quantityAvailable: "0" };
      }
      const totals = sumBalances(part.stockBalances);
      return {
        partNumber: part.partNumber,
        found: true,
        partId: part.id,
        description: part.description,
        binLocationLabel: part.binLocation ? `${part.binLocation.name} (${part.binLocation.code})` : null,
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
          binLocationLabel: `${location.name} (${location.code})`,
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
            lines: result.picked.map((l) => ({ partNumber: l.partNumber, description: l.description, quantity: l.quantity.toString(), binLocationLabel: l.binLocationLabel })),
          },
    pickedCount: result.picked.length,
    backorderCount: result.backorderCount,
  };
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

export async function createPickSlipForJob(ctx: RequestContext, jobId: string) {
  requireInventory(ctx, "INVENTORY_ISSUE");

  const job = await prisma.job.findFirst({ where: { id: jobId, companyId: ctx.companyId }, include: { customer: true } });
  if (!job) notFound();

  const eligibleLines = await prisma.jobPartLine.findMany({
    where: {
      companyId: ctx.companyId,
      jobId: job.id,
      partId: { not: null },
      status: { in: ["PENDING", "ON_ORDER", "PARTIALLY_RECEIVED"] as never },
    },
  });

  type PickedLine = { partId: string; partNumber: string; description: string; binLocationId: string; binLocationLabel: string; quantity: Quantity };

  const result = await prisma.$transaction(async (tx) => {
    const picked: PickedLine[] = [];

    for (const line of eligibleLines) {
      if (!line.partId) continue;
      const part = await requirePart(tx, ctx, line.partId);
      const location = part.binLocationId ? await tx.storageLocation.findFirst({ where: { id: part.binLocationId, companyId: ctx.companyId } }) : null;
      if (!location) continue;

      const alreadyReceived = line.receivedQuantity ?? new D(0);
      const outstanding = D.max(line.quantity.minus(alreadyReceived), new D(0));
      if (outstanding.lte(0)) continue;

      assertOperable(part, location);

      // 2026-09-16 — user request: adding a part to a job now reserves the
      // stock (see addPartLinesBulk) so another job can't take it. Consume
      // that reservation here instead of treating it as ordinary
      // unavailable stock — otherwise a line's own reservation would make
      // the line look unpickable against itself.
      const reservation = await tx.stockReservation.findFirst({
        where: { companyId: ctx.companyId, referenceType: "JOB", referenceId: line.id, status: "ACTIVE", partId: part.id, locationId: location.id },
      });

      let pickQty: Quantity;
      let nextOnHand: Quantity;

      if (reservation) {
        const locked = await lockReservation(tx, ctx.companyId, reservation.id);
        const balance = await lockBalance(tx, ctx.companyId, part.id, location.id);
        if (!locked || locked.status !== "ACTIVE" || !balance) continue;
        const usage = await getReservationRemaining(tx, locked);
        pickQty = D.min(outstanding, D.min(usage.remaining, D.min(balance.onHand, balance.reserved)));
        if (pickQty.lte(0)) continue;
        nextOnHand = balance.onHand.minus(pickQty);
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
            referenceNumber: job.jobNumber ?? job.draftNumber,
            reason: "Pick slip",
            actorId: ctx.userId,
            resultingFromQuantity: nextOnHand,
            correlationId: ctx.correlationId,
          }),
        });
        await saveBalance(tx, balance, { onHand: nextOnHand, reserved: nextReserved });
        if (usage.remaining.eq(pickQty)) {
          await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: "CONVERTED" } });
        }
      } else {
        const balance = await lockBalance(tx, ctx.companyId, part.id, location.id);
        const available = balance ? balance.onHand.minus(balance.reserved) : new D(0);
        if (available.lte(0) || !balance) continue;
        pickQty = D.min(outstanding, available);
        nextOnHand = balance.onHand.minus(pickQty);

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
      }

      const newReceivedQuantity = alreadyReceived.plus(pickQty);
      const nowFullyReceived = newReceivedQuantity.gte(line.quantity);
      await tx.jobPartLine.update({
        where: { id: line.id },
        data: {
          status: nowFullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED",
          receivedQuantity: newReceivedQuantity,
          previousStatus: line.previousStatus ?? line.status,
          updatedById: ctx.userId,
        },
      });

      picked.push({
        partId: part.id,
        partNumber: part.partNumber,
        description: part.description,
        binLocationId: location.id,
        binLocationLabel: `${location.name} (${location.code})`,
        quantity: pickQty,
      });
    }

    if (picked.length === 0) return { pickSlipId: null as string | null, picked };

    const pickSlip = await tx.pickSlip.create({ data: { companyId: ctx.companyId, jobId: job.id, createdById: ctx.userId } });
    await tx.pickSlipLine.createMany({
      data: picked.map((l) => ({ pickSlipId: pickSlip.id, partId: l.partId, partNumber: l.partNumber, description: l.description, binLocationId: l.binLocationId, quantity: l.quantity })),
    });
    return { pickSlipId: pickSlip.id as string | null, picked };
  });

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
            lines: result.picked.map((l) => ({ partNumber: l.partNumber, description: l.description, quantity: l.quantity.toString(), binLocationLabel: l.binLocationLabel })),
          },
    pickedCount: result.picked.length,
    outstandingCount,
  };
}

export async function listPickSlips(ctx: RequestContext, input: z.infer<typeof pickSlipQuery>) {
  requireInventory(ctx, "INVENTORY_VIEW", "READ");
  const [slips, total] = await Promise.all([
    prisma.pickSlip.findMany({
      where: { companyId: ctx.companyId },
      include: { job: { include: { customer: true } }, lines: { include: { binLocation: { select: { code: true, name: true } } } } },
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.pickSlip.count({ where: { companyId: ctx.companyId } }),
  ]);
  return {
    items: slips.map((ps) => ({
      id: ps.id,
      jobId: ps.jobId,
      jobNumber: ps.job.jobNumber ?? ps.job.draftNumber,
      customerName: ps.job.customer?.tradingName || ps.job.customer?.name || null,
      createdAt: ps.createdAt.toISOString(),
      lines: ps.lines.map((l) => ({
        partNumber: l.partNumber,
        description: l.description,
        quantity: l.quantity.toString(),
        binLocationLabel: l.binLocation ? `${l.binLocation.name} (${l.binLocation.code})` : null,
      })),
    })),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}
