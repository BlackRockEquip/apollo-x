-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'TRANSFER', 'ISSUE', 'RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RESERVATION', 'RESERVATION_RELEASE', 'PICK', 'UNPICK', 'REVERSAL', 'RECONCILIATION', 'SCRAP');

-- CreateEnum
CREATE TYPE "StockReferenceType" AS ENUM ('GENERAL', 'RECEIPT', 'TRANSFER', 'ISSUE', 'RETURN', 'ADJUSTMENT', 'RESERVATION', 'RECONCILIATION', 'SUPPLIER_DELIVERY', 'JOB', 'PEX_REPAIR', 'SALES_ORDER');

-- CreateEnum
CREATE TYPE "StockReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONVERTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('OPEN', 'COMPLETED', 'APPROVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantityOnHand" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "quantityReserved" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "lowStockThreshold" DECIMAL(19,4),
    "reorderMaximum" DECIMAL(19,4),
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastMovementAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "movementType" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "referenceType" "StockReferenceType",
    "referenceId" TEXT,
    "referenceNumber" TEXT,
    "unitCost" DECIMAL(19,4),
    "reason" TEXT,
    "notes" TEXT,
    "actorId" TEXT,
    "resultingFromQuantity" DECIMAL(19,4),
    "resultingToQuantity" DECIMAL(19,4),
    "idempotencyKey" TEXT,
    "reversalOfId" TEXT,
    "correlationId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "referenceType" "StockReferenceType",
    "referenceId" TEXT,
    "referenceNumber" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "actorId" TEXT,
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'OPEN',
    "referenceNumber" TEXT,
    "notes" TEXT,
    "countedById" TEXT,
    "approvedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "correlationId" TEXT NOT NULL,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "expectedQuantity" DECIMAL(19,4) NOT NULL,
    "countedQuantity" DECIMAL(19,4) NOT NULL,
    "variance" DECIMAL(19,4) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_companyId_partId_locationId_key" ON "StockBalance"("companyId", "partId", "locationId");
-- CreateIndex
CREATE INDEX "StockBalance_companyId_partId_idx" ON "StockBalance"("companyId", "partId");

-- CreateIndex
CREATE INDEX "StockBalance_companyId_locationId_idx" ON "StockBalance"("companyId", "locationId");

-- CreateIndex
CREATE INDEX "StockBalance_companyId_lastMovementAt_idx" ON "StockBalance"("companyId", "lastMovementAt");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_partId_occurredAt_idx" ON "StockMovement"("companyId", "partId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_occurredAt_idx" ON "StockMovement"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_movementType_occurredAt_idx" ON "StockMovement"("companyId", "movementType", "occurredAt");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_fromLocationId_occurredAt_idx" ON "StockMovement"("companyId", "fromLocationId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_toLocationId_occurredAt_idx" ON "StockMovement"("companyId", "toLocationId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_referenceType_referenceId_idx" ON "StockMovement"("companyId", "referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "StockMovement_correlationId_idx" ON "StockMovement"("correlationId");

-- CreateIndex
CREATE INDEX "StockReservation_companyId_partId_status_idx" ON "StockReservation"("companyId", "partId", "status");

-- CreateIndex
CREATE INDEX "StockReservation_companyId_locationId_status_idx" ON "StockReservation"("companyId", "locationId", "status");

