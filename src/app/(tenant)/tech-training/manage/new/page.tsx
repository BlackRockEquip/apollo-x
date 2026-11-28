import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage, requireTenantPageAccess } from "@/lib/auth/page-guard";
import { AddMaterial } from "@/components/tech-training/AddMaterial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TECH_TRAINING");
  requireTenantPageAccess(ctx, "TRAINING_CONTENT_EDIT");
  return <AddMaterial />;
}
