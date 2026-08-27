-- AlterEnum
ALTER TYPE "AddressType" ADD VALUE 'POSTAL';

-- AlterTable
ALTER TABLE "CustomerAddress" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" TEXT;

-- AlterTable
ALTER TABLE "CustomerBranch" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" TEXT,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "CustomerContact" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" TEXT,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "SupplierAddress" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" TEXT;

-- AlterTable
ALTER TABLE "SupplierContact" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" TEXT,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "SupplierManufacturer" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" TEXT;

-- Lifecycle actor provenance and tenant-safe branch/address relationships.
ALTER TABLE "CustomerBranch" ADD CONSTRAINT "CustomerBranch_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL;
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL;
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL;
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL;
ALTER TABLE "SupplierAddress" ADD CONSTRAINT "SupplierAddress_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL;
ALTER TABLE "SupplierManufacturer" ADD CONSTRAINT "SupplierManufacturer_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL;
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_branch_tenant_fkey" FOREIGN KEY ("branchId", "companyId") REFERENCES "CustomerBranch"("id", "companyId") ON DELETE RESTRICT;
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_branch_tenant_fkey" FOREIGN KEY ("branchId", "companyId") REFERENCES "CustomerBranch"("id", "companyId") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "CustomerAddress_one_primary_per_type" ON "CustomerAddress"("companyId", "customerId", "type") WHERE "isPrimary" = true AND active = true;
CREATE UNIQUE INDEX "SupplierAddress_one_primary_per_type" ON "SupplierAddress"("companyId", "supplierId", "type") WHERE "isPrimary" = true AND active = true;
