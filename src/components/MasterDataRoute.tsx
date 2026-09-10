import { notFound } from "next/navigation";
import { MasterDataWorkspace } from "@/components/MasterDataWorkspace";
import { masterConfigs } from "@/lib/master-data/ui-config";
export function MasterDataRoute({ kind, hideHeader }: { kind: string; hideHeader?: boolean }) {
  const config = masterConfigs[kind];
  if (!config) notFound();
  return <MasterDataWorkspace config={config} hideHeader={hideHeader} />;
}
