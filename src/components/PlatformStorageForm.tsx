"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Download, FolderOpen, Cloud, Server, Database, CheckCircle2, XCircle, AlertTriangle, Upload, ArrowRightLeft } from "lucide-react";
import { MarkdownLite } from "@/components/MarkdownLite";
import { saveCompanyStorageAction, testCompanyStorageAction, type StorageActionResult } from "@/app/platform/actions";
import { STORAGE_GUIDES, type StorageGuideKey } from "@/lib/storage/setup-guides";

// Platform > Companies > [company] > Storage location. Four choices, each with
// its own set-up README shown in the panel (and downloadable as .md), a real
// "Test connection" for the ones that need credentials/a folder, and an
// export-first warning when the company already has stored files.
type Choice = "" | "LOCAL_FOLDER" | "R2" | "S3_COMPATIBLE";

export type StorageFormInitial = {
  provider: "" | "R2" | "B2" | "S3_COMPATIBLE" | "LOCAL_FOLDER";
  accountId: string;
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  localPath: string;
  hasSecret: boolean;
};

function toChoice(provider: StorageFormInitial["provider"]): Choice {
  return provider === "B2" ? "S3_COMPATIBLE" : provider;
}

export type InlineFileSummary = { jobAttachments: number; rfqFiles: number; supportFiles: number; total: number };

