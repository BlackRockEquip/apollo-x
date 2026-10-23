import { notFound } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/session";
import { AdvertisingWorkspace } from "@/components/AdvertisingWorkspace";

export const dynamic = "force-dynamic";

// 2026-10-23, user request: "build on platform admin sidebar a menu called advertising, that lets me select +-10 timeslots per ad".
// Supplier ads shown above the Reports pane in every company's sidebar (Flo X's own card when none is running). Platform
// configuration permission only.
export default async function PlatformAdvertisingPage() {
  const ctx = await requireRequestContext();
  if (!ctx.platformPermissions.has("PLATFORM_CONFIGURATION_MANAGE")) notFound();
  return (
    <div>
      <header className="page-header compact">
        <div><p className="eyebrow">Platform</p><h1>Advertising</h1><p>Promote suppliers in every company&rsquo;s sidebar, above Reports. Give each ad up to 10 timeslots and choose which companies see it. When no ad is running, companies see the Flo X card.</p></div>
      </header>
      <AdvertisingWorkspace />
    </div>
  );
}
