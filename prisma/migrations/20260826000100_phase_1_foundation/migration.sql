CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ENDED');
CREATE TYPE "TenantRole" AS ENUM ('COMPANY_ADMIN', 'MANAGER', 'USER', 'STORE_CONTROLLER', 'SALES', 'FINANCE');
CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_ADMIN', 'SUPPORT_READ_ONLY', 'SUPPORT_OPERATOR', 'SECURITY_AUDITOR');
CREATE TYPE "SupportAccessMode" AS ENUM ('READ_ONLY', 'READ_WRITE');
CREATE TYPE "ModuleKey" AS ENUM ('DASHBOARD', 'CUSTOMERS', 'SUPPLIERS', 'JOBS_WIP', 'INVENTORY', 'STORAGE', 'JOB_KITS', 'REBUILDS', 'PEX_STOCK', 'PEX_TRACKING', 'PROCUREMENT', 'OUTWORK', 'WARRANTY', 'FIELD_SERVICE', 'NOTIFICATIONS', 'QUOTES', 'SALES_ORDERS', 'INVOICES', 'PAYMENTS', 'REPORTS', 'ATTACHMENTS', 'IMPORT_EXPORT');
CREATE TYPE "EntitlementSource" AS ENUM ('INTERNAL_FREE', 'PLAN', 'BUNDLE', 'MODULE', 'TRIAL', 'PLATFORM_OVERRIDE');
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'SCHEDULED', 'GRACE_READ_ONLY', 'EXPIRED', 'SUSPENDED');
CREATE TYPE "AuditSource" AS ENUM ('UI', 'API', 'IMPORT', 'INTEGRATION', 'WORKER', 'PLATFORM');

CREATE TABLE "UserIdentity" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "displayName" TEXT NOT NULL, "passwordHash" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "sessionVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Company" (
  "id" TEXT NOT NULL, "internalCode" TEXT NOT NULL, "legalName" TEXT NOT NULL, "tradingName" TEXT,
  "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE', "defaultCurrencyCode" TEXT NOT NULL DEFAULT 'ZAR',
  "defaultGracePeriodDays" INTEGER NOT NULL DEFAULT 30, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- Tenant identity is used by licensing and must never follow an editable display name.
CREATE FUNCTION "prevent_company_internal_code_change"() RETURNS trigger AS $$
BEGIN
  IF NEW."internalCode" IS DISTINCT FROM OLD."internalCode" THEN
    RAISE EXCEPTION 'Company internalCode is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Company_internalCode_immutable"
BEFORE UPDATE OF "internalCode" ON "Company"
FOR EACH ROW EXECUTE FUNCTION "prevent_company_internal_code_change"();
CREATE TABLE "CompanyMembership" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "companyId" TEXT NOT NULL, "role" "TenantRole" NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MembershipPermission" (
  "id" TEXT NOT NULL, "membershipId" TEXT NOT NULL, "permission" TEXT NOT NULL, "allowed" BOOLEAN NOT NULL,
  CONSTRAINT "MembershipPermission_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PlatformRoleAssignment" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "role" "PlatformRole" NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformRoleAssignment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PlatformPermission" (
  "id" TEXT NOT NULL, "assignmentId" TEXT NOT NULL, "permission" TEXT NOT NULL, "allowed" BOOLEAN NOT NULL,
  CONSTRAINT "PlatformPermission_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PlatformSupportAccess" (
  "id" TEXT NOT NULL, "operatorId" TEXT NOT NULL, "companyId" TEXT NOT NULL, "mode" "SupportAccessMode" NOT NULL,
  "reason" TEXT NOT NULL, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3), "endedById" TEXT, CONSTRAINT "PlatformSupportAccess_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "UserSession" (
  "id" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "userId" TEXT NOT NULL, "membershipId" TEXT,
  "supportAccessId" TEXT, "sessionVersion" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3), "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LoginThrottle" (
  "keyHash" TEXT NOT NULL, "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("keyHash")
);
CREATE TABLE "CompanyModuleEntitlement" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "module" "ModuleKey" NOT NULL, "source" "EntitlementSource" NOT NULL,
  "status" "EntitlementStatus" NOT NULL, "effectiveFrom" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3),
  "gracePeriodDays" INTEGER, "readOnlyOverrideUntil" TIMESTAMP(3), "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyModuleEntitlement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EntitlementHistory" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "module" "ModuleKey" NOT NULL,
  "previousStatus" "EntitlementStatus", "newStatus" "EntitlementStatus" NOT NULL, "source" "EntitlementSource" NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3), "reason" TEXT, "changedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "EntitlementHistory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CompanySettings" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "defaultCurrencyCode" TEXT NOT NULL DEFAULT 'ZAR',
  "defaultTaxJurisdiction" TEXT NOT NULL DEFAULT 'ZA', "themeColor" TEXT, "logoObjectKey" TEXT,
  CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL, "companyId" TEXT, "actorId" TEXT, "supportAccessId" TEXT, "source" "AuditSource" NOT NULL,
  "module" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT, "action" TEXT NOT NULL,
  "beforeData" JSONB, "afterData" JSONB, "reason" TEXT, "correlationId" TEXT NOT NULL,
  "ipAddress" TEXT, "userAgent" TEXT, "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserIdentity_email_key" ON "UserIdentity"("email");