export function PlatformStorageForm({ companyId, initial, fileCount, totalBytes, inlineFiles }: { companyId: string; initial: StorageFormInitial; fileCount: number; totalBytes: number; inlineFiles: InlineFileSummary }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<Choice>(toChoice(initial.provider));
  const [accountId, setAccountId] = useState(initial.accountId);
  const [bucket, setBucket] = useState(initial.bucket);
  const [region, setRegion] = useState(initial.region);
  const [endpoint, setEndpoint] = useState(initial.provider === "R2" ? "" : initial.endpoint);
  const [accessKeyId, setAccessKeyId] = useState(initial.accessKeyId);
  const [secret, setSecret] = useState("");
  const [localPath, setLocalPath] = useState(initial.localPath);
  const [guideOpen, setGuideOpen] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<(StorageActionResult & { kind: "test" | "save" }) | null>(null);
  const [moveState, setMoveState] = useState<{ running: boolean; moved: number; remaining: number | null; message: string; ok: boolean | null }>({ running: false, moved: 0, remaining: null, message: "", ok: null });
  const [importState, setImportState] = useState<{ running: boolean; message: string; ok: boolean | null }>({ running: false, message: "", ok: null });

  // Moves every file still saved in the database into this company's storage, one small batch per request.
  async function moveFiles() {
    setMoveState({ running: true, moved: 0, remaining: inlineFiles.total, message: "", ok: null });
    let moved = 0;
    try {
      for (let round = 0; round < 500; round++) {
        const response = await fetch(`/api/v1/platform/companies/${companyId}/storage-migrate`, { method: "POST" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || "Could not move the files.");
        moved += body.moved;
        setMoveState({ running: true, moved, remaining: body.remaining, message: "", ok: null });
        if (body.remaining === 0 || (body.moved === 0 && body.failed.length > 0)) {
          const failed = body.failed as { what: string; reason: string }[];
          setMoveState({ running: false, moved, remaining: body.remaining, ok: failed.length === 0 && body.remaining === 0, message: failed.length ? `${failed.length} file(s) could not be moved: ${failed.slice(0, 3).map((f) => `${f.what} (${f.reason})`).join("; ")}` : `Moved ${moved} file${moved === 1 ? "" : "s"} into the storage location.` });
          router.refresh();
          return;
        }
        if (body.moved === 0) break;
      }
      setMoveState((state) => ({ ...state, running: false, ok: false, message: "Stopped before everything was moved. Run it again." }));
    } catch (error) {
      setMoveState((state) => ({ ...state, running: false, ok: false, message: error instanceof Error ? error.message : "Could not move the files." }));
    }
    router.refresh();
  }

  async function importFiles(file: File | null) {
    if (!file) return;
    setImportState({ running: true, message: "", ok: null });
    try {
      const response = await fetch(`/api/v1/platform/companies/${companyId}/storage-import`, { method: "POST", headers: { "content-type": "application/zip" }, body: file });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Import failed.");
      const parts = [`${body.imported} file${body.imported === 1 ? "" : "s"} imported`, `${body.alreadyPresent} already there`];
      if (body.unmatched.length) parts.push(`${body.unmatched.length} in the zip did not belong to any file (e.g. ${body.unmatched.slice(0, 2).join(", ")})`);
      if (body.stillMissing) parts.push(`${body.stillMissing} file(s) are still missing from the storage location`);
      setImportState({ running: false, ok: body.stillMissing === 0, message: parts.join(" · ") + "." });
      router.refresh();
    } catch (error) {
      setImportState({ running: false, ok: false, message: error instanceof Error ? error.message : "Import failed." });
    }
  }

  const provider: StorageFormInitial["provider"] = choice === "S3_COMPATIBLE" && initial.provider === "B2" ? "B2" : choice;
  const input = { provider, accountId, bucket, region, endpoint, accessKeyId, secretAccessKey: secret, localPath };

  const changed = (() => {
    if (provider !== initial.provider) return true;
    if (provider === "") return false;
    if (provider === "LOCAL_FOLDER") return localPath.trim() !== initial.localPath;
    return bucket.trim() !== initial.bucket || accessKeyId.trim() !== initial.accessKeyId || !!secret.trim() || (provider === "R2" ? accountId.trim().toLowerCase() !== initial.accountId : endpoint.trim() !== initial.endpoint);
  })();
  const needsAck = changed && fileCount > 0;
  const guideKey: StorageGuideKey | null = choice === "" ? null : choice;
  const sizeLabel = totalBytes >= 1_048_576 ? `${(totalBytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(totalBytes / 1024))} KB`;

  function runTest() {
    setResult(null);
    startTransition(async () => setResult({ ...(await testCompanyStorageAction(companyId, input)), kind: "test" }));
  }
  function runSave() {
    setResult(null);
    startTransition(async () => {
      const saved = await saveCompanyStorageAction(companyId, { ...input, acknowledgeExistingFiles: acknowledged });
      setResult({ ...saved, kind: "save" });
      if (saved.ok) {
        setSecret("");
        setAcknowledged(false);
        router.refresh();
      }
    });
  }

  const options: { value: Choice; title: string; text: string; icon: ReactNode }[] = [
    { value: "", title: "Platform default", text: "Use the shared bucket set up for the whole platform.", icon: <Database size={18} /> },
    { value: "LOCAL_FOLDER", title: "Local folder on the server", text: "Save attached and system-created documents to a folder on the server that runs Apollo X.", icon: <FolderOpen size={18} /> },
    { value: "R2", title: "Cloudflare R2", text: "Private cloud bucket, no download fees. Guided set-up with a connection test.", icon: <Cloud size={18} /> },
    { value: "S3_COMPATIBLE", title: "Other S3-compatible", text: "Backblaze B2, Amazon S3, Wasabi or an on-premises MinIO server.", icon: <Server size={18} /> },
  ];

  return (
    <div className="storage-form">
      <div className="storage-options" role="radiogroup" aria-label="Storage option">
        {options.map((option) => (
          <button
            key={option.value || "default"}
            type="button"
            role="radio"
            aria-checked={choice === option.value}
            className={`storage-option${choice === option.value ? " selected" : ""}`}
            onClick={() => { setChoice(option.value); setResult(null); setGuideOpen(true); }}
          >
            {option.icon}
            <strong>{option.title}</strong>
            <span>{option.text}</span>
          </button>
        ))}
      </div>

      {guideKey && (
        <div className="storage-guide">
          <div className="storage-guide-head">
            <strong>Set-up guide: {STORAGE_GUIDES[guideKey].title}</strong>
            <span>
              <a className="table-action" href={`/api/v1/platform/storage-guides/${guideKey}`}><Download size={13} /> Download README</a>
              <button type="button" className="table-action" onClick={() => setGuideOpen((open) => !open)}>{guideOpen ? "Hide" : "Show"}</button>
            </span>
          </div>
          {guideOpen && <div className="storage-guide-body"><MarkdownLite source={STORAGE_GUIDES[guideKey].markdown} /></div>}
        </div>
      )}

      {choice === "" && <p className="muted small-line compact-top-gap">No settings needed. Saving this removes any company-specific storage and returns the company to the platform default.</p>}

      {choice === "LOCAL_FOLDER" && (
        <div className="platform-form-grid compact-top-gap">
          <label className="wide"><span>Folder path on the Apollo X server</span><input value={localPath} onChange={(e) => setLocalPath(e.target.value)} placeholder="D:\ApolloXFiles   or   \\FILESERVER\ApolloX   or   /var/data/apollox-files" /></label>
        </div>
      )}

      {choice === "R2" && (
        <div className="platform-form-grid compact-top-gap">
          <label><span>Cloudflare Account ID</span><input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="32 letters/numbers" autoComplete="off" /></label>
          <label><span>Bucket name</span><input value={bucket} onChange={(e) => setBucket(e.target.value)} autoComplete="off" /></label>
          <label><span>Access key ID</span><input value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} autoComplete="off" /></label>
          <label><span>Secret access key</span><input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={initial.hasSecret ? "Unchanged" : ""} autoComplete="new-password" /></label>
          <p className="muted small-line wide">Address and region are filled in automatically: <code>https://{accountId.trim().toLowerCase() || "<account id>"}.r2.cloudflarestorage.com</code>, region <code>auto</code>.</p>
        </div>
      )}

      {choice === "S3_COMPATIBLE" && (
        <div className="platform-form-grid compact-top-gap">
          <label><span>Bucket name</span><input value={bucket} onChange={(e) => setBucket(e.target.value)} autoComplete="off" /></label>
          <label><span>Endpoint</span><input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://s3.example.com" autoComplete="off" /></label>
          <label><span>Region</span><input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="auto" autoComplete="off" /></label>
          <label><span>Access key ID</span><input value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} autoComplete="off" /></label>
          <label><span>Secret access key</span><input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={initial.hasSecret ? "Unchanged" : ""} autoComplete="new-password" /></label>
        </div>
      )}

      {needsAck && (
        <div className="storage-warning" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>This company already has {fileCount} stored file{fileCount === 1 ? "" : "s"} ({sizeLabel}).</strong>
            <p>Apollo X does not move files between locations by itself. After the change the old files will not open from Apollo X until you bring them back. Export them first; once the new location is saved, use <em>Import exported files</em> with that .zip to make them viewable again.</p>
            <a className="quiet-button" href={`/api/v1/platform/companies/${companyId}/storage-export`}><Download size={14} /> Export current files (.zip)</a>
            <label className="storage-ack"><input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} /> I have exported the files I need, and understand the old files will not open until I import them into the new location.</label>
          </div>
        </div>
      )}

      <div className="platform-form-actions compact-top-gap storage-actions">
        {choice !== "" && <button type="button" className="quiet-button" disabled={pending} onClick={runTest}>{pending && result === null ? "Working…" : "Test connection"}</button>}
        <button type="button" className="primary-button" disabled={pending || !changed || (needsAck && !acknowledged)} onClick={runSave}>Save storage location</button>
      </div>

      {result && (
        <div className={`storage-result ${result.ok ? "ok" : "bad"}`} role="status">
          {result.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          <div>
            <strong>{result.ok ? (result.message ?? "Done.") : result.error}</strong>
            {result.steps && result.steps.length > 0 && (
              <ul>{result.steps.map((step) => <li key={step.step}>{step.ok ? "✓" : "✗"} {step.step}</li>)}</ul>
            )}
          </div>
        </div>
      )}

      <div className="storage-tools">
        {inlineFiles.total > 0 && (
          <div className="storage-tool">
            <div>
              <strong><ArrowRightLeft size={14} /> {inlineFiles.total} file{inlineFiles.total === 1 ? "" : "s"} still saved in the database</strong>
              <p className="muted small-line">{inlineFiles.jobAttachments} job file{inlineFiles.jobAttachments === 1 ? "" : "s"}, {inlineFiles.rfqFiles} RFQ file{inlineFiles.rfqFiles === 1 ? "" : "s"}, {inlineFiles.supportFiles} support file{inlineFiles.supportFiles === 1 ? "" : "s"}. Move them into this company&rsquo;s storage location (job files go in a folder named by job number). Save the storage location above first.</p>
            </div>
            <button type="button" className="quiet-button" disabled={moveState.running || pending} onClick={() => void moveFiles()}>
              {moveState.running ? `Moving… ${moveState.remaining ?? ""} left` : "Move files to this storage"}
            </button>
          </div>
        )}
        {moveState.message && <p className={moveState.ok ? "storage-note ok" : "storage-note bad"}>{moveState.message}</p>}
        <div className="storage-tool">
          <div>
            <strong><Upload size={14} /> Import exported files</strong>
            <p className="muted small-line">After changing the storage location, upload the .zip you exported from this card (or a zip of the copied folder). Each file is put back at the path Apollo X looks for it, so it opens again.</p>
          </div>
          <label className="quiet-button storage-file-button">
            {importState.running ? "Importing…" : "Choose .zip to import"}
            <input type="file" accept=".zip,application/zip" hidden disabled={importState.running} onChange={(event) => { const file = event.target.files?.[0] ?? null; event.target.value = ""; void importFiles(file); }} />
          </label>
        </div>
        {importState.message && <p className={importState.ok ? "storage-note ok" : "storage-note bad"}>{importState.message}</p>}
      </div>
    </div>
  );
}
