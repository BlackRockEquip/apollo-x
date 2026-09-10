-- CreateTable
CREATE TABLE "UserTableColumns" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tableKey" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTableColumns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserTableColumns_userId_companyId_tableKey_key" ON "UserTableColumns"("userId", "companyId", "tableKey");

-- AddForeignKey
ALTER TABLE "UserTableColumns" ADD CONSTRAINT "UserTableColumns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTableColumns" ADD CONSTRAINT "UserTableColumns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
