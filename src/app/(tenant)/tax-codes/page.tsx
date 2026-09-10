import { requireRequestContext } from "@/lib/auth/session";
import { SettingsTabNav } from "@/components/SettingsTabNav";
import { MasterDataRoute } from "@/components/MasterDataRoute";
import { masterConfigs } from "@/lib/master-data/ui-config";

const config = masterConfigs["tax-codes"];

// 2026-09-10 — this page now renders its own heading above the tab bar,
// same as every other Settings destination (Company/Branding, Dashboard,
// Users, Import/Export, Support) — it previously let MasterDataWorkspace
// render its own internal page-header, which put the tab bar above that
// heading instead of below it. MasterDataRoute's hideHeader prop stops
// that internal header from rendering (see MasterDataWorkspace.tsx).
export default async function Page() {
  const ctx = await requireRequestContext();
  return <>
    <header className="page-header compact"><div><p className="eyebrow">Settings</p><h1>{config.title}</h1><p>{config.description}</p></div></header>
    <SettingsTabNav ctx={ctx} current="tax-codes" />
    <MasterDataRoute kind="tax-codes" hideHeader />
  </>;
}
