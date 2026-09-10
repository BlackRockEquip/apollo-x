"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/session";
import { createPlatformCompany, grantPlatformAuthority, setPlatformCompanyStatus, updatePlatformAuthority, updatePlatformCompany, updatePlatformEntitlement } from "@/lib/platform/admin-service";

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

export async function createPlatformAuthorityAction(formData: FormData) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  await grantPlatformAuthority(context, {
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "") as never,
  });
  revalidatePath("/platform/users");
}

export async function updatePlatformAuthorityAction(formData: FormData) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  await updatePlatformAuthority(context, {
    assignmentId: String(formData.get("assignmentId") ?? ""),
    role: String(formData.get("role") ?? "") as never,
    active: String(formData.get("active") ?? "true") === "true",
  });
  revalidatePath("/platform/users");
}