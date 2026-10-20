import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { BLACK_ROCK_INTERNAL_CODE } from "@/lib/constants";
import { grantInitialModules } from "@/lib/platform/industry-build-service";
import { ensureDefaultSequences } from "@/lib/master-data/default-sequences";
import { getStorageBackendForCompany } from "@/lib/storage";
import { readStoredBlob, storeBlob } from "@/lib/attachments/blob-store";
import { companyCopyName, isResetPhrase, pickFreeCopyCode } from "@/lib/platform/company-lifecycle-constants";

// 2026-10-20, user request (platform admin > Companies):
//  * "Add a reset company button which requires the user to type "Reset Company"
//    ... once confirmed it resets/deletes all data and puts everything back to as
//    it was before data was added."
//  * "Add a clone button as well which creates a copy of the company and adds the
//    words "- copy" to the end of the company name."
// Decisions (asked of the user): reset keeps the company's setup and logins; clone
// copies the setup only (no users, no data).

/** Tables that are the company's SETUP, not its data: reset leaves these alone. */
export const RESET_KEEP_TABLES: readonly string[] = [
  "CompanyProduct",
  "CompanyMembership", // the company's users and logins
  "PlatformSupportAccess",
  "CompanyModuleEntitlement", // licensed modules
  "EntitlementHistory",
  "CompanySettings", // branding, SMTP, email templates, storage choice, document titles
  "CompanyAddress",
  "DocumentNumberSequence", // kept, counters are put back to 1 below
  "UserDashboardConfig",
  "UserTableColumns",
  "SpecificationFormSettings",
  "TaxCode",
  "CommercialTerm",
  "JobTypePreset",
  "Mechanic",
  "SalesRepresentative",
];

// The company logo is an Attachment row; it is setup, so it survives the reset.
const EXTRA_WHERE: Record<string, string> = { Attachment: `AND "ownerType"::text <> 'COMPANY_LOGO'` };

function quoteIdent(name: string) {
  return `"${name.replaceAll('"', '""')}"`;
}

function assertMutable(code: string) {
  if (code === BLACK_ROCK_INTERNAL_CODE) throw new Error("BLACK_ROCK_PROTECTED");
}

export async function resetPlatformCompany(ctx: RequestContext, companyId: string, confirmText: string) {
  requirePlatformPermission(ctx, "PLATFORM_COMPANIES_EDIT");
  requirePlatformPermission(ctx, "PLATFORM_COMPANIES_SUSPEND");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, internalCode: true, legalName: true, tradingName: true, _count: { select: { jobs: true, customers: true, suppliers: true, parts: true } } },
  });
  if (!company) throw new Error("RESOURCE_NOT_FOUND");
  assertMutable(company.internalCode);
  if (!isResetPhrase(confirmText)) throw new Error("RESET_CONFIRM_MISMATCH");

  // Stored files (not the logo) are removed from object storage after the database part succeeds.
  const files = await prisma.attachment.findMany({ where: { companyId, ownerType: { not: "COMPANY_LOGO" } }, select: { objectKey: true } });

  await prisma.$transaction(async (tx) => {
    // Pick-slip lines hang off pick slips and have no companyId of their own.
    await tx.$executeRawUnsafe(`DELETE FROM "PickSlipLine" WHERE "pickSlipId" IN (SELECT id FROM "PickSlip" WHERE "companyId" = $1)`, companyId);

    const tableRows = await tx.$queryRaw<Array<{ table_name: string }>>`
      SELECT c.table_name::text AS table_name FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = current_schema() AND c.column_name::text = 'companyId' AND c.table_name::text <> 'Company'
      ORDER BY c.table_name`;
    // Every table with a companyId column is DATA unless it is on the keep list, so a table added by a later migration is wiped too.
    let remaining = tableRows.map((row) => row.table_name).filter((name) => !RESET_KEEP_TABLES.includes(name));
    let lastError = "";
    while (remaining.length > 0) {
      const failed: string[] = [];
      for (const table of remaining) {
        await tx.$executeRawUnsafe("SAVEPOINT company_reset_step");
        try {
          await tx.$executeRawUnsafe(`DELETE FROM ${quoteIdent(table)} WHERE "companyId" = $1 ${EXTRA_WHERE[table] ?? ""}`, companyId);
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT company_reset_step");
        } catch (error) {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT company_reset_step");
          lastError = `${table}: ${error instanceof Error ? error.message : String(error)}`;
          failed.push(table);
        }
      }
      if (failed.length === remaining.length) {
        console.error("resetPlatformCompany blocked", lastError);
        throw new Error("COMPANY_RESET_BLOCKED");
      }
      remaining = failed;
    }

    // Document numbering starts again from 1 (prefixes and formats are kept).
    await tx.documentNumberSequence.updateMany({ where: { companyId }, data: { nextValue: BigInt(1) } });
    await ensureDefaultSequences(tx, companyId);

    await tx.auditEvent.create({
      data: {
        companyId,
        actorId: ctx.userId,
        source: "PLATFORM",
        module: "PLATFORM",
        entityType: "Company",
        entityId: companyId,
        action: "PLATFORM_COMPANY_RESET",
        correlationId: ctx.correlationId,
        beforeData: { internalCode: company.internalCode, jobs: company._count.jobs, customers: company._count.customers, suppliers: company._count.suppliers, parts: company._count.parts, storedFiles: files.length },
      },
    });
  }, { timeout: 120000, maxWait: 15000 });

  // Best effort: the records are already gone, so a file that cannot be removed must not fail the reset.
  if (files.length > 0) {
    try {
      const backend = await getStorageBackendForCompany(companyId);
      for (let i = 0; i < files.length; i += 10) {
        await Promise.all(files.slice(i, i + 10).map((file) => backend.deleteObject(file.objectKey).catch(() => undefined)));
      }
    } catch {
      // storage not reachable: leave the files where they are
    }
  }

  return { id: company.id, internalCode: company.internalCode, legalName: company.legalName };
}

