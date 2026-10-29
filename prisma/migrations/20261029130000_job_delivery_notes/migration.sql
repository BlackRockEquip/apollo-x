-- Engineering delivery note register: one row per job delivery note issued (printed).
CREATE TABLE "JobDeliveryNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "notes" TEXT,
    "lines" JSONB NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobDeliveryNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobDeliveryNote_jobId_sequence_key" ON "JobDeliveryNote"("jobId", "sequence");
CREATE UNIQUE INDEX "JobDeliveryNote_companyId_number_key" ON "JobDeliveryNote"("companyId", "number");
CREATE INDEX "JobDeliveryNote_companyId_deliveryDate_idx" ON "JobDeliveryNote"("companyId", "deliveryDate");
CREATE INDEX "JobDeliveryNote_companyId_jobId_idx" ON "JobDeliveryNote"("companyId", "jobId");

ALTER TABLE "JobDeliveryNote" ADD CONSTRAINT "JobDeliveryNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobDeliveryNote" ADD CONSTRAINT "JobDeliveryNote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
