import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantModulePage } from "@/lib/auth/page-guard";
import { requireTenantPermission } from "@/lib/auth/guards";
import { TestTemplatesWorkspace } from "@/components/testing/TestTemplatesWorkspace";

export const dynamic = "force-dynamic";

// Spec limits can only be changed by Admins and Managers (TESTING_MANAGE); a Testing Technician does not get this page.
export default async function TestTemplatesPage() {
  const ctx = await requireRequestContext();
  requireTenantModulePage(ctx, "TESTING_REPORTS");
  requireTenantPermission(ctx, "TESTING_MANAGE");
  return <TestTemplatesWorkspace />;
}
