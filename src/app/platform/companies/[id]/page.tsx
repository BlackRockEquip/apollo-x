import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2, ShieldCheck } from "lucide-react";
import { getRequestContext } from "@/lib/auth/session";
import { getPlatformCompanyDetail } from "@/lib/platform/admin-service";
import { getCompanyIndustryBuild } from "@/lib/platform/industry-build-service";
import { PlatformIndustryBuild } from "@/components/PlatformIndustryBuild";
import { SupportContextForm } from "@/components/SupportContextForm";
import { addCompanyUserAction, setCompanyStatusAction, updateCompanyAction } from "@/app/platform/actions";
import { CompanyColourFields } from "@/components/CompanyColourFields";
import { tenantRoleLabelsFor, tenantRolesFor } from "@/lib/constants";
import { PlatformStorageForm } from "@/components/PlatformStorageForm";
import { ResetCompanyButton } from "@/components/ResetCompanyButton";
import { CloneCompanyButton } from "@/components/CloneCompanyButton";
import { countCompanyStoredFiles } from "@/lib/platform/storage-admin-service";
import { countInlineFiles } from "@/lib/attachments/offload";
import { accountIdFromR2Endpoint } from "@/lib/storage/profile";

type CompanyDetail = Awaited<ReturnType<typeof getPlatformCompanyDetail>>;
type Membership = CompanyDetail["memberships"][number];
type Ticket = CompanyDetail["supportTickets"][number];
type Audit = CompanyDetail["auditEvents"][number];

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_COLOUR: "One of the colours is not a valid hex colour (for example #155FCA). Nothing was saved.",
  BLACK_ROCK_PROTECTED: "Black Rock is protected and cannot be changed here.",
  NOT_ALLOWED: "You do not have permission to do that.",
  RESOURCE_NOT_FOUND: "That company no longer exists.",
  INVALID_USER_DETAILS: "Check the user details: a valid email, a name of at least 2 characters and a password of at least 8 characters.",
  ROLE_NOT_ALLOWED: "That role is not available for this company's industry build.",
  COMPANY_NOT_ACTIVE: "Users cannot be added while the company is deactivated.",
  PASSWORD_REQUIRED: "A password is required for a new user.",
  UNLICENSED_MODULE_REQUESTED: "The company has no licensed modules to give this user.",
  RESET_CONFIRM_MISMATCH: "The confirmation text did not match, so nothing was reset.",
  COMPANY_RESET_BLOCKED: "The company could not be reset because some of its records are still linked elsewhere. Nothing was changed.",
  DUPLICATE_INTERNAL_CODE: "A company with the copy's code already exists. Try again.",
};

