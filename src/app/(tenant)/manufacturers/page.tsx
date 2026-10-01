import { MasterDataRoute } from "@/components/MasterDataRoute";
import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPageAccess } from "@/lib/auth/page-guard";

export default async function Page() {
  requireTenantPageAccess(await requireRequestContext(), "MANUFACTURERS_VIEW");
  return <MasterDataRoute kind="manufacturers" />;
}