const SETTINGS_NOT_COPIED = [
  "id", "companyId", "defaultTaxCodeId", "defaultPaymentTermId",
  // secrets and per-company file storage are never copied
  "smtpPassword", "smtpConfiguredAt",
  "storageProvider", "storageBucket", "storageRegion", "storageEndpoint", "storageAccessKeyId", "storageSecretAccessKey", "storageLocalPath", "storageConfiguredAt",
  "logoObjectKey", "documentTitles",
] as const;

export async function clonePlatformCompany(ctx: RequestContext, companyId: string) {
  requirePlatformPermission(ctx, "PLATFORM_COMPANIES_CREATE");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");

  const source = await prisma.company.findUnique({
    where: { id: companyId },
    include: { settings: true, addresses: true, products: true, entitlements: true, taxCodes: true, commercialTerms: true, documentSequences: true, jobTypePresets: true, specificationFormSettings: true },
  });
  if (!source) throw new Error("RESOURCE_NOT_FOUND");

  const baseCode = source.internalCode.replace(/-COPY\d*$/i, "");
  const taken = (await prisma.company.findMany({ where: { internalCode: { startsWith: `${baseCode}-COPY`, mode: "insensitive" } }, select: { internalCode: true } })).map((row) => row.internalCode);
  const internalCode = pickFreeCopyCode(baseCode, taken);

  const logoAttachment = source.settings?.logoObjectKey
    ? await prisma.attachment.findFirst({ where: { companyId, ownerType: "COMPANY_LOGO", ownerId: companyId } })
    : null;

  const created = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        internalCode,
        industryBuild: source.industryBuild,
        legalName: companyCopyName(source.legalName),
        tradingName: source.tradingName?.trim() ? companyCopyName(source.tradingName) : null,
        status: "ACTIVE",
        defaultCurrencyCode: source.defaultCurrencyCode,
        defaultGracePeriodDays: source.defaultGracePeriodDays,
      },
    }).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") throw new Error("DUPLICATE_INTERNAL_CODE");
      throw error;
    });
    const newId = company.id;

    // Tax codes and payment terms first: the settings point at them.
    const taxMap = new Map<string, string>();
    for (const row of source.taxCodes) {
      const copy = await tx.taxCode.create({ data: { companyId: newId, code: row.code, codeNormalized: row.codeNormalized, description: row.description, rate: row.rate, type: row.type, effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo, active: row.active } });
      taxMap.set(row.id, copy.id);
    }
    const termMap = new Map<string, string>();
    for (const row of source.commercialTerms) {
      const copy = await tx.commercialTerm.create({ data: { companyId: newId, type: row.type, code: row.code, codeNormalized: row.codeNormalized, label: row.label, days: row.days, termsText: row.termsText, active: row.active } });
      termMap.set(row.id, copy.id);
    }

    // Settings: branding, contact details, SMTP host/user/from, email templates, quote validity.
    const s = source.settings;
    const settingsData: Record<string, unknown> = s ? { ...s } : {};
    for (const key of SETTINGS_NOT_COPIED) delete settingsData[key];
    if (logoAttachment) {
      // The logo file is copied after this transaction; until then the copy has no logo.
      settingsData.logoData = null; settingsData.logoMimeType = null; settingsData.logoFileName = null; settingsData.logoSizeBytes = null;
    }
    await tx.companySettings.create({
      data: {
        ...(settingsData as Prisma.CompanySettingsUncheckedCreateInput),
        companyId: newId,
        defaultTaxCodeId: s?.defaultTaxCodeId ? taxMap.get(s.defaultTaxCodeId) ?? null : null,
        defaultPaymentTermId: s?.defaultPaymentTermId ? termMap.get(s.defaultPaymentTermId) ?? null : null,
        documentTitles: s?.documentTitles == null ? Prisma.JsonNull : (s.documentTitles as Prisma.InputJsonValue),
      },
    });

    if (source.addresses.length > 0) {
      await tx.companyAddress.createMany({ data: source.addresses.map((a) => ({ companyId: newId, type: a.type, label: a.label, line1: a.line1, line2: a.line2, city: a.city, province: a.province, postalCode: a.postalCode, countryCode: a.countryCode, isPrimary: a.isPrimary })) });
    }
    if (source.jobTypePresets.length > 0) {
      await tx.jobTypePreset.createMany({ data: source.jobTypePresets.map((p) => ({ companyId: newId, key: p.key, label: p.label, behavesAs: p.behavesAs, active: p.active, sortOrder: p.sortOrder })) });
    }
    if (source.specificationFormSettings) {
      const f = source.specificationFormSettings;
      await tx.specificationFormSettings.create({ data: { companyId: newId, standardText: f.standardText, documentNumber: f.documentNumber, issueDate: f.issueDate, revision: f.revision, revisionDate: f.revisionDate } });
    }

    // Numbering: same prefixes and formats, counters start at 1.
    if (source.documentSequences.length > 0) {
      await tx.documentNumberSequence.createMany({ data: source.documentSequences.map((d) => ({ companyId: newId, type: d.type, prefix: d.prefix, padding: d.padding, nextValue: BigInt(1), includeFinancialYear: d.includeFinancialYear, financialYearStartMonth: d.financialYearStartMonth, active: d.active })) });
    }
    await ensureDefaultSequences(tx, newId);

    // Licensing: same products and modules. Black Rock has no rows (internal policy), so the copy gets its build's normal starter modules.
    if (source.internalCode === BLACK_ROCK_INTERNAL_CODE || source.entitlements.length === 0) {
      await grantInitialModules(tx, ctx, newId, source.industryBuild);
    } else {
      if (source.products.length > 0) {
        await tx.companyProduct.createMany({ data: source.products.map((p) => ({ companyId: newId, product: p.product, status: p.status, effectiveFrom: p.effectiveFrom, expiresAt: p.expiresAt })) });
      }
      await tx.companyModuleEntitlement.createMany({
        data: source.entitlements.map((e) => ({
          companyId: newId, product: e.product, module: e.module, source: e.source, status: e.status, effectiveFrom: e.effectiveFrom, expiresAt: e.expiresAt, gracePeriodDays: e.gracePeriodDays, readOnlyOverrideUntil: e.readOnlyOverrideUntil,
          metadata: e.metadata == null ? Prisma.JsonNull : (e.metadata as Prisma.InputJsonValue),
        })),
      });
      await tx.entitlementHistory.createMany({
        data: source.entitlements.map((e) => ({ companyId: newId, product: e.product, module: e.module, previousStatus: null, newStatus: e.status, source: e.source, effectiveAt: e.effectiveFrom, expiresAt: e.expiresAt, reason: `Copied from ${source.internalCode}`, changedById: ctx.userId })),
      });
    }

    await tx.auditEvent.create({
      data: {
        companyId: newId,
        actorId: ctx.userId,
        source: "PLATFORM",
        module: "PLATFORM",
        entityType: "Company",
        entityId: newId,
        action: "PLATFORM_COMPANY_CLONED",
        correlationId: ctx.correlationId,
        afterData: { internalCode, legalName: company.legalName, clonedFrom: { id: source.id, internalCode: source.internalCode } },
      },
    });
    return company;
  }, { timeout: 120000, maxWait: 15000 });

  // The logo file is copied through storage (best effort: the copy works without one).
  if (logoAttachment) {
    try {
      const blob = await readStoredBlob(companyId, logoAttachment.id);
      const stored = await storeBlob({ companyId: created.id, ownerType: "COMPANY_LOGO", ownerId: created.id, folder: "Company", fileName: blob.fileName, mimeType: blob.mimeType, data: Buffer.from(blob.data), uploadedById: ctx.userId });
      if (stored) {
        await prisma.companySettings.update({ where: { companyId: created.id }, data: { logoMimeType: stored.mimeType, logoFileName: stored.fileName, logoSizeBytes: stored.sizeBytes, logoUpdatedAt: new Date(), logoObjectKey: stored.id } });
      }
    } catch {
      // keep the copy without a logo
    }
  }

  return created;
}