export default async function PlatformCompanyDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  if (context.companyId) redirect("/dashboard");
  const { id } = await params;
  const sp = await searchParams;
  const pick = (key: string) => (typeof sp[key] === "string" ? (sp[key] as string) : "");
  const errorMessage = pick("error") ? (ERROR_MESSAGES[pick("error")] ?? "Unable to save the company.") : "";
  const userErrorMessage = pick("userError") ? (ERROR_MESSAGES[pick("userError")] ?? "Unable to add the user.") : "";
  const lifecycleErrorMessage = pick("lifecycleError") ? (ERROR_MESSAGES[pick("lifecycleError")] ?? "That could not be completed.") : "";
  const company = await getPlatformCompanyDetail(context, id);
  const industryBuild = await getCompanyIndustryBuild(context, company.id);
  const storageSummary = await countCompanyStoredFiles(company.id);
  const inlineFiles = await countInlineFiles(company.id);
  const activeUsers = company.memberships.filter((membership: Membership) => membership.status === "ACTIVE" && membership.user.active);
  const displayName = company.tradingName?.trim() || company.legalName;
  const roleLabels = tenantRoleLabelsFor(company.industryBuild);
  const allowedRoles = tenantRolesFor(company.industryBuild);
  const address = company.addresses[0];
  const admins = activeUsers.filter((membership: Membership) => membership.role === "COMPANY_ADMIN");

  return (
    <>
      <div className="platform-notice">
        <ShieldCheck size={20} />
        <div>
          <strong>Explicit support entry only</strong>
          <p>Platform authority does not silently impersonate tenant users or bypass licensing. Support mode must be explicit and audited.</p>
        </div>
      </div>

      <header className="page-header compact">
        <div>
          <Link href="/platform/companies" className="back-link"><ArrowLeft size={15} /> Back to companies</Link>
          <p className="eyebrow">Platform</p>
          <h1>{displayName}</h1>
          <p>{company.internalCode} · {company.status}</p>
        </div>
      </header>

      {errorMessage ? <div className="inline-error">{errorMessage}</div> : null}
      {pick("notice") === "saved" ? <div className="inline-success">Company saved.</div> : null}
      {pick("reset") ? <div className="inline-success">{pick("reset")} was reset. Its data is cleared; its setup and users are unchanged.</div> : null}
      {pick("cloned") ? <div className="inline-success">Company copied. This is the new company; it has the same setup but no users or data yet.</div> : null}
      {lifecycleErrorMessage ? <div className="inline-error">{lifecycleErrorMessage}</div> : null}

      <section className="platform-grid">
        <article className="platform-card">
          <h3>Overview</h3>
          <dl className="platform-detail-list">
            <div><dt>Legal name</dt><dd>{company.legalName}</dd></div>
            <div><dt>Status</dt><dd>{company.status}</dd></div>
            <div><dt>Created</dt><dd>{new Date(company.createdAt).toLocaleString("en-ZA")}</dd></div>
            <div><dt>Users</dt><dd>{activeUsers.length}</dd></div>
            <div><dt>Tenant admins</dt><dd>{admins.length}</dd></div>
            <div><dt>Support tickets</dt><dd>{company._count.supportTickets}</dd></div>
          </dl>
        </article>

        <article className="platform-card">
          <h3>Branding</h3>
          <div className="record-list">
            <article>
              <div className="record-icon"><Building2 size={14} /></div>
              <div>
                <strong>{company.settings?.logoMimeType ? "Custom logo uploaded" : "Default branding"}</strong>
                {company.settings?.themeColor ? <span>Primary {company.settings.themeColor}</span> : null}
                {company.settings?.accentColor ? <span className="muted small-line">Accent {company.settings.accentColor}</span> : null}
                {company.settings?.secondaryColor ? <span className="muted small-line">Sidebar {company.settings.secondaryColor}</span> : null}
                {company.settings?.backgroundColor ? <span className="muted small-line">Background {company.settings.backgroundColor}</span> : null}
              </div>
            </article>
          </div>
        </article>

        <article className="platform-card platform-card-span-2">
          <h3>Company management</h3>
          {company.blackRockIncluded ? <p className="platform-inline-note">Black Rock is protected: immutable code, internal included modules, and no normal UI action can suspend or rewrite its licensing basis.</p> : null}
          <form action={updateCompanyAction} className="platform-form-grid compact-top-gap">
            <input type="hidden" name="companyId" value={company.id} />
            <label><span>Legal name</span><input name="legalName" defaultValue={company.legalName} disabled={company.blackRockIncluded} /></label>
            <label><span>Trading name</span><input name="tradingName" defaultValue={company.tradingName ?? ""} disabled={company.blackRockIncluded} /></label>
            <label><span>Currency</span><input name="defaultCurrencyCode" defaultValue={company.settings?.defaultCurrencyCode ?? company.defaultCurrencyCode} disabled={company.blackRockIncluded} /></label>
            <label><span>Default tax jurisdiction</span><input name="defaultTaxJurisdiction" defaultValue={company.settings?.defaultTaxJurisdiction ?? "ZA"} disabled={company.blackRockIncluded} /></label>
            <label><span>Main email</span><input name="mainEmail" type="email" defaultValue={company.settings?.mainEmail ?? ""} disabled={company.blackRockIncluded} /></label>
            <label><span>Main telephone</span><input name="mainTelephone" defaultValue={company.settings?.mainTelephone ?? ""} disabled={company.blackRockIncluded} /></label>
            <label><span>Website</span><input name="website" defaultValue={company.settings?.website ?? ""} disabled={company.blackRockIncluded} /></label>
            <label><span>Registration number</span><input name="registrationNumber" defaultValue={company.settings?.registrationNumber ?? ""} disabled={company.blackRockIncluded} /></label>
            <label><span>VAT number</span><input name="vatNumber" defaultValue={company.settings?.vatNumber ?? ""} disabled={company.blackRockIncluded} /></label>
            <label><span>Quote validity (days)</span><input name="quoteValidityDays" type="number" min={0} defaultValue={company.settings?.quoteValidityDays ?? 30} disabled={company.blackRockIncluded} /></label>
            <label className="wide"><span>Address line 1</span><input name="addressLine1" defaultValue={address?.line1 ?? ""} disabled={company.blackRockIncluded} /></label>
            <label className="wide"><span>Address line 2</span><input name="addressLine2" defaultValue={address?.line2 ?? ""} disabled={company.blackRockIncluded} /></label>
            <label><span>City</span><input name="addressCity" defaultValue={address?.city ?? ""} disabled={company.blackRockIncluded} /></label>
            <label><span>Province</span><input name="addressProvince" defaultValue={address?.province ?? ""} disabled={company.blackRockIncluded} /></label>
            <label><span>Postal code</span><input name="addressPostalCode" defaultValue={address?.postalCode ?? ""} disabled={company.blackRockIncluded} /></label>
            <CompanyColourFields
              initial={{ themeColor: company.settings?.themeColor ?? "", accentColor: company.settings?.accentColor ?? "", secondaryColor: company.settings?.secondaryColor ?? "", backgroundColor: company.settings?.backgroundColor ?? "" }}
              companyName={displayName}
              disabled={company.blackRockIncluded}
            />
            <label className="wide"><span>Document header text</span><textarea name="documentHeaderText" rows={2} defaultValue={company.settings?.documentHeaderText ?? ""} disabled={company.blackRockIncluded} /></label>
            <label className="wide"><span>Document footer text</span><textarea name="documentFooterText" rows={2} defaultValue={company.settings?.documentFooterText ?? ""} disabled={company.blackRockIncluded} /></label>
            <div className="platform-form-actions"><button type="submit" className="primary-button" disabled={company.blackRockIncluded}>Save company</button></div>
          </form>
          {!company.blackRockIncluded && (
            <form action={setCompanyStatusAction} className="platform-form-grid compact-top-gap">
              <input type="hidden" name="companyId" value={company.id} />
              <label><span>Status</span><select name="status" defaultValue={company.status}><option value="ACTIVE">ACTIVE</option><option value="SUSPENDED">SUSPENDED</option></select></label>
              <div className="platform-form-actions"><button type="submit" className="quiet-button">Update status</button></div>
            </form>
          )}
        </article>

        <article className="platform-card platform-card-span-2">
          <h3>Storage location</h3>
          <p className="muted small-line">
            {company.settings?.storageProvider === "LOCAL_FOLDER"
              ? `Current: local folder on the server · ${company.settings.storageLocalPath}`
              : company.settings?.storageProvider
                ? `Current: ${company.settings.storageProvider === "R2" ? "Cloudflare R2" : company.settings.storageProvider} · ${company.settings.storageBucket}${company.settings.storageRegion ? ` (${company.settings.storageRegion})` : ""}`
                : "Current: the platform default bucket."}
            {" "}· {storageSummary.fileCount} stored file{storageSummary.fileCount === 1 ? "" : "s"}
          </p>
          <p className="muted small-line">Controls where this company&rsquo;s attached and system-created files (logos, attachments, future exports) are kept: not where its core records live, which always stay in the shared database. Pick an option to see its set-up guide.</p>
          <PlatformStorageForm
            companyId={company.id}
            fileCount={storageSummary.fileCount}
            totalBytes={storageSummary.totalBytes}
            inlineFiles={inlineFiles}
            initial={{
              provider: company.settings?.storageProvider ?? "",
              accountId: accountIdFromR2Endpoint(company.settings?.storageEndpoint),
              bucket: company.settings?.storageBucket ?? "",
              region: company.settings?.storageRegion ?? "",
              endpoint: company.settings?.storageEndpoint ?? "",
              accessKeyId: company.settings?.storageAccessKeyId ?? "",
              localPath: company.settings?.storageLocalPath ?? "",
              hasSecret: !!company.settings?.storageConfiguredAt && company.settings?.storageProvider !== "LOCAL_FOLDER",
            }}
          />
        </article>

        <article className="platform-card platform-card-span-2">
          <h3>Industry build</h3>
          <p className="muted small-line">{company.blackRockIncluded ? "Black Rock receives all Workshop modules through immutable internal policy, so this section is read-only." : company.entitlementSummary}</p>
          <PlatformIndustryBuild initial={industryBuild} />
        </article>

        <article className="platform-card">
          <h3>Users</h3>
          <div className="record-list">
            {company.memberships.map((membership: Membership) => (
              <article key={membership.id}>
                <div className="record-icon">U</div>
                <div>
                  <strong>{membership.user.displayName}</strong>
                  <span>{membership.user.email} · {roleLabels[membership.role] ?? membership.role} · {membership.status}</span>
                </div>
              </article>
            ))}
            {company.memberships.length === 0 && <div className="table-state compact-empty-state">No users on this company yet.</div>}
          </div>
          {userErrorMessage ? <div className="inline-error">{userErrorMessage}</div> : null}
          {pick("userAdded") ? <div className="inline-success">{pick("userAdded")} was added.</div> : null}
          {company.status === "ACTIVE" ? (
            <div className="compact-top-gap">
              <h4>Add user</h4>
              <p className="muted small-line">Creates a login for this company with every module switched on (the company licence still decides what can be used). Company admins cannot add or change users themselves - they contact Flo X, and users are managed here (use Manage users below to switch modules on or off for a user).</p>
              <form action={addCompanyUserAction} className="platform-form-grid compact-top-gap" data-testid="add-user-form">
                <input type="hidden" name="companyId" value={company.id} />
                <label><span>Name</span><input name="displayName" required minLength={2} /></label>
                <label><span>Email</span><input name="email" type="email" required /></label>
                <label><span>Password</span><input name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
                <label><span>Role</span>
                  <select name="role" defaultValue={allowedRoles.includes("COMPANY_ADMIN") ? "COMPANY_ADMIN" : allowedRoles[0]}>
                    {allowedRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                  </select>
                </label>
                <div className="platform-form-actions"><button type="submit" className="primary-button">Add user</button></div>
              </form>
              <p className="muted small-line">To edit, reset or remove existing users, open the company&rsquo;s Users screen under an audited read-write support session.</p>
              <SupportContextForm companyId={company.id} companyName={displayName} redirectTo="/users" defaultMode="READ_WRITE" actionLabel="Manage users" />
            </div>
          ) : (
            <p className="platform-inline-note">User management is unavailable while this company is deactivated.</p>
          )}
        </article>

        <article className="platform-card">
          <h3>Support</h3>
          <div className="record-list">
            {company.supportTickets.map((ticket: Ticket) => (
              <article key={ticket.id}>
                <div className="record-icon">SUP</div>
                <div>
                  <strong>{ticket.ticketNumber}</strong>
                  <span>{ticket.subject} · {ticket.priority} · {ticket.status}</span>
                </div>
                <Link href="/platform/support" className="table-action">Open</Link>
              </article>
            ))}
            {company.supportTickets.length === 0 && <div className="table-state compact-empty-state">No support tickets.</div>}
          </div>
        </article>

        <article className="platform-card platform-card-span-2">
          <h3>Audit</h3>
          <div className="history-list">
            {company.auditEvents.map((event: Audit) => (
              <article key={event.id}>
                <strong>{event.action.replaceAll("_", " ")}</strong>
                <span>{event.entityType} · {event.actor?.displayName || "System"}</span>
                <time>{new Date(event.occurredAt).toLocaleString("en-ZA")}</time>
              </article>
            ))}
          </div>
        </article>

        {!company.blackRockIncluded && (
          <article className="platform-card platform-card-span-2">
            <h3>Reset and clone</h3>
            <p className="muted small-line">Clone makes a new company called &ldquo;{displayName} - copy&rdquo; with the same build, modules, branding and settings, but no users or data. Reset deletes all of this company&rsquo;s data and puts it back to a fresh start; its users and setup stay.</p>
            <div className="platform-form-actions">
              <CloneCompanyButton companyId={company.id} companyName={displayName} back="detail" variant="page" />
              <ResetCompanyButton companyId={company.id} companyName={displayName} back="detail" variant="page" />
            </div>
          </article>
        )}

        <article className="platform-card platform-card-span-2">
          <h3>Enter support mode</h3>
          {company.status === "ACTIVE" ? <SupportContextForm companyId={company.id} companyName={displayName} compact={false} /> : <p className="platform-inline-note">Support entry is unavailable while this company is deactivated.</p>}
        </article>
      </section>
    </>
  );
}
