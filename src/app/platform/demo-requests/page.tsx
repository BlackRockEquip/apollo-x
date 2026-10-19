import Link from "next/link";
import { requireRequestContext } from "@/lib/auth/session";
import { countDemoRequests, listDemoRequests, type DemoRequestView } from "@/lib/platform/demo-requests-service";
import { DemoRequestsWorkspace } from "@/components/DemoRequestsWorkspace";

export const dynamic = "force-dynamic";

// 2026-10-19 — Platform > Demo Requests: enquiries from the landing page's "Request a demo" form. New ones sit under
// "New"; once dealt with they are moved to "History" (and can be moved back).
export default async function PlatformDemoRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireRequestContext();
  const sp = await searchParams;
  const view: DemoRequestView = sp.view === "history" ? "HISTORY" : "NEW";
  const [items, counts] = await Promise.all([listDemoRequests(ctx, view), countDemoRequests(ctx)]);
  const canEdit = ctx.platformPermissions.has("PLATFORM_SUPPORT_WRITE");
  return (
    <div>
      <header className="page-header compact">
        <div><p className="eyebrow">Platform</p><h1>Demo Requests</h1><p>People who asked for a demo through the Flo X website. Open one to read it, then move it to History when it has been dealt with.</p></div>
      </header>
      <nav className="settings-nav">
        <Link href="/platform/demo-requests" className={view === "NEW" ? "quiet-button active" : "quiet-button"}>New ({counts.newCount})</Link>
        <Link href="/platform/demo-requests?view=history" className={view === "HISTORY" ? "quiet-button active" : "quiet-button"}>History ({counts.historyCount})</Link>
      </nav>
      <DemoRequestsWorkspace key={view} view={view} items={items} canEdit={canEdit} />
    </div>
  );
}
