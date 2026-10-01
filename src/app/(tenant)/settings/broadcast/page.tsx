import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPageAccess } from "@/lib/auth/page-guard";
import { SettingsTabNav } from "@/components/SettingsTabNav";
import { BroadcastComposer } from "@/components/BroadcastComposer";

// 2026-10-01 — user request: "Move broadcast section to its own label under
// Settings." Previously a third tab inside UsersWorkspace.tsx (see
// UsersWorkspace.tsx and BroadcastComposer.tsx); now its own Settings nav
// destination (see settings-nav.ts's "broadcast" entry).
export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantPageAccess(ctx, "USERS_MANAGE");
  return <>
    <header className="page-header compact"><div><p className="eyebrow">Settings</p><h1>Broadcast message</h1><p>Send a message to all users, or specific ones, as a popup banner.</p></div></header>
    <SettingsTabNav ctx={ctx} current="broadcast" />
    <BroadcastComposer />
  </>;
}
