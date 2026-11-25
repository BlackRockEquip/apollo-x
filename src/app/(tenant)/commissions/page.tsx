import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage, requireTenantPageAccess } from "@/lib/auth/page-guard";
import { CommissionsWorkspace } from "@/components/commissions/CommissionsWorkspace";

export const dynamic = "force-dynamic";

// 2026-11-25: Commissions. Reached only by a Company Admin with the module switched on for the company and in their own user profile
// (session.ts denies the module for everyone else, so they are sent to their usual landing page instead).
export default async function CommissionsPage() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "COMMISSIONS");
  requireTenantPageAccess(ctx, "COMMISSIONS_VIEW");
  return <CommissionsWorkspace />;
}
