import { notFound } from "next/navigation";
import { MasterDataWorkspace } from "@/components/MasterDataWorkspace";
import { masterConfigs } from "@/lib/master-data/ui-config";
export function MasterDataRoute({ kind }: { kind: string }) {
  const config = masterConfigs[kind];
  if (!config) notFound();
  return <MasterDataWorkspace config={config} />;
}
