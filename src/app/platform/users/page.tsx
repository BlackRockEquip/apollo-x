import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/session";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { PlatformUsersWorkspace } from "@/components/PlatformUsersWorkspace";

export const dynamic = "force-dynamic";

export default async function PlatformUsersPage() {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  if (context.companyId) redirect("/dashboard");
  requirePlatformPermission(context, "PLATFORM_OPERATORS_MANAGE");
  return (
    <>
      <header className="page-header compact">
        <div>
          <p className="eyebrow">Platform</p>
          <h1>Platform Users</h1>
          <p>Grant, review and edit platform-wide operator authority.</p>
        </div>
      </header>
      <PlatformUsersWorkspace />
    </>
  );
}
