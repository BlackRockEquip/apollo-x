"use client";

import { useState } from "react";
import { Check, Download, Upload, X } from "lucide-react";
import { CUSTOMER_IMPORT_FIELDS, JOB_IMPORT_FIELDS, PART_IMPORT_FIELDS, SUPPLIER_IMPORT_FIELDS, type ImportExportKind, type ImportFieldDef } from "@/lib/import-export/fields";

// ---------------------------------------------------------------------------
// Settings > Import / Export — one section per module (Customers, Suppliers,
// Parts Catalog, Jobs), each offering a spreadsheet export and a
// manual-column-linking bulk import, per the user's explicit request.
// Ported from ModApp's own Settings > Import/Export UI
// (ImportWithMappingForm.tsx/ExportButton.tsx)
// — same "read headers, guess a starting mapping, let the user confirm or
// fix it before anything is imported" flow — but talking to Apollo X's own
// API routes (src/app/api/v1/import-export/[kind]/...) rather than Server
// Actions, matching every other workspace component in this app (see
// CompanySettingsForm.tsx for the same fetch()-based save pattern, and its
// logo upload for the same file-to-base64 convention used below).
// ---------------------------------------------------------------------------

type ImportRowResult = { label: string; status: "created" | "updated" | "skipped"; detail: string };
type ImportSummary = { total: number; created: number; updated: number; skipped: number; rows: ImportRowResult[] };
type PreviewResult = {
  headers: string[];
  previewRows: Record<string, string | number | boolean | null>[];
  sheetNames: string[];
  selectedSheetNames: string[];
};
type ApiErrorBody = { error?: { message?: string } };

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// A few common header spellings (`field.aliases`) give every field a
// starting guess — the user can always change it. Doesn't exclude a header
// once an earlier field has claimed it, so two fields sharing an alias
// would both point at the same column until the user fixes one — the field
// lists in @/lib/import-export/fields are written to avoid that.
function guessMapping(headers: string[], fields: ImportFieldDef[]): Record<string, string> {
  const normalizedHeaders = headers.map((h) => ({ raw: h, normalized: normalizeHeader(h) }));
  const mapping: Record<string, string> = {};
  for (const field of fields) {
    const candidates = [field.label, field.key, ...(field.aliases ?? [])].map(normalizeHeader);
    const match = normalizedHeaders.find((h) => candidates.includes(h.normalized));
    if (match) mapping[field.key] = match.raw;
  }
  return mapping;
}

