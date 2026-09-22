"use client";

/* eslint-disable react-hooks/set-state-in-effect -- async platform module loading intentionally mirrors existing workspace patterns */
import { useEffect, useState } from "react";
import { Info, Pencil, Plus, Trash2 } from "lucide-react";

// 2026-09-22, user request: "on modules menu -- make modules editable
// (Enable/disable/delete); also breakdown what this section is for a a
// admin person viewing it (so far I dont know what its for)." Moved out of
// app/platform/modules/page.tsx (was a thin default export doing everything
// inline) into its own component so the page.tsx file can stay a plain
// wrapper, matching how every other sizable admin screen in this app is
// structured (UsersWorkspace, StockLevelsWorkspace, etc.).
//
// What this screen actually is, for the next person who wonders the same
// thing the user just did: this is the Module Catalog
// (ModuleCatalogEntry — src/lib/platform/module-catalog-service.ts), a
// platform-wide REFERENCE list documenting every module across every
// product Apollo X might ever run (today: the real Workshop modules,
// seeded 1:1 from the ModuleKey enum; plus a few PLANNED placeholders for
// future products — Education, Medical, Accounting). Its own `status`
// field (Active/Inactive/Planned) and this Enable/Disable/Delete UI are
// documentation only — nothing here changes what any company can actually
// see or do (confirmed: ModuleCatalogEntry is read/written only by this
// file's own service, nowhere else in the codebase). The REAL per-company
// on/off switch is each company's own module entitlements, set on
// Platform > Companies > (a company) > Modules — that's
// CompanyModuleEntitlement, a completely separate table this catalog
// doesn't control. The explanatory banner below says this in-product too,
// not just in this comment.
type ModuleEntry = {
  id: string;
  code: string;
  moduleKey: string | null;
  name: string;
  description: string | null;
  category: string;
  status: string;
  version: string;
  route: string | null;
  assignableToTenants: boolean;
  userAssignable: boolean;
};

const BLANK_FORM = { code: "", moduleKey: "", name: "", description: "", category: "Workshop", status: "ACTIVE", version: "1.0.0", route: "", assignableToTenants: true, userAssignable: true, dependsOn: [] as string[] };

