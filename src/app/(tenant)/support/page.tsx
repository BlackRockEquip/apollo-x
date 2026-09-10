import { requireRequestContext } from "@/lib/auth/session";
import { SettingsTabNav } from "@/components/SettingsTabNav";
import { SupportWorkspace } from "@/components/SupportWorkspace";

export default async function Page() {
  const ctx = await requireRequestContext();
  return <div>
    <header className="page-header compact"><div><p className="eyebrow">Settings</p><h1>Support</h1><p>Log an issue and track replies without leaving your tenant workspace.</p></div></header>
    <SettingsTabNav ctx={ctx} current="support" />
    <SupportWorkspace />
  </div>;
}
