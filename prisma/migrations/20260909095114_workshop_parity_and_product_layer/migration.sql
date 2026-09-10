/*
  Warnings:

  - You are about to drop the column `operationalStatus` on the `StorageLocation` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[companyId,product,module]` on the table `CompanyModuleEntitlement` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "Product" AS ENUM ('WORKSHOP', 'SPORTS_LEAGUE');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('TBA', 'AWAIT_PAYMENT', 'PARTIALLY_PAID', 'PAID', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('INTERNAL_BAKKIE', 'INTERNAL_TRUCK', 'INTERNAL_COURIER', 'EXTERNAL_BAKKIE', 'EXTERNAL_TRUCK', 'EXTERNAL_COURIER');

-- AlterEnum
ALTER TYPE "JobActivityType" ADD VALUE 'JOB_RETURNED_UNREPAIRED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobStatus" ADD VALUE 'TO_STRIP';
ALTER TYPE "JobStatus" ADD VALUE 'AWAIT_OUTWORK';
ALTER TYPE "JobStatus" ADD VALUE 'TO_PAINT_WRAP';
ALTER TYPE "JobStatus" ADD VALUE 'DELIVERED_AWAITING_PAYMENT';
ALTER TYPE "JobStatus" ADD VALUE 'RETURNED_UNREPAIRED';
ALTER TYPE "JobStatus" ADD VALUE 'TO_ATTEND';
ALTER TYPE "JobStatus" ADD VALUE 'ON_ROUTE';
ALTER TYPE "JobStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "JobStatus" ADD VALUE 'AWAIT_PAYMENT';
ALTER TYPE "JobStatus" ADD VALUE 'RECEIVED';
ALTER TYPE "JobStatus" ADD VALUE 'INSPECTING';

-- DropIndex
DROP INDEX "CompanyModuleEntitlement_companyId_module_key";

-- DropIndex
DROP INDEX "CompanyModuleEntitlement_companyId_status_idx";

-- DropIndex
DROP INDEX "EntitlementHistory_companyId_module_createdAt_idx";

-- AlterTable
ALTER TABLE "CompanyModuleEntitlement" ADD COLUMN     "product" "Product" NOT NULL DEFAULT 'WORKSHOP';

-- AlterTable
ALTER TABLE "EntitlementHistory" ADD COLUMN     "product" "Product" NOT NULL DEFAULT 'WORKSHOP';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "deliveryDate" TIMESTAMP(3),
ADD COLUMN     "deliveryType" "DeliveryType",
ADD COLUMN     "importTrackingNumber" TEXT,
ADD COLUMN     "invoiceDate" TIMESTAMP(3),
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "kmsTravelled" INTEGER,
ADD COLUMN     "machineHours" DECIMAL(19,4),
ADD COLUMN     "mechanicEtaDate" TIMESTAMP(3),
ADD COLUMN     "paymentDateReceived" TIMESTAMP(3),
ADD COLUMN     "paymentNotApplicable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "plantNumber" TEXT,
ADD COLUMN     "previousJobNumber" TEXT,
ADD COLUMN     "purchaseOrderDate" TIMESTAMP(3),
ADD COLUMN     "purchaseOrderNumber" TEXT,
ADD COLUMN     "purchaseOrderStatus" "PurchaseOrderStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
ADD COLUMN     "quoteDate" TIMESTAMP(3),
ADD COLUMN     "quoteNumber" TEXT,
ADD COLUMN     "receivingTransport" "DeliveryType",
ADD COLUMN     "reportNumber" TEXT,
ADD COLUMN     "salesOrderNumber" TEXT,
ADD COLUMN     "salesRepresentative" TEXT;

-- AlterTable
ALTER TABLE "JobKitLine" ADD COLUMN     "operationalStatus" "StorageOperationalStatus" NOT NULL DEFAULT 'OPERATIONAL';

-- AlterTable
ALTER TABLE "StorageLocation" DROP COLUMN "operationalStatus";

-- CreateTable
CREATE TABLE "CompanyProduct" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "product" "Product" NOT NULL,
    "status" "EntitlementStatus" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTypePreset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "behavesAs" "JobType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobTypePreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyProduct_companyId_status_idx" ON "CompanyProduct"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProduct_companyId_product_key" ON "CompanyProduct"("companyId", "product");

-- CreateIndex
CREATE INDEX "JobTypePreset_companyId_active_idx" ON "JobTypePreset"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "JobTypePreset_companyId_key_key" ON "JobTypePreset"("companyId", "key");

-- CreateIndex
CREATE INDEX "CompanyModuleEntitlement_companyId_product_status_idx" ON "CompanyModuleEntitlement"("companyId", "product", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyModuleEntitlement_companyId_product_module_key" ON "CompanyModuleEntitlement"("companyId", "product", "module");

-- CreateIndex
CREATE INDEX "EntitlementHistory_companyId_product_module_createdAt_idx" ON "EntitlementHistory"("companyId", "product", "module", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanyProduct" ADD CONSTRAINT "CompanyProduct_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTypePreset" ADD CONSTRAINT "JobTypePreset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
