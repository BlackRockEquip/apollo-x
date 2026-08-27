import { ModuleKey, PlatformRole, TenantRole } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { BLACK_ROCK_INTERNAL_CODE } from "../src/lib/constants";
import { hashPassword } from "../src/lib/security/passwords";

async function main() {
  const company = await prisma.company.upsert({
    where: { internalCode: BLACK_ROCK_INTERNAL_CODE },
    update: {},
    create: {
      internalCode: BLACK_ROCK_INTERNAL_CODE,
      legalName: "Black Rock Equipment (Pty) Ltd",
      tradingName: "Black Rock Equipment",
      settings: { create: { defaultCurrencyCode: "ZAR", defaultTaxJurisdiction: "ZA" } },
      entitlements: {
        create: Object.values(ModuleKey).map((module) => ({ module, source: "INTERNAL_FREE", status: "ACTIVE", effectiveFrom: new Date("2000-01-01T00:00:00Z") })),
      },
    },
  });

  const standardVat = await prisma.taxCode.upsert({
    where: { companyId_codeNormalized_effectiveFrom: { companyId: company.id, codeNormalized: "VAT15", effectiveFrom: new Date("2018-04-01T00:00:00Z") } },
    update: { active: true },
    create: { companyId: company.id, code: "VAT15", codeNormalized: "VAT15", description: "Standard VAT 15%", rate: "0.15", type: "STANDARD", effectiveFrom: new Date("2018-04-01T00:00:00Z") },
  });
  await Promise.all([
    prisma.taxCode.upsert({ where: { companyId_codeNormalized_effectiveFrom: { companyId: company.id, codeNormalized: "ZERO", effectiveFrom: new Date("2000-01-01T00:00:00Z") } }, update: { active: true }, create: { companyId: company.id, code: "ZERO", codeNormalized: "ZERO", description: "Zero-rated", rate: "0", type: "ZERO_RATED", effectiveFrom: new Date("2000-01-01T00:00:00Z") } }),
    prisma.taxCode.upsert({ where: { companyId_codeNormalized_effectiveFrom: { companyId: company.id, codeNormalized: "EXEMPT", effectiveFrom: new Date("2000-01-01T00:00:00Z") } }, update: { active: true }, create: { companyId: company.id, code: "EXEMPT", codeNormalized: "EXEMPT", description: "VAT exempt", rate: "0", type: "EXEMPT", effectiveFrom: new Date("2000-01-01T00:00:00Z") } }),
  ]);
  const paymentTerms = await Promise.all([
    ["COD", "Cash on delivery", 0], ["7D", "7 days", 7], ["30D", "30 days", 30], ["60D", "60 days", 60],
  ].map(([code, label, days]) => prisma.commercialTerm.upsert({
    where: { companyId_type_codeNormalized: { companyId: company.id, type: "PAYMENT", codeNormalized: String(code) } },
    update: { active: true }, create: { companyId: company.id, type: "PAYMENT", code: String(code), codeNormalized: String(code), label: String(label), days: Number(days) },
  })));
  const sequences = { JOB: "JOB-", PEX_JOB: "PEX-", QUOTE: "Q-", SALES_ORDER: "SO-", INVOICE: "INV-", PAYMENT_RECEIPT: "REC-", PROCUREMENT_RFQ: "RFQ-" } as const;
  await Promise.all(Object.entries(sequences).map(([type,prefix]) => prisma.documentNumberSequence.upsert({ where: { companyId_type: { companyId: company.id, type: type as keyof typeof sequences } }, update: {}, create: { companyId: company.id, type: type as keyof typeof sequences, prefix, padding: 6 } })));
  await prisma.companySettings.update({ where: { companyId: company.id }, data: { defaultTaxCodeId: standardVat.id, defaultPaymentTermId: paymentTerms[2].id, defaultCurrencyCode: "ZAR", defaultTaxJurisdiction: "ZA", quoteValidityDays: 30 } });

  const email = process.env.BOOTSTRAP_PLATFORM_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_PLATFORM_PASSWORD;
  if (!email || !password || password === "replace-before-seeding") {
    console.log(`Created/verified ${company.tradingName}. Platform user skipped: configure secure BOOTSTRAP_PLATFORM_* values.`);
    return;
  }
  if (password.length < 12) throw new Error("BOOTSTRAP_PLATFORM_PASSWORD must be at least 12 characters.");
  const user = await prisma.userIdentity.upsert({
    where: { email },
    update: {},
    create: { email, displayName: "Platform Administrator", passwordHash: await hashPassword(password) },
  });
  await prisma.platformRoleAssignment.upsert({
    where: { userId_role: { userId: user.id, role: PlatformRole.PLATFORM_ADMIN } },
    update: { active: true },
    create: { userId: user.id, role: PlatformRole.PLATFORM_ADMIN },
  });
  await prisma.companyMembership.upsert({
    where: { userId_companyId: { userId: user.id, companyId: company.id } },
    update: { status: "ACTIVE", role: TenantRole.COMPANY_ADMIN },
    create: { userId: user.id, companyId: company.id, role: TenantRole.COMPANY_ADMIN },
  });
  console.log(`Created/verified ${company.tradingName} and ${email}.`);
}

main().finally(() => prisma.$disconnect());
