"use client";

import "./testing.css";
import { X } from "lucide-react";
import { LAYOUT_LABELS, formatLimit, type TestClutchRow, type TestLayoutId, type TestParameterRow } from "@/lib/testing/spec";

// What a template needs to be previewed. A saved template, or the draft being edited, fits it.
export type PreviewTemplate = {
  name: string; layout: TestLayoutId; revision?: number | null; machineModels: string[]; inputRpm: number | null; labelA: string; labelB: string;
  parameters: TestParameterRow[]; clutchRows: TestClutchRow[];
};

const limitText = (limit: Parameters<typeof formatLimit>[0] | null, labelA: string) => (!limit || limit.type === "NA" ? "N/A" : formatLimit(limit, labelA));

// A read-only look at a spec template as a blank test sheet: the readings a tester will be asked for and the limit on each.
export function TemplatePreview({ template, onClose }: { template: PreviewTemplate; onClose: () => void }) {
  const { parameters, clutchRows, labelA, labelB, layout } = template;
  const engaged = layout === "ENGAGED";
  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label={`Preview of ${template.name || "template"}`} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="form-drawer compact-dialog" style={{ maxWidth: 820 }}>
        <div className="tr-dialog">
          <div className="tr-bar">
            <div className="tr-grow">
              <h2>{template.name || "Untitled template"}</h2>
              <p className="tr-sub" style={{ margin: "3px 0 0" }}>
                Preview of the blank test sheet · {LAYOUT_LABELS[layout]}{template.revision ? ` · revision ${template.revision}` : ""}
                {template.machineModels.length > 0 ? ` · ${template.machineModels.join(", ")}` : ""}{template.inputRpm != null ? ` · ${template.inputRpm} RPM` : ""}
              </p>
            </div>
            <button type="button" className="tr-icon-btn" autoFocus aria-label="Close preview" onClick={onClose}><X size={15} /></button>
          </div>

          {parameters.length > 0 && (
            <section className="tr-card">
              <header><div><h2>Test data</h2><p>Each reading is checked against its limit as it is typed.</p></div></header>
              <div className="tr-table-wrap">
                <table className="tr-table">
                  <thead><tr><th>Reading</th><th>Limit</th><th style={{ width: 160 }}>Actual</th></tr></thead>
                  <tbody>
                    {parameters.map((p) => (
                      <tr key={p.id}>
                        <td className="tr-name">{p.name || "(no name)"}{p.unit ? <small> {p.unit}</small> : null}</td>
                        <td className="tr-limit">{p.limit.type === "RECORD" ? "Record only" : limitText(p.limit, labelA)}</td>
                        <td><span className="tr-sub">{p.limit.type === "NA" ? "Not tested" : "—"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {clutchRows.length > 0 && !engaged && (
            <section className="tr-card">
              <header><div><h2>Clutch pressures</h2><p>{labelA} and {labelB} for each clutch or gear.</p></div></header>
              <div className="tr-table-wrap">
                <table className="tr-table">
                  <thead><tr><th>Clutch</th><th>{labelA} limit</th><th className="tr-gap">{labelB} limit</th></tr></thead>
                  <tbody>
                    {clutchRows.map((row) => (
                      <tr key={row.id}>
                        <td className="tr-name">{row.name || "(no name)"}</td>
                        <td className="tr-limit">{limitText(row.a, labelA)}</td>
                        <td className="tr-limit tr-gap">{limitText(row.b, labelA)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {clutchRows.length > 0 && engaged && (
            <section className="tr-card">
              <header><div><h2>Clutch pressures</h2><p>Each gear lists only the clutches engaged in it.</p></div></header>
              <div className="tr-eng">
                {clutchRows.map((row) => {
                  const cells = row.cells ?? [];
                  return (
                    <div className="tr-eng-row" key={row.id}>
                      <div className="tr-eng-name"><strong>{row.name || "(no name)"}</strong><span className="tr-sub">{cells.length} clutch{cells.length === 1 ? "" : "es"}</span></div>
                      <div className="tr-eng-cells">
                        {cells.map((c) => (
                          <div className="tr-eng-cell" key={c.id}>
                            <div className="tr-eng-head"><b>{c.label}</b><span>{limitText(c.limit, labelA)}</span></div>
                            <span className="tr-sub">Actual: —</span>
                          </div>
                        ))}
                        {cells.length === 0 && <span className="tr-sub">No clutches engaged yet.</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {parameters.length === 0 && clutchRows.length === 0 && <div className="tr-sub">This template has no readings yet.</div>}
          <div className="tr-actions"><button type="button" className="gold-button" onClick={onClose}>Close</button></div>
        </div>
      </div>
    </div>
  );
}
