-- User request: "in a job, when creating a picking slip, need a way to
-- cancel picking slip if a error was made." Adds a status to PickSlip
-- (defaulting existing rows to ACTIVE) plus the audit fields for who
-- cancelled one and why, and three new columns on PickSlipLine so
-- cancelPickSlip (inventory/service.ts) can precisely reverse each line:
-- which JobPartLine to roll pickedQuantity back on, what status that line
-- was in right before this specific pick, and which StockMovement the
-- reversing UNPICK movement is undoing. All new PickSlipLine columns are
-- nullable so pre-existing rows (picked before this migration) simply
-- have no back-reference and are skipped -- stock-only -- on cancel.

-- CreateEnum
CREATE TYPE "PickSlipStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "PickSlip" ADD COLUMN     "status" "PickSlipStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "cancelReason" TEXT;

-- AlterTable
ALTER TABLE "PickSlipLine" ADD COLUMN     "jobPartLineId" TEXT,
ADD COLUMN     "previousStatus" "PartLineStatus",
ADD COLUMN     "stockMovementId" TEXT;

-- CreateIndex
CREATE INDEX "PickSlipLine_jobPartLineId_idx" ON "PickSlipLine"("jobPartLineId");

-- AddForeignKey
ALTER TABLE "PickSlip" ADD CONSTRAINT "PickSlip_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickSlipLine" ADD CONSTRAINT "PickSlipLine_jobPartLineId_fkey" FOREIGN KEY ("jobPartLineId") REFERENCES "JobPartLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickSlipLine" ADD CONSTRAINT "PickSlipLine_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
