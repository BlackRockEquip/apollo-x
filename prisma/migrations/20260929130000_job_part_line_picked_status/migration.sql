-- AlterEnum
ALTER TYPE "PartLineStatus" ADD VALUE 'PICKED' BEFORE 'ON_ORDER';

-- AlterTable
ALTER TABLE "JobPartLine" ADD COLUMN     "pickedQuantity" DECIMAL(19,4);