-- CreateIndex
CREATE INDEX "StockReservation_companyId_referenceType_referenceId_idx" ON "StockReservation"("companyId", "referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "StockReservation_companyId_status_expiresAt_idx" ON "StockReservation"("companyId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "StockCount_companyId_locationId_startedAt_idx" ON "StockCount"("companyId", "locationId", "startedAt");

-- CreateIndex
CREATE INDEX "StockCount_companyId_status_idx" ON "StockCount"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_countId_partId_key" ON "StockCountLine"("countId", "partId");

-- CreateIndex
CREATE INDEX "StockCountLine_companyId_partId_idx" ON "StockCountLine"("companyId", "partId");

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- PHASE 3 INTENTIONAL MIGRATION-ONLY SAFEGUARDS
-- These constraints are deliberately NOT represented in the
-- Prisma schema datamodel (same pattern as Phase 2/2.1).
-- `prisma migrate dev` may report drift for them; they MUST be
-- preserved. Deployment uses `prisma migrate deploy` only.
-- ============================================================

-- Supporting unique indexes for composite tenant foreign keys below
-- (StorageLocation_id_companyId_key already exists from Phase 2.1)
-- CreateIndex
CREATE UNIQUE INDEX "Part_id_companyId_key" ON "Part"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_id_companyId_key" ON "StockCount"("id", "companyId");

-- Non-negative stock checks
-- CreateIndex
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_non_negative_on_hand_chk" CHECK ("quantityOnHand" >= 0);

-- CreateIndex
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_non_negative_reserved_chk" CHECK ("quantityReserved" >= 0);

-- CreateIndex
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_reserved_not_gt_on_hand_chk" CHECK ("quantityReserved" <= "quantityOnHand");

-- CreateIndex
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_nonzero_qty_chk" CHECK ("quantity" <> 0);

-- CreateIndex
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_positive_qty_chk" CHECK ("quantity" > 0);

-- CreateIndex
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_variance_chk" CHECK ("variance" = "countedQuantity" - "expectedQuantity");

-- Ledger direction integrity:
-- outbound types (ISSUE/ADJUSTMENT_OUT/SCRAP/RESERVATION/PICK) must have a
-- from-location and no to-location; every other type must have a to-location
-- and no from-location; TRANSFER (both) is intentionally permitted.
-- CreateIndex
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_direction_chk" CHECK (
    ("movementType" IN ('ISSUE', 'ADJUSTMENT_OUT', 'SCRAP', 'RESERVATION', 'PICK') AND "fromLocationId" IS NOT NULL AND "toLocationId" IS NULL)
    OR
    ("movementType" IN ('TRANSFER') AND "fromLocationId" IS NOT NULL AND "toLocationId" IS NOT NULL)
    OR
    ("movementType" = 'RECONCILIATION' AND (("fromLocationId" IS NOT NULL AND "toLocationId" IS NULL) OR ("toLocationId" IS NOT NULL AND "fromLocationId" IS NULL)))
    OR
    ("movementType" NOT IN ('ISSUE', 'ADJUSTMENT_OUT', 'SCRAP', 'RESERVATION', 'PICK', 'TRANSFER') AND "fromLocationId" IS NULL AND "toLocationId" IS NOT NULL)
);

-- Idempotency: one ledger row per company + idempotency key
-- (matches schema @@unique([companyId, idempotencyKey]); PostgreSQL treats
-- NULLs as distinct, so rows without a key are never blocked)
-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_companyId_idempotencyKey_key" ON "StockMovement"("companyId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_companyId_idempotencyKey_key" ON "StockReservation"("companyId", "idempotencyKey");

-- One active reservation per reference (released/converted rows free the key)
-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_active_reference_key" ON "StockReservation"("companyId", "referenceType", "referenceId") WHERE "status" = 'ACTIVE';

-- ============================================================
-- COMPOSITE TENANT FOREIGN KEYS (DB-enforced tenant isolation)
-- A child row can never point at another tenant's part/location
-- or count, even if application code is bypassed.
-- ============================================================
-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_part_tenant_fkey" FOREIGN KEY ("partId", "companyId") REFERENCES "Part"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_location_tenant_fkey" FOREIGN KEY ("locationId", "companyId") REFERENCES "StorageLocation"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_part_tenant_fkey" FOREIGN KEY ("partId", "companyId") REFERENCES "Part"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_from_location_tenant_fkey" FOREIGN KEY ("fromLocationId", "companyId") REFERENCES "StorageLocation"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_to_location_tenant_fkey" FOREIGN KEY ("toLocationId", "companyId") REFERENCES "StorageLocation"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_part_tenant_fkey" FOREIGN KEY ("partId", "companyId") REFERENCES "Part"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_location_tenant_fkey" FOREIGN KEY ("locationId", "companyId") REFERENCES "StorageLocation"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_location_tenant_fkey" FOREIGN KEY ("locationId", "companyId") REFERENCES "StorageLocation"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_part_tenant_fkey" FOREIGN KEY ("partId", "companyId") REFERENCES "Part"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_count_tenant_fkey" FOREIGN KEY ("countId", "companyId") REFERENCES "StockCount"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- STOCK LEDGER IMMUTABILITY
-- Ledger rows cannot be deleted; identity/quantity/direction
-- fields cannot be altered. Notes/reason/reference metadata may
-- still be corrected without touching stock history.
-- ============================================================
CREATE OR REPLACE FUNCTION "apollo_stock_movement_guard"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD."companyId" <> NEW."companyId"
            OR OLD."partId" <> NEW."partId"
            OR OLD."movementType" <> NEW."movementType"
            OR OLD."quantity" <> NEW."quantity"
            OR OLD."fromLocationId" IS DISTINCT FROM NEW."fromLocationId"
            OR OLD."toLocationId" IS DISTINCT FROM NEW."toLocationId"
            OR OLD."occurredAt" <> NEW."occurredAt" THEN
            RAISE EXCEPTION 'StockMovement ledger rows are immutable (use reversal movements)';
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'StockMovement ledger rows cannot be deleted (use reversal movements)';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockMovement_immutability_guard"
BEFORE UPDATE OR DELETE ON "StockMovement"
FOR EACH ROW EXECUTE FUNCTION "apollo_stock_movement_guard"();
