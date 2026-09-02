-- AlterEnum
ALTER TYPE "JobActivityType" ADD VALUE 'KIT_APPLIED';

-- CreateTable
CREATE TABLE "JobKit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "description" TEXT,
    "machineMake" TEXT,
    "machineModel" TEXT,
    "componentType" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobKitLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobKitId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantityDefault" DECIMAL(19,4) NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobKitLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobKit_companyId_active_idx" ON "JobKit"("companyId", "active");

-- CreateIndex
CREATE INDEX "JobKit_companyId_machineMake_idx" ON "JobKit"("companyId", "machineMake");

-- CreateIndex
CREATE INDEX "JobKit_companyId_machineModel_idx" ON "JobKit"("companyId", "machineModel");

-- CreateIndex
CREATE INDEX "JobKit_companyId_componentType_idx" ON "JobKit"("companyId", "componentType");

-- CreateIndex
CREATE UNIQUE INDEX "JobKit_companyId_nameNormalized_key" ON "JobKit"("companyId", "nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "JobKit_id_companyId_key" ON "JobKit"("id", "companyId");

-- CreateIndex
CREATE INDEX "JobKitLine_companyId_jobKitId_idx" ON "JobKitLine"("companyId", "jobKitId");

-- CreateIndex
CREATE INDEX "JobKitLine_companyId_partId_idx" ON "JobKitLine"("companyId", "partId");

-- CreateIndex
CREATE UNIQUE INDEX "JobKitLine_jobKitId_partId_key" ON "JobKitLine"("jobKitId", "partId");

-- CreateIndex
CREATE UNIQUE INDEX "JobKitLine_id_companyId_key" ON "JobKitLine"("id", "companyId");

-- AddForeignKey
ALTER TABLE "JobKit" ADD CONSTRAINT "JobKit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobKit" ADD CONSTRAINT "JobKit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobKitLine" ADD CONSTRAINT "JobKitLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobKitLine" ADD CONSTRAINT "JobKitLine_jobKit_tenant_fkey" FOREIGN KEY ("jobKitId", "companyId") REFERENCES "JobKit"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobKitLine" ADD CONSTRAINT "JobKitLine_part_tenant_fkey" FOREIGN KEY ("partId", "companyId") REFERENCES "Part"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
