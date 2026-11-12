import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage } from "@/lib/auth/page-guard";
import { requireTenantPermission } from "@/lib/auth/guards";
import { TestingComingSoon } from "@/components/testing/TestingComingSoon";

export const dynamic = "force-dynamic";

export default async function TestingTorqueConvertersPage() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TESTING_REPORTS");
  requireTenantPermission(ctx, "TESTING_VIEW");
  return <TestingComingSoon kind="torque-converters" blurb="Torque converter test sheets, checked against the spec for each converter." />;
}
