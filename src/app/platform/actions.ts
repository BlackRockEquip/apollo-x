"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/session";
import { createPlatformCompany, setPlatformCompanyStatus, updatePlatformCompany, updatePlatformCompanyStorageProfile, updatePlatformEntitlement } from "@/lib/platform/admin-service";

// 2026-09-22, user report: "when clicking add a company, it takes me to the
// overview menu, fix." Root cause: the "Add Company" button
// (platform/companies/page.tsx) linked to "/platform?create=1", but
// nothing ever read that "create=1" query param — the Overview page has no
// create-company form, so the link just... opened Overview. This action
// itself (createCompanyAction) already existed and already worked; there
// was simply no form anywhere that submitted to it. Fixed by building the
// missing form at /platform/companies/new (see that page) and pointing
// "Add Company" at it instead. Also wrapped the create call in a try/catch
// here so a real, expected failure (a duplicate internal code — the field
// is unique) redirects back to that form with a readable message instead
// of a raw Next.js error page, the same rough edge the pre-existing
// LAST_PLATFORM_ADMIN_REQUIRED error still has elsewhere in this file.
export async function createCompanyAction(formData: FormData) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const input = {
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
  };
  // The success redirect below is deliberately OUTSIDE this try block —
  // Next.js's redirect() works by throwing a special error, so catching it
  // here too (alongside a genuine failure from createPlatformCompany)
  // would misfire this same error-recovery path on every successful
  // create. Only the DB call itself is wrapped.
  let company: Awaited<ReturnType<typeof createPlatformCompany>>;
  try {
    company = await createPlatformCompany(context, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    redirect(`/platform/companies/new?error=${encodeURIComponent(message)}`);
  }
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