import { MasterDataRoute } from "@/components/MasterDataRoute";
import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPageAccess, requireTenantModulePage } from "@/lib/auth/page-guard";

export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantPageAccess(ctx, "STORAGE_LOCATIONS_VIEW");
  requireTenantModulePage(ctx, "STORAGE");
  return <MasterDataRoute kind="storage-locations" />;
}

