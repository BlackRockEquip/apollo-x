import { requireRequestContext } from "@/lib/auth/session";
import { SettingsTabNav } from "@/components/SettingsTabNav";
import { MasterDataRoute } from "@/components/MasterDataRoute";
import { masterConfigs } from "@/lib/master-data/ui-config";

const config = masterConfigs["numbering"];

// 2026-09-10 — see tax-codes/page.tsx for why this now renders its own
// heading above the tab bar instead of letting MasterDataWorkspace render
// one below it.
export default async function Page() {
  const ctx = await requireRequestContext();
  return <>
    <header className="page-header compact"><div><p className="eyebrow">Settings</p><h1>{config.title}</h1><p>{config.description}</p></div></header>
    <SettingsTabNav ctx={ctx} current="numbering" />
    <MasterDataRoute kind="numbering" hideHeader />
  </>;
}
