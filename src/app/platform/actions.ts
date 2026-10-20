"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/session";
import { STORAGE_ERROR_MESSAGES, type StorageProfileInput } from "@/lib/storage/profile";
import { testPlatformCompanyStorage, type StorageTestStep } from "@/lib/platform/storage-admin-service";
import { createPlatformCompany, createPlatformCompanyUser, findCompanyByInternalCode, deletePlatformCompany, setPlatformCompanyStatus, updatePlatformCompany, updatePlatformCompanyStorageProfile } from "@/lib/platform/admin-service";
import { TenantRole } from "@prisma/client";
import { isIndustryBuildId } from "@/lib/builds/definitions";
import { clonePlatformCompany, resetPlatformCompany } from "@/lib/platform/company-lifecycle-service";

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
// 2026-10-16: a field that is not in the submitted form comes back as
// undefined (= "leave as stored"), a field that is there but empty comes back
// as "" (= "clear it"). This is what stops a form that shows only some of the
// company's details from wiping the rest.
function opt(formData: FormData, name: string) {
  return formData.has(name) ? String(formData.get(name) ?? "") : undefined;
}

function optNum(formData: FormData, name: string) {
  const raw = opt(formData, name);
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function settingsFromForm(formData: FormData) {
  return {
    themeColor: opt(formData, "themeColor"),
    accentColor: opt(formData, "accentColor"),
    secondaryColor: opt(formData, "secondaryColor"),
    backgroundColor: opt(formData, "backgroundColor"),
    mainTelephone: opt(formData, "mainTelephone"),
    mainEmail: opt(formData, "mainEmail"),
    website: opt(formData, "website"),
    registrationNumber: opt(formData, "registrationNumber"),
    vatNumber: opt(formData, "vatNumber"),
    quoteValidityDays: optNum(formData, "quoteValidityDays"),
    defaultTaxJurisdiction: opt(formData, "defaultTaxJurisdiction"),
    documentHeaderText: opt(formData, "documentHeaderText"),
    documentFooterText: opt(formData, "documentFooterText"),
  };
}

function addressFromForm(formData: FormData) {
  return {
    line1: opt(formData, "addressLine1"),
    line2: opt(formData, "addressLine2"),
    city: opt(formData, "addressCity"),
    province: opt(formData, "addressProvince"),
    postalCode: opt(formData, "addressPostalCode"),
  };
}

function errorCode(error: unknown) {
  if (error instanceof Error && error.name === "ZodError") return "INVALID_USER_DETAILS";
  if (error instanceof Error && error.name === "AuthorizationError") return "NOT_ALLOWED";
  return error instanceof Error ? error.message : "UNKNOWN_ERROR";
}

export async function createCompanyAction(formData: FormData) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const input = {
    internalCode: String(formData.get("internalCode") ?? ""),
    legalName: String(formData.get("legalName") ?? ""),
    tradingName: opt(formData, "tradingName"),
    defaultCurrencyCode: opt(formData, "defaultCurrencyCode"),
    defaultGracePeriodDays: optNum(formData, "defaultGracePeriodDays"),
    industryBuild: isIndustryBuildId(formData.get("industryBuild")) ? (formData.get("industryBuild") as "WORKSHOP" | "ENGINEERING") : ("WORKSHOP" as const),
    settings: settingsFromForm(formData),
    address: addressFromForm(formData),
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
    let extra = "";
    if (message === "DUPLICATE_INTERNAL_CODE") {
      // Tell the form which company already holds the code (and give it back what was typed).
      const holder = await findCompanyByInternalCode(context, input.internalCode).catch(() => null);
      extra = `&code=${encodeURIComponent(input.internalCode.trim().toUpperCase())}`;
      if (holder) extra += `&holder=${encodeURIComponent(holder.id)}&holderName=${encodeURIComponent(holder.tradingName?.trim() || holder.legalName)}&holderStatus=${encodeURIComponent(holder.status)}`;
    }
    redirect(`/platform/companies/new?error=${encodeURIComponent(message)}${extra}`);
  }
  revalidatePath("/platform");
  redirect(`/platform/companies/${company.id}`);
}

export async function updateCompanyAction(formData: FormData) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const companyId = String(formData.get("companyId") ?? "");
  try {
    await updatePlatformCompany(context, companyId, {
      legalName: String(formData.get("legalName") ?? ""),
      tradingName: opt(formData, "tradingName"),
      defaultCurrencyCode: opt(formData, "defaultCurrencyCode"),
      defaultGracePeriodDays: optNum(formData, "defaultGracePeriodDays"),
      settings: settingsFromForm(formData),
      address: addressFromForm(formData),
    });
  } catch (error) {
    redirect(`/platform/companies/${companyId}?error=${encodeURIComponent(errorCode(error))}`);
  }
  revalidatePath("/platform");
  revalidatePath(`/platform/companies/${companyId}`);
  redirect(`/platform/companies/${companyId}?notice=saved`);
}

