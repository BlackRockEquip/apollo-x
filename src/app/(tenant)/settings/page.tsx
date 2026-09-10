import { requireRequestContext } from "@/lib/auth/session";
import { SettingsTabNav } from "@/components/SettingsTabNav";
import { CompanySettingsForm } from "@/components/CompanySettingsForm";

export default async function Page() {
  const ctx = await requireRequestContext();
  return <>
    <header className="page-header compact"><div><p className="eyebrow">Settings</p><h1>Company / Branding</h1></div></header>
    <SettingsTabNav ctx={ctx} current="company-settings" />
    <CompanySettingsForm />
  </>;
}
