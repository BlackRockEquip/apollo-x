import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPageAccess } from "@/lib/auth/page-guard";
import { DashboardWorkspace } from "@/components/DashboardWorkspace";

export const dynamic = "force-dynamic";

// 2026-10-01 — was a single "use client" default export with no guard at
// all (any authenticated tenant user could reach it, regardless of role).
// Split into this thin async server wrapper (the only place that can do a
// real redirect() before anything renders) + DashboardWorkspace.tsx (the
// unchanged client logic) — same shape as every other guarded page in this
// app. A role without DASHBOARD_VIEW, e.g. Mechanic, now gets redirected
// to a page they actually have, rather than an empty/erroring dashboard.
export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantPageAccess(ctx, "DASHBOARD_VIEW");
  return <DashboardWorkspace />;
}
