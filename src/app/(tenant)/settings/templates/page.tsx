import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPageAccess } from "@/lib/auth/page-guard";
import { SettingsTabNav } from "@/components/SettingsTabNav";
import { CompanyTemplatesForm } from "@/components/CompanyTemplatesForm";

export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantPageAccess(ctx, "COMPANY_SETTINGS_VIEW");
  // 2026-10-20: no longer tied to the RFQ module - the Jobs & WIP table email template lives here too; the supplier (RFQ) templates
  // are shown only when RFQs is on (see CompanyTemplatesForm).
  return <>
    <header className="page-header compact"><div><p className="eyebrow">Settings</p><h1>Templates</h1></div></header>
    <SettingsTabNav ctx={ctx} current="email-templates" />
    <CompanyTemplatesForm />
  </>;
}