// 2026-09-10 — "Download template" button, added to every Import/Export
// module at the user's request. Generates a blank CSV with one header row
// (this kind's own field labels — the exact labels the column-mapping step
// below already shows) client-side, no network round-trip needed for a
// static file — same Blob + temporary-anchor-click pattern JobWorkspace's
// downloadPartsTemplate already uses for its own parts-list template.
function downloadTemplate(moduleLabel: string, fields: ImportFieldDef[]) {
  const headerRow = fields.map((f) => `"${f.label.replace(/"/g, '""')}"`).join(",");
  const csv = `${headerRow}\n`;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${moduleLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-import-template.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error?.message || fallback;
}

async function fetchPreview(
  kind: ImportExportKind,
  payload: { fileName: string; mimeType: string; contentBase64: string; sheetNames?: string[] },
): Promise<PreviewResult> {
  const response = await fetch(`/api/v1/import-export/${kind}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, "Unable to read that file."));
  return (await response.json()) as PreviewResult;
}

// Re-linking after a sheet is checked/unchecked shouldn't throw away
// mappings the user (or the initial guess) already made — a column kept by
// the new selection keeps whatever field it was linked to; guessMapping
// only fills in the fields still unmapped (e.g. a field only guessable from
// a column that lives on the newly-added sheet).
function mergeMapping(existing: Record<string, string>, headers: string[], fields: ImportFieldDef[]): Record<string, string> {
  const preserved: Record<string, string> = {};
  for (const [fieldKey, column] of Object.entries(existing)) {
    if (headers.includes(column)) preserved[fieldKey] = column;
  }
  return { ...guessMapping(headers, fields), ...preserved };
}

// Exported (2026-09-14) so Stock Levels' "Add or Import Part" popup can
// reuse this exact same upload/column-mapping/confirm flow for its Import
// tab, instead of a second, divergent copy of the parts-import wizard —
// see StockLevelsWorkspace.tsx.
export function ImportModule({
  kind,
  moduleLabel,
  rowLabelHeader,
  fields,
  helperText,
  checkNewLocations,
}: {
  kind: ImportExportKind;
  moduleLabel: string;
  rowLabelHeader: string;
  fields: ImportFieldDef[];
  helperText?: string;
  // 2026-09-11 — Parts only. Before running the real import, checks
  // whether the mapped "Bin location" column has any codes that don't
  // match a Storage Location on file yet, and — if so — shows a
  // confirmation box listing them before creating anything, rather than
  // either silently leaving them unmapped (the old behavior) or silently
  // creating them (the way an unmatched manufacturer name already does).
  checkNewLocations?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [contentBase64, setContentBase64] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string | number | boolean | null>[]>([]);
  // Every sheet the uploaded workbook has, and which of them are currently
  // checked to be combined into this import — sheetNames.length > 1 is what
  // gates showing the picker at all, since a single-sheet file (or a .csv)
  // has nothing to choose between.
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [checkingLocations, setCheckingLocations] = useState(false);
  const [pendingNewLocations, setPendingNewLocations] = useState<string[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [showResults, setShowResults] = useState(false);
  // Bumped on Cancel to remount the (uncontrolled) file input — there's no
  // other way to clear a native file input's selection, and without this a
  // Cancel followed by re-choosing the exact same file wouldn't fire
  // onChange at all.
  const [inputResetKey, setInputResetKey] = useState(0);

  async function handleFileSelected(selected: File | null) {
    setResult(null);
    setError("");
    setFile(selected);
    setContentBase64("");
    setHeaders([]);
    setPreviewRows([]);
    setSheetNames([]);
    setSelectedSheets([]);
    setMapping({});
    if (!selected) return;
    setPreviewing(true);
    try {
      const encoded = await fileToBase64(selected);
      setContentBase64(encoded);
      // No sheetNames sent yet — the server defaults to the workbook's
      // first sheet and tells us every sheet name it actually has, which
      // is what seeds the picker below.
      const body = await fetchPreview(kind, { fileName: selected.name, mimeType: selected.type || "text/csv", contentBase64: encoded });
      setHeaders(body.headers);
      setPreviewRows(body.previewRows);
      setSheetNames(body.sheetNames);
      setSelectedSheets(body.selectedSheetNames);
      setMapping(guessMapping(body.headers, fields));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to read that file.");
    } finally {
      setPreviewing(false);
    }
  }

  // Re-previews with the updated sheet selection so the column-mapping step
  // (headers, sample rows) reflects everything about to be combined — not
  // just re-checking a box locally, since a newly-added sheet can carry a
  // column the first sheet didn't have.
  async function handleSheetToggle(name: string) {
    if (!file || !contentBase64) return;
    const next = selectedSheets.includes(name) ? selectedSheets.filter((s) => s !== name) : [...selectedSheets, name];
    if (next.length === 0) return; // always keep at least one sheet checked
    setError("");
    setPreviewing(true);
    try {
      const body = await fetchPreview(kind, { fileName: file.name, mimeType: file.type || "text/csv", contentBase64, sheetNames: next });
      setHeaders(body.headers);
      setPreviewRows(body.previewRows);
      setSelectedSheets(body.selectedSheetNames);
      setMapping((prev) => mergeMapping(prev, body.headers, fields));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to read that file.");
    } finally {
      setPreviewing(false);
    }
  }

  function handleCancel() {
    setFile(null);
    setContentBase64("");
    setHeaders([]);
    setPreviewRows([]);
    setSheetNames([]);
    setSelectedSheets([]);
    setMapping({});
    setError("");
    setResult(null);
    setPendingNewLocations(null);
    setInputResetKey((k) => k + 1);
  }

  function updateMapping(fieldKey: string, column: string) {
    setMapping((prev) => {
      const next = { ...prev };
      if (column) next[fieldKey] = column;
      else delete next[fieldKey];
      return next;
    });
  }

  const missingRequired = fields.filter((f) => f.required && !mapping[f.key]);
  // Organized by the file's own columns rather than this app's fields — a
  // synced/exported file's columns don't always end up 1:1 with what gets
  // imported, so this shows what happens to every column actually in the
  // spreadsheet, recomputed on every render so relinking a field above
  // updates it immediately.
  const columnStatus = headers.map((h) => ({ header: h, matchedField: fields.find((f) => mapping[f.key] === h) ?? null }));

  // The actual import call — shared by the direct path (no new bin
  // locations to confirm) and the confirmed path (the "Create N locations
  // and import" button in the dialog below). createMissingLocations only
  // does anything on the server when this module checks locations at all
  // and a Bin location column is actually mapped; harmless otherwise.
  async function runImport() {
    if (!file) return;
    setImporting(true);
    setError("");
    try {
      const encoded = contentBase64 || (await fileToBase64(file));
      const response = await fetch(`/api/v1/import-export/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type || "text/csv", contentBase64: encoded, mapping, sheetNames: selectedSheets, createMissingLocations: Boolean(checkNewLocations) }),
      });
      if (!response.ok) throw new Error(await readErrorMessage(response, "Unable to import that file."));
      const body = (await response.json()) as ImportSummary;
      setResult(body);
      setShowResults(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to import that file.");
    } finally {
      setImporting(false);
      setPendingNewLocations(null);
    }
  }

  async function handleImport() {
    if (!file) return;
    if (missingRequired.length > 0) {
      setError(`Link a column for: ${missingRequired.map((f) => f.label).join(", ")} before importing.`);
      return;
    }
    setError("");
    if (checkNewLocations && mapping.binLocationCode) {
      setCheckingLocations(true);
      try {
        const encoded = contentBase64 || (await fileToBase64(file));
        const response = await fetch(`/api/v1/import-export/parts/preview-locations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type || "text/csv", contentBase64: encoded, mapping, sheetNames: selectedSheets }),
        });
        if (!response.ok) throw new Error(await readErrorMessage(response, "Unable to check bin locations."));
        const body = (await response.json()) as { newLocationCodes: string[] };
        setCheckingLocations(false);
        if (body.newLocationCodes.length > 0) {
          setPendingNewLocations(body.newLocationCodes);
          return; // wait for the confirm dialog below rather than importing yet
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to check bin locations.");
        setCheckingLocations(false);
        return;
      }
    }
    await runImport();
  }

  return (
    <div>
      <div className="stack-row" style={{ marginBottom: 10 }}>
        <button type="button" className="quiet-button" onClick={() => downloadTemplate(moduleLabel, fields)}>
          <Download size={14} /> Download template
        </button>
      </div>
      <label style={{ display: "grid", gap: 6, maxWidth: 420 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-700)" }}>Spreadsheet file</span>
        <input
          key={inputResetKey}
          type="file"
          accept=".xlsx,.xls,.csv"
          disabled={previewing}
          onChange={(e) => void handleFileSelected(e.target.files?.[0] ?? null)}
          style={{ border: "1px solid var(--ink-300)", borderRadius: 6, padding: 7, fontSize: 12 }}
        />
      </label>
      <p style={{ margin: "6px 0", fontSize: 11, color: "var(--ink-500)" }}>
        {previewing
          ? "Reading the file…"
          : `Any column headers work — you'll link each one to a ${moduleLabel} field below before anything is imported.${helperText ? ` ${helperText}` : ""}`}
      </p>

      {error && <div className="inline-error">{error}</div>}

      {headers.length > 0 && (
        <div style={{ marginTop: 8, border: "1px solid var(--ink-150)", borderRadius: 8, padding: 13 }}>
          {sheetNames.length > 1 && (
            <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--ink-100)" }}>
              <p style={{ marginBottom: 6, fontSize: 11, fontWeight: 700 }}>Sheets to import</p>
              <p style={{ marginBottom: 6, fontSize: 11, color: "var(--ink-500)" }}>
                This file has {sheetNames.length} sheets. Check every sheet that holds {moduleLabel} rows laid out the same way — their
                rows are combined into one import with one column-mapping step below. Leave any reference/notes sheets unchecked.
              </p>
              <div style={{ display: "grid", gap: 4 }}>
                {sheetNames.map((name) => (
                  <label key={name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-700)" }}>
                    <input type="checkbox" checked={selectedSheets.includes(name)} disabled={previewing} onChange={() => void handleSheetToggle(name)} />
                    {name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <p style={{ marginBottom: 8, fontSize: 11, fontWeight: 700 }}>Link your columns</p>
          <div style={{ display: "grid", gap: 7 }}>
            {fields.map((field) => (
              <div key={field.key} className="stack-row">
                <span style={{ width: 190, flexShrink: 0, fontSize: 11, color: "var(--ink-700)" }}>
                  {field.label}
                  {field.required && <em style={{ color: "var(--danger)", fontStyle: "normal" }}> *</em>}
                </span>
                <select value={mapping[field.key] ?? ""} onChange={(e) => updateMapping(field.key, e.target.value)} style={{ flex: 1, minWidth: 0 }}>
                  <option value="">-- Not mapped --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--ink-100)" }}>
            <p style={{ marginBottom: 6, fontSize: 11, fontWeight: 700 }}>Your file&apos;s columns</p>
            <ul style={{ display: "grid", gap: 4, margin: 0, padding: 0, listStyle: "none" }}>
              {columnStatus.map(({ header, matchedField }) => (
                <li key={header} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11 }}>
                  <span style={{ color: "var(--ink-700)" }}>{header}</span>
                  {matchedField ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--success)", whiteSpace: "nowrap" }}>
                      <Check size={12} /> Linked to &quot;{matchedField.label}&quot;
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--ink-400)", whiteSpace: "nowrap" }}>
                      <X size={12} /> Not linked
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {previewRows.length > 0 && (
            <div className="data-table-wrap" style={{ marginTop: 12 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    {headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i}>
                      {headers.map((h) => (
                        <td key={h}>{String(row[h] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="stack-row" style={{ marginTop: 12 }}>
            <button type="button" className="gold-button" disabled={importing || checkingLocations} onClick={() => void handleImport()}>
              <Upload size={14} /> {checkingLocations ? "Checking bin locations…" : importing ? "Importing…" : "Import"}
            </button>
            <button type="button" className="quiet-button" disabled={importing || checkingLocations} onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {pendingNewLocations && (
        <div className="drawer-backdrop" role="dialog" aria-modal="true">
          <aside className="form-drawer compact-dialog">
            <header>
              <div>
                <p className="eyebrow">Import</p>
                <h2>New bin locations</h2>
              </div>
              <button type="button" onClick={() => setPendingNewLocations(null)} aria-label="Close dialog">
                <X size={18} />
              </button>
            </header>
            <div style={{ padding: "4px 0 14px" }}>
              <p style={{ fontSize: 12, marginBottom: 10, color: "var(--ink-700)" }}>
                This file has {pendingNewLocations.length} bin location{pendingNewLocations.length === 1 ? "" : "s"} that{" "}
                {pendingNewLocations.length === 1 ? "doesn't" : "don't"} exist yet under Storage Locations. Create{" "}
                {pendingNewLocations.length === 1 ? "it" : "them"} now (as type &quot;Bin&quot;) so this import can assign stock to{" "}
                {pendingNewLocations.length === 1 ? "it" : "them"} — or cancel and set {pendingNewLocations.length === 1 ? "it" : "them"} up
                yourself first under Settings &gt; Storage Locations if you&apos;d rather pick a different type or a parent location.
              </p>
              <ul style={{ margin: "0 0 4px", paddingLeft: 18, fontSize: 12, color: "var(--ink-700)", maxHeight: 180, overflow: "auto" }}>
                {pendingNewLocations.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            </div>
            <footer className="detail-actions">
              <button type="button" className="quiet-button" disabled={importing} onClick={() => setPendingNewLocations(null)}>
                Cancel
              </button>
              <button type="button" className="gold-button" disabled={importing} onClick={() => void runImport()}>
                {importing ? "Importing…" : `Create ${pendingNewLocations.length} location${pendingNewLocations.length === 1 ? "" : "s"} and import`}
              </button>
            </footer>
          </aside>
        </div>
      )}

      {result && (
        <p style={{ marginTop: 8, fontSize: 11 }}>
          Processed {result.total} row{result.total === 1 ? "" : "s"} — {result.created} created
          {result.updated > 0 ? `, ${result.updated} updated` : ""}
          {result.skipped > 0 ? `, ${result.skipped} skipped` : ""}.{" "}
          <button type="button" className="table-action" onClick={() => setShowResults(true)}>
            View details
          </button>
        </p>
      )}

      {showResults && result && (
        <div className="drawer-backdrop" role="dialog" aria-modal="true">
          <aside className="form-drawer compact-dialog">
            <header>
              <div>
                <p className="eyebrow">Import</p>
                <h2>Results</h2>
              </div>
              <button type="button" onClick={() => setShowResults(false)} aria-label="Close dialog">
                <X size={18} />
              </button>
            </header>
            <div style={{ overflow: "auto", padding: "4px 0 14px" }}>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{rowLabelHeader}</th>
                      <th>Status</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i}>
                        <td>{row.label}</td>
                        <td>
                          <span className={row.status === "skipped" ? "status-pill neutral" : "status-pill tone-green"}>{row.status}</span>
                        </td>
                        <td style={{ whiteSpace: "normal", maxWidth: 420 }}>{row.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <footer className="detail-actions">
              <button type="button" className="gold-button" onClick={() => setShowResults(false)}>
                Close
              </button>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}

function ExportControl({ kind, moduleLabel }: { kind: ImportExportKind; moduleLabel: string }) {
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  async function handleExport() {
    setError("");
    setExporting(true);
    try {
      const response = await fetch(`/api/v1/import-export/${kind}?format=${format}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readErrorMessage(response, "Unable to export."));
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const fileName = match?.[1] || `${kind}.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to export.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="stack-row">
      <select value={format} onChange={(e) => setFormat(e.target.value as "xlsx" | "csv")} style={{ width: 140 }}>
        <option value="xlsx">Excel (.xlsx)</option>
        <option value="csv">CSV</option>
      </select>
      <button type="button" className="quiet-button" disabled={exporting} onClick={() => void handleExport()}>
        <Download size={14} /> {exporting ? "Exporting…" : `Export ${moduleLabel}`}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: "var(--danger)" }}>{error}</span>
      )}
    </div>
  );
}

export function ImportExportWorkspace() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section className="detail-panel">
        <header>
          <div>
            <h2>Customers</h2>
            <p>Export the current customer list, or bulk-import from a spreadsheet — link each of your file&apos;s own columns to the right field before importing.</p>
          </div>
        </header>
        <div style={{ padding: 14 }}>
          <ExportControl kind="customers" moduleLabel="customers" />
          <div style={{ marginTop: 14 }}>
            <ImportModule kind="customers" moduleLabel="customer" rowLabelHeader="Customer name" fields={CUSTOMER_IMPORT_FIELDS} />
          </div>
        </div>
      </section>

      <section className="detail-panel">
        <header>
          <div>
            <h2>Suppliers</h2>
            <p>Export the current supplier list, or bulk-import from a spreadsheet.</p>
          </div>
        </header>
        <div style={{ padding: 14 }}>
          <ExportControl kind="suppliers" moduleLabel="suppliers" />
          <div style={{ marginTop: 14 }}>
            <ImportModule kind="suppliers" moduleLabel="supplier" rowLabelHeader="Supplier name" fields={SUPPLIER_IMPORT_FIELDS} />
          </div>
        </div>
      </section>

      <section className="detail-panel">
        <header>
          <div>
            <h2>Parts Catalog</h2>
            <p>
              Export the current parts catalog, or bulk-import from a spreadsheet. A manufacturer name that doesn&apos;t match anyone on file gets
              added automatically (name only); a tax code that doesn&apos;t match this company&apos;s own codes is simply left unmapped for that row.
            </p>
          </div>
        </header>
        <div style={{ padding: 14 }}>
          <ExportControl kind="parts" moduleLabel="parts catalog" />
          <div style={{ marginTop: 14 }}>
            <ImportModule kind="parts" moduleLabel="part" rowLabelHeader="Part number" fields={PART_IMPORT_FIELDS} checkNewLocations />
          </div>
        </div>
      </section>

      <section className="detail-panel">
        <header>
          <div>
            <h2>Jobs</h2>
            <p>
              Export every job on file, or bulk-import historical jobs. Only the job&apos;s own details are imported — parts lists, warranty
              info, and field-service assignments still need to be added from each job&apos;s own page afterward.
            </p>
          </div>
        </header>
        <div style={{ padding: 14 }}>
          <ExportControl kind="jobs" moduleLabel="jobs" />
          <div style={{ marginTop: 14 }}>
            <ImportModule
              kind="jobs"
              moduleLabel="job"
              rowLabelHeader="Job #"
              fields={JOB_IMPORT_FIELDS}
              helperText={
                '"Job number" is required and becomes that job\'s real number (e.g. "BRE001") — re-importing the same job number later updates that job instead of creating a duplicate, so the same file can be re-run safely. "Previous job number" is a different, optional field: a reference to another related job (ModApp\'s "Linked Job / Project" column), not this row\'s own number. A customer is linked when its name matches an existing customer (exactly, or closely enough to flag for a double-check) — a row whose customer name doesn\'t match anyone on file gets a new customer added for it automatically (name only; fill in its details afterward from the Customers screen).'
              }
            />
          </div>
        </div>
      </section>
    </div>
  );
}
