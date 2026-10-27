import { notFound } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/session";
import { BroadcastsWorkspace } from "@/components/BroadcastsWorkspace";

export const dynamic = "force-dynamic";

// 2026-10-27, user request: "add functionality to do broadcast message throughout the platform to all companies, specific
// companies, specific users". Platform configuration permission only (same as Advertising).
export default async function PlatformBroadcastsPage() {
  const ctx = await requireRequestContext();
  if (!ctx.platformPermissions.has("PLATFORM_CONFIGURATION_MANAGE")) notFound();
  return (
    <div>
      <header className="page-header compact">
        <div><p className="eyebrow">Platform</p><h1>Broadcasts</h1><p>Send a message that pops up inside the app for every company, chosen companies or chosen users. Each one is logged, and you can see how many people have read it.</p></div>
      </header>
      <BroadcastsWorkspace />
    </div>
  );
}
