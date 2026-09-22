"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/session";
import { createPlatformCompany, setPlatformCompanyStatus, updatePlatformCompany, updatePlatformCompanyStorageProfile, updatePlatformEntitlement } from "@/lib/platform/admin-service";

export async function createCompanyAction(formData: FormData) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const company = await createPlatformCompany(context, {
    internalCode: String(formData.get("internalCode") ?? ""),
    legalName: String(formData.get("legalName") ?? ""),
    tradingName: String(formData.get("tradingName") ?? ""),
    defaultCurrencyCode: String(formData.get("defaultCurrencyCode") ?? "ZAR"),
    defaultGracePeriodDays: Number(formData.get("defaultGracePeriodDays") ?? 30),
    settings: {
      themeColor: String(formData.get("themeColor") ?? ""),
      mainTelephone: String(formData.get("mainTelephone") ?? ""),
      mainEmail: String(formData.get("mainEmail") ?? ""),
      website: String(formData.get("website") ?? ""),
      registrationNumber: String(formData.get("registrationNumber") ?? ""),
      vatNumber: String(formData.get("vatNumber") ?? ""),
      quoteValidityDays: Number(formData.get("quoteValidityDays") ?? 30),
      defaultTaxJurisdiction: String(formData.get("defaultTaxJurisdiction") ?? "ZA"),
      documentHeaderText: String(formData.get("documentHeaderText") ?? ""),
      documentFooterText: String(formData.get("documentFooterText") ?? ""),
    },
  });
  revalidatePath("/platform");
  redirect(`/platform/companies/${company.id}`);
}

export async function updateCompanyAction(formData: FormData) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const companyId = String(formData.get("companyId") ?? "");
  await updatePlatformCompany(context, companyId, {
    legalName: String(formData.get("legalName") ?? ""),
    tradingName: String(formData.get("tradingName") ?? ""),
    defaultCurrencyCode: String(formData.get("defaultCurrencyCode") ?? "ZAR"),
    defaultGracePeriodDays: Number(formData.get("defaultGracePeriodDays") ?? 30),
    settings: {
      themeColor: String(formData.get("themeColor") ?? ""),
      mainTelephone: String(formData.get("mainTelephone") ?? ""),
      mainEmail: String(formData.get("mainEmail") ?? ""),
      website: String(formData.get("website") ?? ""),
      registrationNumber: String(formData.get("registrationNumber") ?? ""),
      vatNumber: String(formData.get("vatNumber") ?? ""),
      quoteValidityDays: Number(formData.get("quoteValidityDays") ?? 30),
      defaultTaxJurisdiction: String(formData.get("defaultTaxJurisdiction") ?? "ZA"),
      documentHeaderText: String(formData.get("documentHeaderText") ?? ""),
      documentFooterText: String(formData.get("documentFooterText") ?? ""),
    },
  });
  revalidatePath("/platform");
  revalidatePath(`/platform/companies/${companyId}`);
}

export async function setCompanyStatusAction(formData: FormData) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const companyId = String(formData.get("companyId") ?? "");
  await setPlatformCompanyStatus(context, companyId, String(formData.get("status") ?? "ACTIVE") as "ACTIVE" | "SUSPENDED");
  revalidatePath("/platform");
  revalidatePath(`/platform/companies/${companyId}`);
}

export async function updateCompanyStorageProfileAction(formData: FormData) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const companyId = String(formData.get("companyId") ?? "");
  await updatePlatformCompanyStorageProfile(context, companyId, {
    provider: String(formData.get("provider") ?? "") as "" | "R2" | "B2" | "S3_COMPATIBLE",
    bucket: String(formData.get("bucket") ?? ""),
    region: String(formData.get("region") ?? ""),
    endpoint: String(formData.get("endpoint") ?? ""),
    accessKeyId: String(formData.get("accessKeyId") ?? ""),
    secretAccessKey: String(formData.get("secretAccessKey") ?? ""),
  });
  revalidatePath(`/platform/companies/${companyId}`);
}

export async function updateEntitlementAction(formData: FormData) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const companyId = String(formData.get("companyId") ?? "");
  await updatePlatformEntitlement(context, companyId, {
    module: String(formData.get("module") ?? "") as never,
    status: String(formData.get("status") ?? "") as never,
    source: String(formData.get("source") ?? "") as never,
    effectiveFrom: String(formData.get("effectiveFrom") ?? ""),
    expiresAt: String(formData.get("expiresAt") ?? ""),
    gracePeriodDays: String(formData.get("gracePeriodDays") ?? ""),
    readOnlyOverrideUntil: String(formData.get("readOnlyOverrideUntil") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath("/platform");
  revalidatePath(`/platform/companies/${companyId}`);
}

// 2026-09-22 — createPlatformAuthorityAction/updatePlatformAuthorityAction
// removed from here: Platform Users (app/platform/users/page.tsx) is now a
// client table (PlatformUsersWorkspace.tsx) calling the new
// /api/v1/platform/users/authority[...] routes directly, so it can show
// errors (e.g. the new "can't grant an active company member platform
// authority" safeguard) inline instead of only via a full error page — see
// that route's own comment.