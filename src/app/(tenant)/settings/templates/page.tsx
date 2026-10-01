import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPageAccess } from "@/lib/auth/page-guard";
import { SettingsTabNav } from "@/components/SettingsTabNav";
import { CompanyTemplatesForm } from "@/components/CompanyTemplatesForm";

export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantPageAccess(ctx, "COMPANY_SETTINGS_VIEW");
  return <>
    <header className="page-header compact"><div><p className="eyebrow">Settings</p><h1>Templates</h1></div></header>
    <SettingsTabNav ctx={ctx} current="email-templates" />
    <CompanyTemplatesForm />
  </>;
}
