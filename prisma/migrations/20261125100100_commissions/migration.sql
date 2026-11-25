-- Commissions module: rep rate and monthly target, invoiced job lines (with their invoices and costs), monthly fuel used, payouts.
CREATE TABLE "CommissionRepSetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesRepresentativeId" TEXT NOT NULL,
    "rate" DECIMAL(6,4) NOT NULL,
    "monthlyTarget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommissionRepSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesRepresentativeId" TEXT NOT NULL,
    "jobId" TEXT,
    "jobReference" TEXT NOT NULL,
    "description" TEXT,
    "periodMonth" TEXT NOT NULL,
    "fuelCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherExpenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherExpensesNote" TEXT,
    "rateOverride" DECIMAL(6,4),
    "noCommission" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommissionLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionInvoice" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoicedOn" DATE NOT NULL,
    "amountExVat" DECIMAL(14,2) NOT NULL,
    "clientPaidOn" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CommissionInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionCost" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CommissionCost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionFuelMonth" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesRepresentativeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommissionFuelMonth_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionPayout" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "salesRepresentativeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidOn" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommissionRepSetting_salesRepresentativeId_key" ON "CommissionRepSetting"("salesRepresentativeId");
CREATE INDEX "CommissionRepSetting_companyId_idx" ON "CommissionRepSetting"("companyId");
CREATE INDEX "CommissionLine_companyId_salesRepresentativeId_periodMonth_idx" ON "CommissionLine"("companyId", "salesRepresentativeId", "periodMonth");
CREATE INDEX "CommissionLine_companyId_periodMonth_idx" ON "CommissionLine"("companyId", "periodMonth");
CREATE INDEX "CommissionInvoice_lineId_idx" ON "CommissionInvoice"("lineId");
CREATE INDEX "CommissionCost_lineId_idx" ON "CommissionCost"("lineId");
CREATE UNIQUE INDEX "CommissionFuelMonth_salesRepresentativeId_month_key" ON "CommissionFuelMonth"("salesRepresentativeId", "month");
CREATE INDEX "CommissionFuelMonth_companyId_idx" ON "CommissionFuelMonth"("companyId");
CREATE INDEX "CommissionPayout_companyId_salesRepresentativeId_month_idx" ON "CommissionPayout"("companyId", "salesRepresentativeId", "month");

ALTER TABLE "CommissionRepSetting" ADD CONSTRAINT "CommissionRepSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionRepSetting" ADD CONSTRAINT "CommissionRepSetting_salesRepresentativeId_fkey" FOREIGN KEY ("salesRepresentativeId") REFERENCES "SalesRepresentative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_salesRepresentativeId_fkey" FOREIGN KEY ("salesRepresentativeId") REFERENCES "SalesRepresentative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionInvoice" ADD CONSTRAINT "CommissionInvoice_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "CommissionLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionCost" ADD CONSTRAINT "CommissionCost_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "CommissionLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionFuelMonth" ADD CONSTRAINT "CommissionFuelMonth_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionFuelMonth" ADD CONSTRAINT "CommissionFuelMonth_salesRepresentativeId_fkey" FOREIGN KEY ("salesRepresentativeId") REFERENCES "SalesRepresentative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_salesRepresentativeId_fkey" FOREIGN KEY ("salesRepresentativeId") REFERENCES "SalesRepresentative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
