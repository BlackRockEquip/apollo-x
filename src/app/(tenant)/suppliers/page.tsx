import { SuppliersTabNav } from "@/components/SuppliersTabNav";
import { MasterDataRoute } from "@/components/MasterDataRoute";
import { masterConfigs } from "@/lib/master-data/ui-config";

const config = masterConfigs["suppliers"];

// 2026-09-14 — the Suppliers list now sits behind a Suppliers/Outwork/RFQ
// tab bar (see SuppliersTabNav) at the user's request; this page renders
// its own heading above the tab bar the same way the Settings destinations
// do (see e.g. tax-codes/page.tsx), with MasterDataRoute's hideHeader
// stopping the master-data workspace from rendering its own internal one.
export default function Page() {
  return <>
    <header className="page-header compact"><div><p className="eyebrow">{config.eyebrow}</p><h1>{config.title}</h1><p>{config.description}</p></div></header>
    <SuppliersTabNav current="suppliers" />
    <MasterDataRoute kind="suppliers" hideHeader />
  </>;
}
