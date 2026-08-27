-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('BILLING', 'DELIVERY', 'PHYSICAL');

-- CreateEnum
CREATE TYPE "TaxCodeType" AS ENUM ('STANDARD', 'ZERO_RATED', 'EXEMPT', 'NON_TAXABLE');

-- CreateEnum
CREATE TYPE "CommercialTermType" AS ENUM ('PAYMENT', 'QUOTE_VALIDITY', 'DELIVERY', 'STANDARD_TEXT');

-- CreateEnum
CREATE TYPE "StorageLocationType" AS ENUM ('STORES', 'SHELF', 'BIN', 'WORKSHOP', 'PEX_HOLDING', 'QUARANTINE', 'RECEIVING', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentSequenceType" AS ENUM ('JOB', 'PEX_JOB', 'QUOTE', 'SALES_ORDER', 'INVOICE', 'PAYMENT_RECEIPT', 'PROCUREMENT_RFQ');

-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "defaultPaymentTermId" TEXT,
ADD COLUMN     "defaultTaxCodeId" TEXT,
ADD COLUMN     "documentFooterText" TEXT,
ADD COLUMN     "documentHeaderText" TEXT,
ADD COLUMN     "mainEmail" TEXT,
ADD COLUMN     "mainTelephone" TEXT,
ADD COLUMN     "quoteValidityDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "vatNumber" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "CompanyAddress" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "AddressType" NOT NULL,
    "label" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'ZA',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "tradingName" TEXT,
    "accountCode" TEXT,
    "accountCodeNormalized" TEXT,
    "registrationNumber" TEXT,
    "vatNumber" TEXT,
    "mainTelephone" TEXT,
    "mainEmail" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "paymentTermId" TEXT,
    "defaultTaxCodeId" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'ZAR',
    "creditLimit" DECIMAL(19,4),
    "accountOnHold" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerBranch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "mainTelephone" TEXT,
    "mainEmail" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "position" TEXT,
    "telephone" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT,
    "type" "AddressType" NOT NULL,
    "label" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'ZA',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "accountCode" TEXT,
    "accountCodeNormalized" TEXT,
    "registrationNumber" TEXT,
    "vatNumber" TEXT,
    "mainTelephone" TEXT,
    "mainEmail" TEXT,
    "website" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "paymentTermId" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'ZAR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "position" TEXT,
    "telephone" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierAddress" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "type" "AddressType" NOT NULL,
    "label" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'ZA',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manufacturer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "code" TEXT,
    "codeNormalized" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Manufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierManufacturer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierManufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "partNumberNormalized" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "manufacturerId" TEXT,
    "manufacturerPartNumber" TEXT,
    "category" TEXT,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'EA',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "defaultPurchaseCost" DECIMAL(19,4),
    "defaultSellingPrice" DECIMAL(19,4),
    "taxCodeId" TEXT,
    "reorderMinimum" DECIMAL(19,4),
    "reorderMaximum" DECIMAL(19,4),
    "reorderQuantity" DECIMAL(19,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageLocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeNormalized" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StorageLocationType" NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeNormalized" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'HOUR',
    "defaultCost" DECIMAL(19,4),
    "defaultSellingPrice" DECIMAL(19,4),
    "taxCodeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCode" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeNormalized" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rate" DECIMAL(9,6) NOT NULL,
    "type" "TaxCodeType" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialTerm" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CommercialTermType" NOT NULL,
    "code" TEXT NOT NULL,
    "codeNormalized" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "days" INTEGER,
    "termsText" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentNumberSequence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "DocumentSequenceType" NOT NULL,
    "prefix" TEXT NOT NULL,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "nextValue" BIGINT NOT NULL DEFAULT 1,
    "includeFinancialYear" BOOLEAN NOT NULL DEFAULT false,
    "financialYearStartMonth" INTEGER NOT NULL DEFAULT 3,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentNumberSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyAddress_companyId_type_idx" ON "CompanyAddress"("companyId", "type");

-- CreateIndex
CREATE INDEX "Customer_companyId_nameNormalized_idx" ON "Customer"("companyId", "nameNormalized");

-- CreateIndex
CREATE INDEX "Customer_companyId_active_idx" ON "Customer"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_accountCodeNormalized_key" ON "Customer"("companyId", "accountCodeNormalized");

-- CreateIndex
CREATE INDEX "CustomerBranch_companyId_customerId_idx" ON "CustomerBranch"("companyId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerBranch_companyId_customerId_code_key" ON "CustomerBranch"("companyId", "customerId", "code");

-- CreateIndex
CREATE INDEX "CustomerContact_companyId_customerId_idx" ON "CustomerContact"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "CustomerContact_companyId_email_idx" ON "CustomerContact"("companyId", "email");

-- CreateIndex
CREATE INDEX "CustomerAddress_companyId_customerId_type_idx" ON "CustomerAddress"("companyId", "customerId", "type");

-- CreateIndex
CREATE INDEX "Supplier_companyId_nameNormalized_idx" ON "Supplier"("companyId", "nameNormalized");

-- CreateIndex
CREATE INDEX "Supplier_companyId_active_idx" ON "Supplier"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_companyId_accountCodeNormalized_key" ON "Supplier"("companyId", "accountCodeNormalized");

-- CreateIndex
CREATE INDEX "SupplierContact_companyId_supplierId_idx" ON "SupplierContact"("companyId", "supplierId");

-- CreateIndex
CREATE INDEX "SupplierAddress_companyId_supplierId_type_idx" ON "SupplierAddress"("companyId", "supplierId", "type");

-- CreateIndex
CREATE INDEX "Manufacturer_companyId_active_idx" ON "Manufacturer"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_companyId_nameNormalized_key" ON "Manufacturer"("companyId", "nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_companyId_codeNormalized_key" ON "Manufacturer"("companyId", "codeNormalized");

-- CreateIndex
CREATE INDEX "SupplierManufacturer_companyId_manufacturerId_idx" ON "SupplierManufacturer"("companyId", "manufacturerId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierManufacturer_companyId_supplierId_manufacturerId_key" ON "SupplierManufacturer"("companyId", "supplierId", "manufacturerId");

-- CreateIndex
CREATE INDEX "Part_companyId_description_idx" ON "Part"("companyId", "description");

-- CreateIndex
CREATE INDEX "Part_companyId_active_idx" ON "Part"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Part_companyId_partNumberNormalized_key" ON "Part"("companyId", "partNumberNormalized");

-- CreateIndex
CREATE INDEX "StorageLocation_companyId_parentId_sortOrder_idx" ON "StorageLocation"("companyId", "parentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StorageLocation_companyId_codeNormalized_key" ON "StorageLocation"("companyId", "codeNormalized");

-- CreateIndex
CREATE INDEX "ServiceItem_companyId_active_idx" ON "ServiceItem"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceItem_companyId_codeNormalized_key" ON "ServiceItem"("companyId", "codeNormalized");

-- CreateIndex
CREATE INDEX "TaxCode_companyId_active_effectiveFrom_idx" ON "TaxCode"("companyId", "active", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCode_companyId_codeNormalized_effectiveFrom_key" ON "TaxCode"("companyId", "codeNormalized", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CommercialTerm_companyId_type_active_idx" ON "CommercialTerm"("companyId", "type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialTerm_companyId_type_codeNormalized_key" ON "CommercialTerm"("companyId", "type", "codeNormalized");

-- CreateIndex
CREATE INDEX "DocumentNumberSequence_companyId_active_idx" ON "DocumentNumberSequence"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentNumberSequence_companyId_type_key" ON "DocumentNumberSequence"("companyId", "type");

-- AddForeignKey
ALTER TABLE "CompanySettings" ADD CONSTRAINT "CompanySettings_defaultTaxCodeId_fkey" FOREIGN KEY ("defaultTaxCodeId") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySettings" ADD CONSTRAINT "CompanySettings_defaultPaymentTermId_fkey" FOREIGN KEY ("defaultPaymentTermId") REFERENCES "CommercialTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAddress" ADD CONSTRAINT "CompanyAddress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "CommercialTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_defaultTaxCodeId_fkey" FOREIGN KEY ("defaultTaxCodeId") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBranch" ADD CONSTRAINT "CustomerBranch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBranch" ADD CONSTRAINT "CustomerBranch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "CustomerBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "CustomerBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "CommercialTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAddress" ADD CONSTRAINT "SupplierAddress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAddress" ADD CONSTRAINT "SupplierAddress_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Manufacturer" ADD CONSTRAINT "Manufacturer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierManufacturer" ADD CONSTRAINT "SupplierManufacturer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierManufacturer" ADD CONSTRAINT "SupplierManufacturer_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierManufacturer" ADD CONSTRAINT "SupplierManufacturer_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCode" ADD CONSTRAINT "TaxCode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialTerm" ADD CONSTRAINT "CommercialTerm_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentNumberSequence" ADD CONSTRAINT "DocumentNumberSequence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-enforced tenant consistency for parent/child and configurable-default links.
CREATE UNIQUE INDEX "Customer_id_companyId_key" ON "Customer"("id", "companyId");
CREATE UNIQUE INDEX "CustomerBranch_id_companyId_key" ON "CustomerBranch"("id", "companyId");
CREATE UNIQUE INDEX "Supplier_id_companyId_key" ON "Supplier"("id", "companyId");
CREATE UNIQUE INDEX "Manufacturer_id_companyId_key" ON "Manufacturer"("id", "companyId");
CREATE UNIQUE INDEX "TaxCode_id_companyId_key" ON "TaxCode"("id", "companyId");
CREATE UNIQUE INDEX "CommercialTerm_id_companyId_key" ON "CommercialTerm"("id", "companyId");
CREATE UNIQUE INDEX "StorageLocation_id_companyId_key" ON "StorageLocation"("id", "companyId");

ALTER TABLE "CustomerBranch" ADD CONSTRAINT "CustomerBranch_customer_tenant_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "Customer"("id", "companyId") ON DELETE RESTRICT;
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customer_tenant_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "Customer"("id", "companyId") ON DELETE RESTRICT;
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customer_tenant_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "Customer"("id", "companyId") ON DELETE RESTRICT;
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplier_tenant_fkey" FOREIGN KEY ("supplierId", "companyId") REFERENCES "Supplier"("id", "companyId") ON DELETE RESTRICT;
ALTER TABLE "SupplierAddress" ADD CONSTRAINT "SupplierAddress_supplier_tenant_fkey" FOREIGN KEY ("supplierId", "companyId") REFERENCES "Supplier"("id", "companyId") ON DELETE RESTRICT;
ALTER TABLE "SupplierManufacturer" ADD CONSTRAINT "SupplierManufacturer_supplier_tenant_fkey" FOREIGN KEY ("supplierId", "companyId") REFERENCES "Supplier"("id", "companyId") ON DELETE CASCADE;
ALTER TABLE "SupplierManufacturer" ADD CONSTRAINT "SupplierManufacturer_brand_tenant_fkey" FOREIGN KEY ("manufacturerId", "companyId") REFERENCES "Manufacturer"("id", "companyId") ON DELETE CASCADE;
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_parent_tenant_fkey" FOREIGN KEY ("parentId", "companyId") REFERENCES "StorageLocation"("id", "companyId") ON DELETE RESTRICT;

CREATE UNIQUE INDEX "CustomerContact_one_primary" ON "CustomerContact"("companyId", "customerId") WHERE "isPrimary" = true AND active = true;
CREATE UNIQUE INDEX "SupplierContact_one_primary" ON "SupplierContact"("companyId", "supplierId") WHERE "isPrimary" = true AND active = true;
ALTER TABLE "Part" ADD CONSTRAINT "Part_financial_values_nonnegative" CHECK (COALESCE("defaultPurchaseCost",0)>=0 AND COALESCE("defaultSellingPrice",0)>=0 AND COALESCE("reorderMinimum",0)>=0 AND COALESCE("reorderMaximum",0)>=0 AND COALESCE("reorderQuantity",0)>=0);
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_financial_values_nonnegative" CHECK (COALESCE("defaultCost",0)>=0 AND COALESCE("defaultSellingPrice",0)>=0);
ALTER TABLE "TaxCode" ADD CONSTRAINT "TaxCode_rate_valid" CHECK (rate>=0 AND rate<=1 AND ("effectiveTo" IS NULL OR "effectiveTo">="effectiveFrom"));
ALTER TABLE "DocumentNumberSequence" ADD CONSTRAINT "DocumentNumberSequence_values_valid" CHECK (padding BETWEEN 1 AND 12 AND "nextValue">0 AND "financialYearStartMonth" BETWEEN 1 AND 12);