CREATE UNIQUE INDEX "Company_internalCode_key" ON "Company"("internalCode");
CREATE INDEX "CompanyMembership_companyId_status_idx" ON "CompanyMembership"("companyId", "status");
CREATE UNIQUE INDEX "CompanyMembership_userId_companyId_key" ON "CompanyMembership"("userId", "companyId");
CREATE UNIQUE INDEX "MembershipPermission_membershipId_permission_key" ON "MembershipPermission"("membershipId", "permission");
CREATE UNIQUE INDEX "PlatformRoleAssignment_userId_role_key" ON "PlatformRoleAssignment"("userId", "role");
CREATE UNIQUE INDEX "PlatformPermission_assignmentId_permission_key" ON "PlatformPermission"("assignmentId", "permission");
CREATE INDEX "PlatformSupportAccess_operatorId_expiresAt_idx" ON "PlatformSupportAccess"("operatorId", "expiresAt");
CREATE INDEX "PlatformSupportAccess_companyId_expiresAt_idx" ON "PlatformSupportAccess"("companyId", "expiresAt");
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");
CREATE INDEX "UserSession_userId_expiresAt_idx" ON "UserSession"("userId", "expiresAt");
CREATE INDEX "LoginThrottle_lockedUntil_idx" ON "LoginThrottle"("lockedUntil");
CREATE INDEX "CompanyModuleEntitlement_companyId_status_idx" ON "CompanyModuleEntitlement"("companyId", "status");
CREATE UNIQUE INDEX "CompanyModuleEntitlement_companyId_module_key" ON "CompanyModuleEntitlement"("companyId", "module");
CREATE INDEX "EntitlementHistory_companyId_module_createdAt_idx" ON "EntitlementHistory"("companyId", "module", "createdAt");
CREATE UNIQUE INDEX "CompanySettings_companyId_key" ON "CompanySettings"("companyId");
CREATE INDEX "AuditEvent_companyId_occurredAt_idx" ON "AuditEvent"("companyId", "occurredAt");
CREATE INDEX "AuditEvent_actorId_occurredAt_idx" ON "AuditEvent"("actorId", "occurredAt");
CREATE INDEX "AuditEvent_entityType_entityId_occurredAt_idx" ON "AuditEvent"("entityType", "entityId", "occurredAt");
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");

ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MembershipPermission" ADD CONSTRAINT "MembershipPermission_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformRoleAssignment" ADD CONSTRAINT "PlatformRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformPermission" ADD CONSTRAINT "PlatformPermission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PlatformRoleAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformSupportAccess" ADD CONSTRAINT "PlatformSupportAccess_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "UserIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformSupportAccess" ADD CONSTRAINT "PlatformSupportAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformSupportAccess" ADD CONSTRAINT "PlatformSupportAccess_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_supportAccessId_fkey" FOREIGN KEY ("supportAccessId") REFERENCES "PlatformSupportAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyModuleEntitlement" ADD CONSTRAINT "CompanyModuleEntitlement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntitlementHistory" ADD CONSTRAINT "EntitlementHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanySettings" ADD CONSTRAINT "CompanySettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "UserIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
