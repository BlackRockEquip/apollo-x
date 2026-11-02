import { requireRequestContext } from "@/lib/auth/session";
import { requireTenantPageAccess } from "@/lib/auth/page-guard";
import { SettingsTabNav } from "@/components/SettingsTabNav";
import { StorageFolderBrowser } from "@/components/StorageFolderBrowser";

// 2026-11-02, user request: "is there a way to view what is on the server folders?" - the company's whole storage location: a folder
// per job, RFQs, Support and Company. (A single job's folder opens from the job page's View folder button.)
export default async function Page() {
  const ctx = await requireRequestContext();
  requireTenantPageAccess(ctx, "COMPANY_SETTINGS_VIEW");
  return <>
    <header className="page-header compact"><div><p className="eyebrow">Settings</p><h1>Files</h1></div></header>
    <SettingsTabNav ctx={ctx} current="files" />
    <section className="detail-panel" style={{ margin: 20 }}>
      <header><div><h2>Folders on the server</h2><p>Everything Apollo X has filed for your company - one folder per job, plus RFQs, Support and Company. Open a file to view or download it.</p></div></header>
      <div style={{ padding: 16 }}><StorageFolderBrowser scope={{ kind: "company" }} rootLabel="All folders" /></div>
    </section>
  </>;
}
