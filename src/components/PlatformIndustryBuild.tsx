"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { tileWorking, type IndustryBuildId } from "@/lib/builds/definitions";
import type { CompanyIndustryBuildState, TileLicensing, TileState } from "@/lib/platform/industry-build-service";

// 2026-10-16 — Platform > Companies > company > Industry build. Replaces the old
// "Modules / Licensing" table + one-module-at-a-time form. Pick the company's
// build from the dropdown, click a module to activate or deactivate it, open a
// module's Licensing to set its state / source / dates (trials, expiry), then
// Save: the whole tab is sent in one request and applied in one transaction
// (see src/lib/platform/industry-build-service.ts).

const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", SCHEDULED: "Scheduled", GRACE_READ_ONLY: "Grace read-only", EXPIRED: "Expired", SUSPENDED: "Suspended" };
const SOURCE_LABEL: Record<string, string> = { INTERNAL_FREE: "Internal free", PLAN: "Plan", BUNDLE: "Bundle", MODULE: "Module", TRIAL: "Trial", PLATFORM_OVERRIDE: "Platform override" };

type Draft = Record<string, TileState>;

function sameDraft(a: Draft, b: Draft, tileIds: string[]) {
  return tileIds.every((id) => {
    const x = a[id];
    const y = b[id];
    if (!x || !y) return x === y;
    return x.active === y.active && x.licensing.status === y.licensing.status && x.licensing.source === y.licensing.source && x.licensing.effectiveFrom === y.licensing.effectiveFrom && (x.licensing.expiresAt ?? null) === (y.licensing.expiresAt ?? null);
  });
}

