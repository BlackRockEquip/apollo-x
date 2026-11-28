import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage, requireTenantPageAccess } from "@/lib/auth/page-guard";
import { VerifyView } from "@/components/tech-training/SmallViews";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ no?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TECH_TRAINING");
  requireTenantPageAccess(ctx, "TRAINING_VIEW");
  return <VerifyView initial={sp.no} />;
}