// 2026-10-16, user request: "in a company view, allow to add users from
// platform admin without having to go through support system".
export async function addCompanyUserAction(formData: FormData) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const companyId = String(formData.get("companyId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "");
  try {
    if (!Object.values(TenantRole).includes(roleRaw as TenantRole)) throw new Error("ROLE_NOT_ALLOWED");
    await createPlatformCompanyUser(context, companyId, {
      email,
      displayName: String(formData.get("displayName") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      role: roleRaw as TenantRole,
    });
  } catch (error) {
    redirect(`/platform/companies/${companyId}?userError=${encodeURIComponent(errorCode(error))}`);
  }
  revalidatePath(`/platform/companies/${companyId}`);
  redirect(`/platform/companies/${companyId}?userAdded=${encodeURIComponent(email)}`);
}

// 2026-10-16, user request: "add a delete company button next to the open
// button on the table". Permanent; see deletePlatformCompany.
export async function deleteCompanyAction(formData: FormData) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const companyId = String(formData.get("companyId") ?? "");
  let name = "";
  try {
    const deleted = await deletePlatformCompany(context, companyId, String(formData.get("confirmCode") ?? ""));
    name = deleted.legalName;
  } catch (error) {
    redirect(`/platform/companies?deleteError=${encodeURIComponent(errorCode(error))}`);
  }
  revalidatePath("/platform");
  revalidatePath("/platform/companies");
  redirect(`/platform/companies?deleted=${encodeURIComponent(name)}`);
}

// 2026-10-20, user request: "Add a reset company button which requires the user to
// type "Reset Company" ... once confirmed it resets/deletes all data". Keeps the
// company's setup and logins; see company-lifecycle-service.ts. `back` says which
// screen to return to (the companies table or the company's own page).
export async function resetCompanyAction(formData: FormData) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const companyId = String(formData.get("companyId") ?? "");
  const back = String(formData.get("back") ?? "list") === "detail" ? `/platform/companies/${companyId}` : "/platform/companies";
  let name = "";
  try {
    const done = await resetPlatformCompany(context, companyId, String(formData.get("confirmText") ?? ""));
    name = done.legalName;
  } catch (error) {
    redirect(`${back}?lifecycleError=${encodeURIComponent(errorCode(error))}`);
  }
  revalidatePath("/platform");
  revalidatePath("/platform/companies");
  revalidatePath(`/platform/companies/${companyId}`);
  redirect(`${back}?reset=${encodeURIComponent(name)}`);
}

// 2026-10-20, user request: "Add a clone button as well which creates a copy of the
// company and adds the words "- copy" to the end of the company name."
export async function cloneCompanyAction(formData: FormData) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const companyId = String(formData.get("companyId") ?? "");
  const back = String(formData.get("back") ?? "list") === "detail" ? `/platform/companies/${companyId}` : "/platform/companies";
  let created: Awaited<ReturnType<typeof clonePlatformCompany>>;
  try {
    created = await clonePlatformCompany(context, companyId);
  } catch (error) {
    redirect(`${back}?lifecycleError=${encodeURIComponent(errorCode(error))}`);
  }
  revalidatePath("/platform");
  revalidatePath("/platform/companies");
  redirect(`/platform/companies/${created.id}?cloned=1`);
}

export async function setCompanyStatusAction(formData: FormData) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const companyId = String(formData.get("companyId") ?? "");
  await setPlatformCompanyStatus(context, companyId, String(formData.get("status") ?? "ACTIVE") as "ACTIVE" | "SUSPENDED");
  revalidatePath("/platform");
  revalidatePath(`/platform/companies/${companyId}`);
}

// 2026-10-05 — storage options rework. These two return a result object
// instead of throwing so the Storage form (components/PlatformStorageForm.tsx)
// can show "Test connection" results and readable errors in place.
export type StorageActionResult = { ok: true; message?: string; steps?: StorageTestStep[] } | { ok: false; error: string; steps?: StorageTestStep[] };

function storageErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return STORAGE_ERROR_MESSAGES[code] ?? (error instanceof Error && error.name === "AuthorizationError" ? "You do not have permission to change storage settings." : "Something went wrong. Please try again.");
}

export async function saveCompanyStorageAction(companyId: string, input: StorageProfileInput & { acknowledgeExistingFiles?: boolean }): Promise<StorageActionResult> {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  try {
    await updatePlatformCompanyStorageProfile(context, companyId, input);
  } catch (error) {
    return { ok: false, error: storageErrorMessage(error) };
  }
  revalidatePath(`/platform/companies/${companyId}`);
  return { ok: true, message: input.provider === "" ? "This company now uses the platform default storage." : "Storage location saved." };
}

export async function testCompanyStorageAction(companyId: string, input: StorageProfileInput): Promise<StorageActionResult> {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  try {
    const result = await testPlatformCompanyStorage(context, companyId, input);
    return result.ok ? { ok: true, message: result.message, steps: result.steps } : { ok: false, error: result.message, steps: result.steps };
  } catch (error) {
    return { ok: false, error: storageErrorMessage(error) };
  }
}

// 2026-09-22 — createPlatformAuthorityAction/updatePlatformAuthorityAction
// removed from here: Platform Users (app/platform/users/page.tsx) is now a
// client table (PlatformUsersWorkspace.tsx) calling the new
// /api/v1/platform/users/authority[...] routes directly, so it can show
// errors (e.g. the new "can't grant an active company member platform
// authority" safeguard) inline instead of only via a full error page — see
// that route's own comment.