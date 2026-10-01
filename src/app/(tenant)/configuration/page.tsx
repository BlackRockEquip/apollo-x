import { requireRequestContext } from "@/lib/auth/session";
import { requireAnyTenantPageAccess } from "@/lib/auth/page-guard";
import { SettingsTabNav } from "@/components/SettingsTabNav";
import { ConfigurationWorkspace, type ConfigurationTab } from "@/components/ConfigurationWorkspace";
import { masterConfigs } from "@/lib/master-data/ui-config";
import type { TenantPermission } from "@/lib/auth/permissions";

// 2026-10-01 — user request: "Move Tax codes, Commercial Terms, Numbering
// all under one menu button separate tabs." Was three separate top-level
// settings pages/routes (tax-codes, commercial-terms, numbering — now kept
// as redirects, see each page.tsx) with three separate sidebar entries;
// collapsed into this one page with an internal tab strip
// (ConfigurationWorkspace.tsx), matching settings-nav.ts's single
// "configuration" item. Each former page had its own gating permission, so
// rather than pick one, this page lets the viewer through if they hold ANY
// of the three (requireAnyTenantPageAccess) and only hands
// ConfigurationWorkspace the specific tabs they actually have the
// permission for — a role with only TAX_CODES_VIEW sees just that one tab,
// not a tab strip with two dead entries.
const CONFIG_TABS: Array<{ kind: ConfigurationTab["kind"]; permission: TenantPermission }> = [
  { kind: "tax-codes", permission: "TAX_CODES_VIEW" },
  { kind: "commercial-terms", permission: "COMMERCIAL_TERMS_VIEW" },
  { kind: "numbering", permission: "NUMBERING_VIEW" },
];

export default async function Page() {
  const ctx = await requireRequestContext();
  requireAnyTenantPageAccess(ctx, CONFIG_TABS.map((t) => t.permission));
  const tabs: ConfigurationTab[] = CONFIG_TABS.filter((t) => ctx.tenantPermissions.has(t.permission)).map((t) => ({ kind: t.kind, label: masterConfigs[t.kind].title }));
  return <>
    <header className="page-header compact"><div><p className="eyebrow">Settings</p><h1>Configuration</h1><p>Tax codes, commercial terms and document numbering.</p></div></header>
    <SettingsTabNav ctx={ctx} current="configuration" />
    <ConfigurationWorkspace tabs={tabs} />
  </>;
}
