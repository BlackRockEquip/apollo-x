"use client";

import { useMemo, useState } from "react";

// 2026-10-16, user request: "in a company, setting colours should have colour
// picker next to field with a preview". Used by the Platform Admin company
// page and the Add Company form. Each colour is a native colour picker beside
// a hex field (the hex field is the one that is submitted), followed by a live
// preview in the same style as Settings > Company's branding preview.
// Renders as a fragment so it sits inside the surrounding .platform-form-grid.
export type CompanyColours = { themeColor: string; accentColor: string; secondaryColor: string; backgroundColor: string };

function normalise(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function validHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

const FIELDS: Array<{ key: keyof CompanyColours; label: string; fallback: string }> = [
  { key: "themeColor", label: "Sidebar button colour", fallback: "#155fca" },
  { key: "accentColor", label: "Horizontal bar colour", fallback: "#d6a83b" },
  { key: "secondaryColor", label: "Sidebar background colour", fallback: "#07111f" },
  { key: "backgroundColor", label: "Main background colour", fallback: "#f5f7fa" },
];

export function CompanyColourFields({ initial, disabled = false, companyName }: { initial: Partial<CompanyColours>; disabled?: boolean; companyName: string }) {
  const [values, setValues] = useState<CompanyColours>({
    themeColor: initial.themeColor ?? "",
    accentColor: initial.accentColor ?? "",
    secondaryColor: initial.secondaryColor ?? "",
    backgroundColor: initial.backgroundColor ?? "",
  });
  const set = (key: keyof CompanyColours, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const pick = (key: keyof CompanyColours, fallback: string) => {
    const value = normalise(values[key]);
    return validHex(value) ? value : fallback;
  };
  const previewStyle = useMemo(() => ({
    ["--tenant-theme" as string]: pick("themeColor", "#155fca"),
    ["--tenant-accent" as string]: validHex(normalise(values.accentColor)) ? normalise(values.accentColor) : pick("themeColor", "#d6a83b"),
    ["--tenant-secondary" as string]: pick("secondaryColor", "#07111f"),
    ["--tenant-canvas" as string]: pick("backgroundColor", "#f7f9fc"),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [values]);

  return (
    <>
      {FIELDS.map((field) => {
        const raw = values[field.key];
        const invalid = raw.trim() !== "" && !validHex(normalise(raw));
        return (
          <label key={field.key}>
            <span>{field.label}</span>
            <div className="color-picker-field">
              <input type="color" aria-label={`${field.label} picker`} disabled={disabled} value={pick(field.key, field.fallback)} onChange={(event) => set(field.key, event.target.value.toUpperCase())} />
              <input className="color-picker-hex" name={field.key} value={raw} placeholder={field.fallback} disabled={disabled} onChange={(event) => set(field.key, event.target.value)} aria-invalid={invalid} />
            </div>
            {invalid ? <small className="muted small-line" style={{ color: "var(--danger)" }}>Use a hex colour such as {field.fallback}.</small> : null}
          </label>
        );
      })}
      <div className="wide">
        <span className="muted small-line">Preview</span>
        <div className="brand-preview-panel" style={previewStyle} data-testid="colour-preview">
          <div className="brand-preview-sidebar"><div className="brand-preview-logo" /><strong>{companyName || "Company name"}</strong><span>Flo X Integrations remains visible</span></div>
          <div className="brand-preview-workspace"><div className="brand-preview-topbar" /><div className="brand-preview-card-grid"><div /><div /><div /></div></div>
        </div>
      </div>
    </>
  );
}
