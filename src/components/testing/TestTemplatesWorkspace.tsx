"use client";

import "./testing.css";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { DEFAULT_COLUMN_LABELS, LAYOUT_LABELS, LIMIT_TYPE_LABELS, formatLimit, type TestClutchRow, type TestLayoutId, type TestLimit, type TestParameterRow } from "@/lib/testing/spec";
import { testingApi, type TemplateItem } from "./types";

type Draft = {
  id: string | null; name: string; machineModels: string; layout: TestLayoutId; inputRpm: string; labelA: string; labelB: string;
  parameters: TestParameterRow[]; clutchRows: TestClutchRow[]; active: boolean;
};

const blankLimit = (type: TestLimit["type"]): TestLimit => {
  switch (type) {
    case "PLUS_MINUS": return { type, nominal: 0, tol: 0 };
    case "MIN": return { type, min: 0 };
    case "MAX": return { type, max: 0 };
    case "RANGE": return { type, min: 0, max: 0 };
    case "BELOW_FIRST": return { type, amount: 0 };
    default: return { type } as TestLimit;
  }
};

const slug = (text: string, taken: string[]) => {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "row";
  let id = base; let n = 2;
  while (taken.includes(id)) id = `${base}-${n++}`;
  return id.slice(0, 60);
};

function draftOf(t: TemplateItem | null): Draft {
  return t
    ? { id: t.id, name: t.name, machineModels: t.machineModels.join(", "), layout: t.layout, inputRpm: t.inputRpm == null ? "" : String(t.inputRpm), labelA: t.labelA, labelB: t.labelB, parameters: t.parameters, clutchRows: t.clutchRows, active: t.active }
    : { id: null, name: "", machineModels: "", layout: "FORWARD_REVERSE", inputRpm: "", labelA: "Forward", labelB: "Reverse", parameters: [], clutchRows: [], active: true };
}

// Edits one limit: pick the kind, then the numbers it needs.
function LimitEditor({ value, onChange, allowBelowFirst }: { value: TestLimit | null; onChange: (next: TestLimit | null) => void; allowBelowFirst: boolean }) {
  const limit = value ?? { type: "NA" as const };
  const num = (v: string) => (v === "" || v === "-" ? 0 : Number(v.replace(",", ".")));
  const types = (Object.keys(LIMIT_TYPE_LABELS) as TestLimit["type"][]).filter((t) => allowBelowFirst || t !== "BELOW_FIRST");
  return (
    <div className="tr-limit-edit">
      <select aria-label="Limit type" value={limit.type} onChange={(e) => onChange(blankLimit(e.target.value as TestLimit["type"]))}>{types.map((t) => <option key={t} value={t}>{LIMIT_TYPE_LABELS[t]}</option>)}</select>
      {limit.type === "PLUS_MINUS" && <><input aria-label="Nominal" inputMode="decimal" defaultValue={limit.nominal} onBlur={(e) => onChange({ ...limit, nominal: num(e.target.value) })} /><span>±</span><input aria-label="Tolerance" inputMode="decimal" defaultValue={limit.tol} onBlur={(e) => onChange({ ...limit, tol: Math.abs(num(e.target.value)) })} /></>}
      {limit.type === "MIN" && <input aria-label="Minimum" inputMode="decimal" defaultValue={limit.min} onBlur={(e) => onChange({ ...limit, min: num(e.target.value) })} />}
      {limit.type === "MAX" && <input aria-label="Maximum" inputMode="decimal" defaultValue={limit.max} onBlur={(e) => onChange({ ...limit, max: num(e.target.value) })} />}
      {limit.type === "RANGE" && <><input aria-label="From" inputMode="decimal" defaultValue={limit.min} onBlur={(e) => onChange({ ...limit, min: num(e.target.value) })} /><span>to</span><input aria-label="To" inputMode="decimal" defaultValue={limit.max} onBlur={(e) => onChange({ ...limit, max: num(e.target.value) })} /></>}
      {limit.type === "BELOW_FIRST" && <><span>at most the first reading minus</span><input aria-label="Amount below" inputMode="decimal" defaultValue={limit.amount} onBlur={(e) => onChange({ ...limit, amount: Math.abs(num(e.target.value)) })} /></>}
    </div>
  );
}

