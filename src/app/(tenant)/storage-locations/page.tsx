import { MasterDataRoute } from "@/components/MasterDataRoute";
import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPageAccess } from "@/lib/auth/page-guard";

export default async function Page() {
  requireTenantPageAccess(await requireRequestContext(), "STORAGE_LOCATIONS_VIEW");
  return <MasterDataRoute kind="storage-locations" />;
}