export function PlatformIndustryBuild({ initial }: { initial: CompanyIndustryBuildState }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [saved, setSaved] = useState(initial);
  const [build, setBuild] = useState<IndustryBuildId>(initial.build);
  const [draft, setDraft] = useState<Draft>(initial.tiles);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const def = saved.builds.find((b) => b.id === build)!;
  const savedDef = saved.builds.find((b) => b.id === saved.build)!;
  const locked = saved.protected;
  const tileIds = def.tiles.map((t) => t.id);

  const working = (tileId: string) => tileWorking(build, tileId, (id) => Boolean(draft[id]?.active));
  const missing = (tile: (typeof def.tiles)[number]) => tile.requires.filter((id) => !working(id)).map((id) => def.tiles.find((t) => t.id === id)?.label ?? id);
  const activeCount = def.tiles.filter((t) => working(t.id)).length;

  const buildChanged = build !== saved.build;
  const dirty = buildChanged || !sameDraft(draft, saved.tiles, tileIds);
  // Modules that are switched on today but not offered by the chosen build.
  const droppedTiles = useMemo(
    () => savedDef.tiles.filter((t) => !def.tiles.some((d) => d.id === t.id) && saved.tiles[t.id]?.active).map((t) => t.label),
    [savedDef, def, saved.tiles],
  );
  const deactivated = def.tiles.filter((t) => !t.core && saved.tiles[t.id]?.active && !draft[t.id]?.active).map((t) => t.label);

  function setTile(tileId: string, patch: Partial<TileState>) {
    setDraft((cur) => ({ ...cur, [tileId]: { ...cur[tileId], ...patch } }));
    setMessage("");
  }
  function setLicensing(tileId: string, patch: Partial<TileLicensing>) {
    setDraft((cur) => ({ ...cur, [tileId]: { ...cur[tileId], licensing: { ...cur[tileId].licensing, ...patch } } }));
    setMessage("");
  }
  function setAll(active: boolean) {
    setDraft((cur) => {
      const next = { ...cur };
      for (const tile of def.tiles) if (!tile.core) next[tile.id] = { ...next[tile.id], active };
      return next;
    });
    setMessage("");
  }

  async function save() {
    if (!dirty || busy) return;
    const lines: string[] = [];
    if (buildChanged) lines.push(`Switch from ${savedDef.label} to ${def.label}.`);
    if (droppedTiles.length) lines.push(`These modules are not part of the ${def.label} build and will be switched off: ${droppedTiles.join(", ")}.`);
    if (deactivated.length) lines.push(`Deactivating: ${deactivated.join(", ")}.`);
    if (lines.length) {
      const ok = await confirm({
        message: `${lines.join(" ")} Existing records are kept; the modules are just hidden for every user of this company.`,
        tone: droppedTiles.length || deactivated.length ? "warning" : "neutral",
        confirmLabel: buildChanged ? `Apply ${def.label}` : "Save modules",
      });
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const tiles: Record<string, { active: boolean; licensing?: TileLicensing }> = {};
      for (const tile of def.tiles) {
        const state = draft[tile.id];
        tiles[tile.id] = tile.core ? { active: true } : { active: state.active, licensing: state.active ? state.licensing : undefined };
      }
      const response = await fetch(`/api/v1/platform/companies/${saved.companyId}/industry-build`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ build, tiles }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error?.message ?? "The change could not be saved.");
        return;
      }
      const next = body.state as CompanyIndustryBuildState;
      setSaved(next);
      setBuild(next.build);
      setDraft(next.tiles);
      setMessage(buildChanged ? `Now on the ${def.label} build.` : "Modules saved.");
      router.refresh();
    } catch {
      setError("The change could not be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const border = "1px solid var(--ink-150)";
  const field: React.CSSProperties = { height: 34, padding: "0 8px", border: "1px solid var(--ink-300)", borderRadius: 6, background: "var(--surface)", color: "var(--ink-900)", fontSize: 13 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {dialog}
      {locked ? <p className="platform-inline-note">Black Rock is protected: its modules come from an internal policy, so this section is read-only.</p> : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 28px", alignItems: "flex-start" }}>
        <div style={{ flex: "0 1 340px", minWidth: 240, display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="industry-build-select" style={{ fontWeight: 650 }}>Choose a build</label>
          <select id="industry-build-select" value={build} disabled={locked || busy} onChange={(event) => { setBuild(event.target.value as IndustryBuildId); setMessage(""); }} style={{ ...field, height: 40, fontSize: 14 }}>
            {saved.builds.map((b) => <option key={b.id} value={b.id}>{b.label}{b.id === saved.build ? " (current)" : ""}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <strong>{def.label}{build === saved.build ? <span className="status-pill neutral" style={{ marginLeft: 8 }}>Current</span> : null}</strong>
          <span className="muted small-line">{def.description}</span>
          <span className="muted small-line">{activeCount} of {def.tiles.length} modules active</span>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
        <span className="muted small-line">Click a module to activate or deactivate it for this company. Core modules are always active.</span>
        {!locked ? (
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" className="quiet-button" onClick={() => setAll(true)} disabled={busy}>Activate all</button>
            <button type="button" className="quiet-button" onClick={() => setAll(false)} disabled={busy}>Deactivate all</button>
          </span>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, alignItems: "start" }}>
        {def.tiles.map((tile) => {
          const state = draft[tile.id];
          const on = working(tile.id);
          const ownOn = tile.core || state.active;
          const need = missing(tile);
          const blocked = ownOn && !on;
          const lic = state.licensing;
          const trialNoDate = lic.source === "TRIAL" && !lic.expiresAt;
          const bad = lic.status === "EXPIRED" || lic.status === "SUSPENDED";
          const disabled = locked || tile.core || blocked || busy;
          const tone = tile.core ? { border: "1px solid var(--ink-300)", bg: "var(--ink-100)", box: "var(--ink-500)" }
            : blocked ? { border: "1px dashed var(--danger)", bg: "#fffaf0", box: "var(--danger)" }
            : on ? { border: "2px solid var(--blue-700)", bg: "var(--blue-100)", box: "var(--blue-700)" }
            : { border: "1px dashed var(--ink-300)", bg: "var(--surface)", box: "var(--ink-300)" };
          const stateText = tile.core ? "Core – always active" : blocked ? `Inactive – requires ${need.join(" and ")}` : on ? "Active" : "Inactive";
          return (
            <div key={tile.id} style={{ border: tone.border, background: tone.bg, borderRadius: 8, display: "flex", flexDirection: "column" }}>
              <button type="button" disabled={disabled} aria-pressed={on} onClick={() => setTile(tile.id, { active: !state.active })} style={{ textAlign: "left", cursor: disabled ? "default" : "pointer", background: "transparent", border: 0, borderRadius: 8, padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start", color: "var(--ink-900)" }}>
                <span style={{ flex: "0 0 20px", width: 20, height: 20, borderRadius: 4, marginTop: 1, border: `2px solid ${tone.box}`, background: on || tile.core ? tone.box : "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
                  {tile.core ? <Lock size={11} /> : on ? <Check size={13} strokeWidth={3} /> : null}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <strong style={{ fontSize: 14, fontWeight: 600 }}>{tile.label}</strong>
                  <span style={{ fontSize: 12, color: "var(--ink-500)" }}>{tile.note}</span>
                  <span style={{ fontSize: 12, fontWeight: 650, color: blocked ? "var(--danger)" : on ? "var(--blue-700)" : "var(--ink-500)" }}>{stateText}</span>
                </span>
              </button>
              {blocked ? (
                <div style={{ padding: "0 12px 10px 42px", fontSize: 12, color: "var(--danger)" }}>Your choice is kept and comes back when {need.join(" and ")} {need.length > 1 ? "are" : "is"} active.</div>
              ) : null}
              {on && !tile.core ? (
                <div style={{ padding: "0 12px 10px 42px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: 12, lineHeight: 1.4, color: bad || trialNoDate ? "var(--danger)" : "var(--ink-500)" }}>
                    {SOURCE_LABEL[lic.source]} · {STATUS_LABEL[lic.status]} · {lic.expiresAt ? `expires ${lic.expiresAt}` : "no expiry"}{trialNoDate ? " – set an expiry date for this trial" : ""}
                  </span>
                  {!locked ? <button type="button" className="quiet-button" style={{ alignSelf: "flex-start" }} aria-expanded={Boolean(open[tile.id])} onClick={() => setOpen((cur) => ({ ...cur, [tile.id]: !cur[tile.id] }))}>{open[tile.id] ? "Hide licensing" : "Licensing"}</button> : null}
                  {open[tile.id] && !locked ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: "var(--ink-500)" }}>State
                        <select value={lic.status} onChange={(event) => setLicensing(tile.id, { status: event.target.value as TileLicensing["status"] })} style={field}>
                          {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: "var(--ink-500)" }}>Source
                        <select value={lic.source} onChange={(event) => setLicensing(tile.id, { source: event.target.value as TileLicensing["source"] })} style={field}>
                          {Object.entries(SOURCE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: "var(--ink-500)" }}>Effective from
                        <input type="date" value={lic.effectiveFrom} onChange={(event) => event.target.value && setLicensing(tile.id, { effectiveFrom: event.target.value })} style={field} />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: "var(--ink-500)" }}>Expires (leave empty for no expiry)
                        <input type="date" value={lic.expiresAt ?? ""} onChange={(event) => setLicensing(tile.id, { expiresAt: event.target.value || null })} style={field} />
                      </label>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {tile.core ? <div style={{ padding: "0 12px 10px 42px", fontSize: 12, color: "var(--ink-500)" }}>Included in every company.</div> : null}
            </div>
          );
        })}
      </div>

      {buildChanged && droppedTiles.length ? (
        <p className="platform-inline-note">Switching to {def.label} switches off: {droppedTiles.join(", ")}. Their data is kept.</p>
      ) : null}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      {message ? <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--success)" }}>{message}</p> : null}

      {!locked ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 10, borderTop: border }}>
          <button type="button" className="primary-button" style={{ padding: "0 18px" }} disabled={!dirty || busy} onClick={() => void save()}>
            {busy ? "Saving…" : buildChanged ? `Apply ${def.label}` : "Save modules"}
          </button>
          {dirty && !busy ? <button type="button" className="quiet-button" onClick={() => { setBuild(saved.build); setDraft(saved.tiles); setMessage(""); setError(""); }}>Discard changes</button> : null}
        </div>
      ) : null}
    </div>
  );
}
