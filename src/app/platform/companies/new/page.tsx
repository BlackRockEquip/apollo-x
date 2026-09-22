import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getRequestContext } from "@/lib/auth/session";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { createCompanyAction } from "@/app/platform/actions";

export const dynamic = "force-dynamic";

// 2026-09-22, user report: "when clicking add a company, it takes me to the
// overview menu, fix." This page IS the fix — the "Add Company" button on
// platform/companies/page.tsx used to link to "/platform?create=1", a
// query param nothing ever read; the Overview page has no create-company
// UI, so the link just landed there with no form. createCompanyAction
// (platform/actions.ts) already existed and already worked, it just had no
// form anywhere pointing at it. This page provides that form, mirroring
// the same fields the company detail page's own edit form already exposes
// (updateCompanyAction) plus the couple of create-only fields (internal
// code, default grace period) that page doesn't need since they're
// immutable/rarely-changed after creation. On success, createCompanyAction
// redirects straight to the new company's own detail page, where branding,
// storage location and module entitlements get configured next — this
// form only captures what's actually required to create the row.
const ERROR_MESSAGES: Record<string, string> = {
  INTERNAL_CODE_REQUIRED: "Internal code is required.",
  LEGAL_NAME_REQUIRED: "Legal name is required.",
  DUPLICATE_INTERNAL_CODE: "That internal code is already in use by another company — pick a different one.",
};

export default async function NewPlatformCompanyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  if (context.companyId) redirect("/dashboard");
  requirePlatformPermission(context, "PLATFORM_COMPANIES_CREATE");
  const sp = await searchParams;
  const errorCode = typeof sp.error === "string" ? sp.error : "";
  const errorMessage = errorCode ? (ERROR_MESSAGES[errorCode] ?? "Unable to create company.") : "";

  return (
    <>
      <header className="page-header compact">
        <div>
          <Link href="/platform/companies" className="back-link"><ArrowLeft size={15} /> Back to companies</Link>
          <p className="eyebrow">Platform</p>
          <h1>Add Company</h1>
          <p>Creates the company record. Branding, storage location and module entitlements are configured next, on the company&apos;s own page.</p>
        </div>
      </header>

      {errorMessage ? <div className="inline-error">{errorMessage}</div> : null}

      <section className="detail-panel">
        <header><div><h2>New company</h2></div></header>
        <form action={createCompanyAction} className="platform-form-grid compact-top-gap">
          <label><span>Internal code</span><input name="internalCode" required minLength={2} placeholder="e.g. ACME" /></label>
          <label><span>Legal name</span><input name="legalName" required /></label>
          <label><span>Trading name</span><input name="tradingName" placeholder="Defaults to legal name if left blank" /></label>
          <label><span>Currency</span><input name="defaultCurrencyCode" defaultValue="ZAR" /></label>
          <label><span>Default grace period (days)</span><input name="defaultGracePeriodDays" type="number" min={0} defaultValue={30} /></label>
          <label><span>Default tax jurisdiction</span><input name="defaultTaxJurisdiction" defaultValue="ZA" /></label>
          <label><span>Main email</span><input name="mainEmail" type="email" /></label>
          <label><span>Main telephone</span><input name="mainTelephone" /></label>
          <label><span>Website</span><input name="website" /></label>
          <label><span>Registration number</span><input name="registrationNumber" /></label>
          <label><span>VAT number</span><input name="vatNumber" /></label>
          <label><span>Quote validity (days)</span><input name="quoteValidityDays" type="number" min={0} defaultValue={30} /></label>
          <label className="wide"><span>Document header text</span><textarea name="documentHeaderText" rows={2} /></label>
          <label className="wide"><span>Document footer text</span><textarea name="documentFooterText" rows={2} /></label>
          <div className="platform-form-actions wide"><button type="submit" className="primary-button">Create company</button></div>
        </form>
      </section>
    </>
  );
}