export function PlatformModulesWorkspace() {
  const [items, setItems] = useState<ModuleEntry[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_FORM);

  async function load() {
    const r = await fetch("/api/v1/platform/modules", { cache: "no-store" });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error?.message || "Unable to load modules.");
    setItems(b);
  }
  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : "Unable to load modules.")); }, []);

  function startEdit(item: ModuleEntry) {
    setEditingId(item.id);
    setNotice("");
    setError("");
    setForm({
      code: item.code, moduleKey: item.moduleKey || "", name: item.name, description: item.description || "",
      category: item.category, status: item.status, version: item.version, route: item.route || "",
      assignableToTenants: item.assignableToTenants, userAssignable: item.userAssignable, dependsOn: [],
    });
  }
  function resetForm() {
    setEditingId(null);
    setForm(BLANK_FORM);
  }

  async function saveModule() {
    setSaving(true); setError(""); setNotice("");
    try {
      const payload = { ...form, moduleKey: form.moduleKey || null };
      const r = editingId
        ? await fetch(`/api/v1/platform/modules/${editingId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/v1/platform/modules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || `Unable to ${editingId ? "update" : "create"} module.`);
      setNotice(editingId ? "Module updated." : "Module created.");
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Unable to ${editingId ? "update" : "create"} module.`);
    } finally {
      setSaving(false);
    }
  }

  // "Enable/disable" — flips ModuleCatalogStatus between ACTIVE and
  // INACTIVE. A PLANNED entry (not yet built) enables straight to ACTIVE,
  // same as any other toggle-on.
  async function toggleStatus(item: ModuleEntry) {
    setError(""); setNotice("");
    const nextStatus = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      const r = await fetch(`/api/v1/platform/modules/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || "Unable to update module status.");
      setNotice(`${item.name} ${nextStatus === "ACTIVE" ? "enabled" : "disabled"}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update module status.");
    }
  }

  async function deleteModule(item: ModuleEntry) {
    if (!window.confirm(`Delete "${item.name}" from the module catalog? This only removes the catalog listing/documentation — it does not affect any company's actual access.`)) return;
    setError(""); setNotice("");
    try {
      const r = await fetch(`/api/v1/platform/modules/${item.id}`, { method: "DELETE" });
      if (!r.ok) { const b = await r.json(); throw new Error(b.error?.message || "Unable to delete module."); }
      setNotice(`${item.name} deleted from the catalog.`);
      if (editingId === item.id) resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete module.");
    }
  }

  return (
    <div>
      <header className="page-header compact">
        <div>
          <p className="eyebrow">Platform</p>
          <h1>Modules</h1>
          <p>Register and manage module metadata, categories, dependencies and tenant assignment capability.</p>
        </div>
      </header>

      <div className="platform-notice">
        <Info size={20} />
        <div>
          <strong>What this page is</strong>
          <p>
            This is the <strong>module catalog</strong> — a platform-wide reference list documenting every module Apollo X
            has or plans to have (name, category, version, description, dependencies), across every product it might ever
            run — today that&apos;s the real Workshop modules, plus a few &quot;Planned&quot; placeholders for future
            products (Education, Medical, Accounting).
          </p>
          <p>
            Its Enable/Disable/Delete controls only change this documentation — they do <strong>not</strong> grant or
            revoke any company&apos;s actual access to a module. That&apos;s controlled separately, per company, under{" "}
            <strong>Platform &gt; Companies &gt; (a company) &gt; Modules</strong>.
          </p>
        </div>
      </div>

      {error ? <div className="inline-error">{error}</div> : null}
      {notice ? <div className="inline-success">{notice}</div> : null}

      <section className="detail-panel">
        <header>
          <div><h2>{editingId ? "Edit module" : "Register module"}</h2></div>
          <div className="header-actions">
            {editingId ? <button type="button" className="quiet-button" onClick={resetForm}>Cancel</button> : null}
            <button type="button" className="gold-button" disabled={saving || form.code.trim().length < 2 || form.name.trim().length < 2} onClick={() => void saveModule()}>
              <Plus size={14} /> {editingId ? "Save changes" : "Create"}
            </button>
          </div>
        </header>
        <div className="drawer-fields">
          <label><span>Internal code</span><input value={form.code} onChange={(e) => setForm((c) => ({ ...c, code: e.target.value.toUpperCase() }))} /></label>
          <label><span>Mapped ModuleKey (optional)</span><input value={form.moduleKey} onChange={(e) => setForm((c) => ({ ...c, moduleKey: e.target.value.toUpperCase() }))} /></label>
          <label><span>Name</span><input value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} /></label>
          <label><span>Category</span><input value={form.category} onChange={(e) => setForm((c) => ({ ...c, category: e.target.value }))} /></label>
          <label><span>Status</span><select value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="PLANNED">Planned</option></select></label>
          <label><span>Version</span><input value={form.version} onChange={(e) => setForm((c) => ({ ...c, version: e.target.value }))} /></label>
          <label><span>Route</span><input value={form.route} onChange={(e) => setForm((c) => ({ ...c, route: e.target.value }))} /></label>
          <label className="wide"><span>Description</span><textarea rows={3} value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} /></label>
        </div>
      </section>

      <section className="detail-panel">
        <header><div><h2>Module catalog</h2></div></header>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Module</th><th>Category</th><th>Status</th><th>Version</th><th>Route</th><th></th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong>{item.code ? <div className="muted small-line">{item.code}</div> : null}</td>
                  <td>{item.category}</td>
                  <td><span className={item.status === "ACTIVE" ? "status-pill" : "status-pill neutral"}>{item.status}</span></td>
                  <td>{item.version}</td>
                  <td>{item.route || ""}</td>
                  <td className="actions">
                    <button type="button" className="table-action" onClick={() => startEdit(item)}><Pencil size={13} /> Edit</button>
                    <button type="button" className="table-action" onClick={() => void toggleStatus(item)}>{item.status === "ACTIVE" ? "Disable" : "Enable"}</button>
                    <button type="button" className="table-action danger" onClick={() => void deleteModule(item)}><Trash2 size={13} /> Delete</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={6} className="table-state compact-empty-state">No modules found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
