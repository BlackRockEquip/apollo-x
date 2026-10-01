import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPageAccess } from "@/lib/auth/page-guard";
import { SettingsTabNav } from "@/components/SettingsTabNav";
import { ImportExportWorkspace } from "@/components/ImportExportWorkspace";

export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantPageAccess(ctx, "SETTINGS_MANAGE");
  return <>
    <header className="page-header compact"><div><p className="eyebrow">Settings</p><h1>Import / Export</h1></div></header>
    <SettingsTabNav ctx={ctx} current="import-export" />
    <ImportExportWorkspace />
  </>;
}