export function TestTemplatesWorkspace() {
  const { confirm, dialog } = useConfirmDialog();
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await testingApi<{ items: TemplateItem[] }>("/api/v1/testing-templates?all=1")).items); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load spec templates."); }
    finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async resource load, same pattern as the other workspaces
  useEffect(() => { void load(); }, [load]);

  async function addStarters() {
    setError(""); setNote("");
    try {
      const { created } = await testingApi<{ created: string[] }>("/api/v1/testing-templates/starter", { method: "POST", body: {} });
      setNote(created.length ? `Added ${created.join(", ")}.` : "The starter templates are already there.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to add the starter templates."); }
  }

  async function save() {
    if (!draft) return;
    setSaving(true); setError(""); setNote("");
    const rpm = draft.inputRpm.trim() === "" ? null : Math.round(Number(draft.inputRpm));
    const body = {
      name: draft.name, machineModels: draft.machineModels.split(",").map((m) => m.trim()).filter(Boolean), layout: draft.layout, inputRpm: rpm != null && Number.isFinite(rpm) ? rpm : null,
      labelA: draft.labelA || "Forward", labelB: draft.labelB || "Reverse", parameters: draft.parameters, clutchRows: draft.clutchRows,
    };
    try {
      const saved = await testingApi<TemplateItem>(draft.id ? `/api/v1/testing-templates/${draft.id}` : "/api/v1/testing-templates", { method: draft.id ? "PUT" : "POST", body });
      setNote(`Saved ${saved.name}${draft.id ? `, revision ${saved.revision}` : ""}. Tests already started keep the limits they were started with.`);
      setDraft(draftOf(saved));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save the template."); }
    finally { setSaving(false); }
  }

  async function toggle(t: TemplateItem) {
    if (t.active && !(await confirm({ title: "Switch off this template?", message: `${t.name} will no longer be offered for new tests. Tests already done with it are not affected.`, confirmLabel: "Switch off", tone: "warning" }))) return;
    try {
      await testingApi(`/api/v1/testing-templates/${t.id}`, { method: "PATCH", body: { active: !t.active } });
      await load();
      setDraft((cur) => (cur && cur.id === t.id ? { ...cur, active: !t.active } : cur));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update the template."); }
  }

  const setLayout = (layout: TestLayoutId) => setDraft((d) => d && ({ ...d, layout, labelA: DEFAULT_COLUMN_LABELS[layout].a, labelB: DEFAULT_COLUMN_LABELS[layout].b }));
  const editing = draft ? items.find((t) => t.id === draft.id) : undefined;

  return (
    <div>
      {dialog}
      <header className="page-header compact">
        <div><p className="eyebrow">Testing</p><h1>Spec templates</h1><p>The readings and limits for each machine model. A test copies its template when it is started.</p></div>
        <div className="tr-bar">
          <Link href="/testing-reports" className="quiet-button"><ArrowLeft size={14} /> Testing Reports</Link>
          <button type="button" className="quiet-button" onClick={() => void addStarters()}>Add starter templates</button>
          <button type="button" className="gold-button" onClick={() => { setDraft(draftOf(null)); setNote(""); setError(""); }}><Plus size={15} /> New template</button>
        </div>
      </header>
      {error && <div className="inline-error" style={{ borderRadius: 8, marginBottom: 10 }}>{error}</div>}
      {note && <div className="inline-success" style={{ borderRadius: 8, marginBottom: 10 }}>{note}</div>}
      <div className="tr-tpl">
        <section className="tr-card">
          <header><div><h2>Templates</h2><p>{items.length} in total</p></div></header>
          {loading ? <div className="table-state"><Loader2 className="spin" size={18} /> Loading…</div> : (
            <div className="tr-tpl-list">
              {items.map((t) => (
                <button type="button" key={t.id} className="tr-tpl-item" aria-current={draft?.id === t.id} onClick={() => { setDraft(draftOf(t)); setNote(""); setError(""); }}>
                  <strong>{t.name}{!t.active && <span className="tr-sub"> (off)</span>}</strong>
                  <span>{t.machineModels.join(", ") || "No models listed"}</span>
                  <span>{LAYOUT_LABELS[t.layout]} · revision {t.revision} · {t.reportCount ?? 0} test{t.reportCount === 1 ? "" : "s"}</span>
                </button>
              ))}
              {items.length === 0 && <div className="tr-sub" style={{ padding: 10 }}>No templates yet. Use Add starter templates to load the 777D, R1700G and 120K to 160K sheets, then adjust them.</div>}
            </div>
          )}
        </section>

        {draft ? (
          <section className="tr-card">
            <header>
              <div><h2>{draft.id ? `Edit ${editing?.name ?? "template"}` : "New template"}</h2><p>{draft.id ? "Changing limits starts a new revision; old tests keep theirs." : "Fill in the readings, then save."}</p></div>
              <div className="tr-bar">
                {editing && <button type="button" className="quiet-button" onClick={() => void toggle(editing)}>{editing.active ? "Switch off" : "Switch on"}</button>}
                <button type="button" className="gold-button" disabled={saving || draft.name.trim().length < 2} onClick={() => void save()}>{saving ? "Saving…" : "Save template"}</button>
              </div>
            </header>
            <div className="tr-details">
              <label className="tr-field wide"><span>Template name</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. CAT 777D" /></label>
              <label className="tr-field wide"><span>Machine models (comma separated)</span><input value={draft.machineModels} onChange={(e) => setDraft({ ...draft, machineModels: e.target.value })} placeholder="e.g. 777D, 777E" /></label>
              <label className="tr-field wide"><span>Layout</span><select value={draft.layout} onChange={(e) => setLayout(e.target.value as TestLayoutId)}>{(Object.keys(LAYOUT_LABELS) as TestLayoutId[]).map((l) => <option key={l} value={l}>{LAYOUT_LABELS[l]}</option>)}</select></label>
              <label className="tr-field"><span>Input RPM</span><input inputMode="numeric" value={draft.inputRpm} onChange={(e) => setDraft({ ...draft, inputRpm: e.target.value.replace(/[^\d]/g, "") })} /></label>
              <label className="tr-field"><span>First column name</span><input value={draft.labelA} onChange={(e) => setDraft({ ...draft, labelA: e.target.value })} /></label>
              <label className="tr-field"><span>Second column name</span><input value={draft.labelB} onChange={(e) => setDraft({ ...draft, labelB: e.target.value })} /></label>
            </div>

            <div className="tr-section">
              <div className="tr-bar"><h3 className="tr-grow">Parameters (flows, pressures, supply)</h3><button type="button" className="quiet-button" onClick={() => setDraft({ ...draft, parameters: [...draft.parameters, { id: slug("parameter", draft.parameters.map((p) => p.id)), name: "", unit: "", limit: { type: "RECORD" } }] })}><Plus size={13} /> Add parameter</button></div>
              {draft.parameters.map((p, i) => (
                <div className="tr-edit-row" key={p.id}>
                  <input aria-label="Parameter name" placeholder="Name" value={p.name} onChange={(e) => setDraft({ ...draft, parameters: draft.parameters.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <input aria-label="Unit" placeholder="Unit" value={p.unit} onChange={(e) => setDraft({ ...draft, parameters: draft.parameters.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)) })} />
                  <LimitEditor key={`${p.id}-${p.limit.type}`} value={p.limit} allowBelowFirst={false} onChange={(limit) => setDraft({ ...draft, parameters: draft.parameters.map((x, j) => (j === i && limit ? { ...x, limit } : x)) })} />
                  <button type="button" className="tr-icon-btn" aria-label={`Remove ${p.name || "parameter"}`} onClick={() => setDraft({ ...draft, parameters: draft.parameters.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
                </div>
              ))}
              {draft.parameters.length === 0 && <div className="tr-sub">No parameters.</div>}
            </div>

            <div className="tr-section">
              <div className="tr-bar"><h3 className="tr-grow">Clutch rows ({draft.labelA} / {draft.labelB})</h3><button type="button" className="quiet-button" onClick={() => setDraft({ ...draft, clutchRows: [...draft.clutchRows, { id: slug("clutch", draft.clutchRows.map((c) => c.id)), name: "", a: { type: "NA" }, b: draft.layout === "P1_P2" ? { type: "NA" } : { type: "NA" } }] })}><Plus size={13} /> Add row</button></div>
              {draft.clutchRows.map((row, i) => (
                <div className="tr-clutch-row" key={row.id}>
                  <input aria-label="Clutch name" placeholder="e.g. 1st" value={row.name} onChange={(e) => setDraft({ ...draft, clutchRows: draft.clutchRows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <div><div className="tr-sub">{draft.labelA}</div><LimitEditor key={`${row.id}-a-${row.a?.type}`} value={row.a} allowBelowFirst={false} onChange={(a) => setDraft({ ...draft, clutchRows: draft.clutchRows.map((x, j) => (j === i ? { ...x, a } : x)) })} /></div>
                  <div><div className="tr-sub">{draft.labelB}</div><LimitEditor key={`${row.id}-b-${row.b?.type}`} value={row.b} allowBelowFirst={draft.layout === "P1_P2"} onChange={(b) => setDraft({ ...draft, clutchRows: draft.clutchRows.map((x, j) => (j === i ? { ...x, b } : x)) })} /></div>
                  <button type="button" className="tr-icon-btn" aria-label={`Remove ${row.name || "row"}`} onClick={() => setDraft({ ...draft, clutchRows: draft.clutchRows.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
                </div>
              ))}
              {draft.clutchRows.length === 0 && <div className="tr-sub">No clutch rows.</div>}
            </div>
            <div className="tr-section tr-sub">Preview: {draft.parameters.map((p) => `${p.name || "?"} ${formatLimit(p.limit)}`).join(" · ") || "no parameters"}</div>
          </section>
        ) : (
          <section className="tr-card"><div className="table-state">Pick a template on the left, or start a new one.</div></section>
        )}
      </div>
    </div>
  );
}
