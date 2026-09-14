import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2, ShieldCheck } from "lucide-react";
import { getRequestContext } from "@/lib/auth/session";
import { getPlatformCompanyDetail } from "@/lib/platform/admin-service";
import { MODULE_LABELS } from "@/lib/constants";
import { SupportContextForm } from "@/components/SupportContextForm";
import { setCompanyStatusAction, updateCompanyAction, updateCompanyStorageProfileAction, updateEntitlementAction } from "@/app/platform/actions";
import { EntitlementSource, EntitlementStatus, ModuleKey } from "@prisma/client";

type CompanyDetail = Awaited<ReturnType<typeof getPlatformCompanyDetail>>;
type Membership = CompanyDetail["memberships"][number];
type Entitlement = CompanyDetail["entitlements"][number];
type Ticket = CompanyDetail["supportTickets"][number];
type Audit = CompanyDetail["auditEvents"][number];

export const dynamic = "force-dynamic";

export default async function PlatformCompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  if (context.companyId) redirect("/dashboard");
  const { id } = await params;
  const company = await getPlatformCompanyDetail(context, id);
  const activeUsers = company.memberships.filter((membership: Membership) => membership.status === "ACTIVE" && membership.user.active);
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
          <h1>{company.tradingName ?? company.legalName}</h1>
          <p>{company.internalCode} · {company.status}</p>
        </div>
      </header>

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
            <label><span>Currency</span><input name="defaultCurrencyCode" defaultValue={company.defaultCurrencyCode} disabled={company.blackRockIncluded} /></label>
            <label><span>Theme colour</span><input name="themeColor" defaultValue={company.settings?.themeColor ?? ""} disabled={company.blackRockIncluded} /></label>
            <label><span>Accent colour</span><input name="accentColor" defaultValue={company.settings?.accentColor ?? ""} disabled={company.blackRockIncluded} /></label>
            <label><span>Secondary colour</span><input name="secondaryColor" defaultValue={company.settings?.secondaryColor ?? ""} disabled={company.blackRockIncluded} /></label>
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

        <article className="platform-card">
          <h3>Storage location</h3>
          <p className="muted small-line">
            {company.settings?.storageProvider
              ? `Custom: ${company.settings.storageProvider} · ${company.settings.storageBucket}${company.settings.storageRegion ? ` (${company.settings.storageRegion})` : ""}`
              : "Using the platform default bucket."}
          </p>
          <p className="muted small-line">Controls where this company's files (attachments, logos, future exports) are stored — not where its core records live, which always stays in the shared database.</p>
          <form action={updateCompanyStorageProfileAction} className="platform-form-grid compact-top-gap">
            <input type="hidden" name="companyId" value={company.id} />
            <label><span>Provider</span>
              <select name="provider" defaultValue={company.settings?.storageProvider ?? ""}>
                <option value="">Platform default</option>
                <option value="R2">Cloudflare R2</option>
                <option value="B2">Backblaze B2</option>
                <option value="S3_COMPATIBLE">Other S3-compatible</option>
              </select>
            </label>
            <label><span>Bucket</span><input name="bucket" defaultValue={company.settings?.storageBucket ?? ""} /></label>
            <label><span>Region</span><input name="region" defaultValue={company.settings?.storageRegion ?? ""} placeholder="auto" /></label>
            <label><span>Endpoint</span><input name="endpoint" defaultValue={company.settings?.storageEndpoint ?? ""} placeholder="Required for R2 / B2 / MinIO" /></label>
            <label><span>Access key ID</span><input name="accessKeyId" defaultValue={company.settings?.storageAccessKeyId ?? ""} /></label>
            <label><span>Secret access key</span><input name="secretAccessKey" type="password" placeholder={company.settings?.storageConfiguredAt ? "Unchanged" : ""} /></label>
            <div className="platform-form-actions"><button type="submit" className="quiet-button">Save storage location</button></div>
          </form>
        </article>

        <article className="platform-card platform-card-span-2">
          <h3>Modules / Licensing</h3>
          <p className="muted small-line">{company.blackRockIncluded ? "Black Rock receives all modules through immutable internal policy. Manual entitlement rows are informational only and normal UI edits are blocked." : company.entitlementSummary}</p>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Module</th><th>Status</th><th>Source</th><th>Effective</th><th>Expires</th></tr></thead>
              <tbody>
                {company.entitlements.map((row: Entitlement) => (
                  <tr key={row.module}>
                    <td>{MODULE_LABELS[row.module]}</td>
                    <td>{row.status}</td>
                    <td>{row.source}</td>
                    <td>{new Date(row.effectiveFrom).toLocaleDateString("en-ZA")}</td>
                    <td>{row.expiresAt ? new Date(row.expiresAt).toLocaleDateString("en-ZA") : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={updateEntitlementAction} className="platform-form-grid compact-top-gap">
            <input type="hidden" name="companyId" value={company.id} />
            <label><span>Module</span><select name="module" defaultValue={ModuleKey.DASHBOARD} disabled={company.blackRockIncluded}>{Object.values(ModuleKey).map((module) => <option key={module} value={module}>{MODULE_LABELS[module]}</option>)}</select></label>
            <label><span>Entitlement state</span><select name="status" defaultValue={EntitlementStatus.ACTIVE} disabled={company.blackRockIncluded}>{Object.values(EntitlementStatus).map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
            <label><span>Source</span><select name="source" defaultValue={EntitlementSource.MODULE} disabled={company.blackRockIncluded}>{Object.values(EntitlementSource).map((source) => <option key={source} value={source}>{source.replaceAll("_", " ")}</option>)}</select></label>
            <label><span>Effective from</span><input name="effectiveFrom" type="date" required /></label>
            <label><span>Expires</span><input name="expiresAt" type="date" /></label>
            <label className="wide"><span>Reason</span><textarea name="reason" rows={3} required minLength={6} /></label>
            <div className="platform-form-actions wide"><button type="submit" className="primary-button" disabled={company.blackRockIncluded}>Save entitlement</button></div>
          </form>
        </article>

        <article className="platform-card">
          <h3>Users</h3>
          <div className="record-list">
            {company.memberships.map((membership: Membership) => (
              <article key={membership.id}>
                <div className="record-icon">U</div>
                <div>
                  <strong>{membership.user.displayName}</strong>
                  <span>{membership.user.email} · {membership.role} · {membership.status}</span>
                </div>
              </article>
            ))}
            {company.memberships.length === 0 && <div className="table-state compact-empty-state">No users on this company yet.</div>}
          </div>
          {company.status === "ACTIVE" ? (
            <div className="compact-top-gap">
              <p className="muted small-line">Add, edit or deactivate this company&rsquo;s users (name, email, password, role, module access) from its own Users screen, under an audited support session.</p>
              <SupportContextForm companyId={company.id} companyName={company.tradingName ?? company.legalName} redirectTo="/users" defaultMode="READ_WRITE" actionLabel="Manage users" />
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

        <article className="platform-card platform-card-span-2">
          <h3>Enter support mode</h3>
          {company.status === "ACTIVE" ? <SupportContextForm companyId={company.id} companyName={company.tradingName ?? company.legalName} compact={false} /> : <p className="platform-inline-note">Support entry is unavailable while this company is deactivated.</p>}
        </article>
      </section>
    </>
  );
}
