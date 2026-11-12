import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage } from "@/lib/auth/page-guard";
import { requireTenantPermission } from "@/lib/auth/guards";
import { TestingComingSoon } from "@/components/testing/TestingComingSoon";

export const dynamic = "force-dynamic";

export default async function TestingBrakesPage() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TESTING_REPORTS");
  requireTenantPermission(ctx, "TESTING_VIEW");
  return <TestingComingSoon kind="brakes" blurb="Brake test sheets, checked against the spec for each brake." />;
}
