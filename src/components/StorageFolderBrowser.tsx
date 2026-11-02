"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the folder is loaded when the path changes, like the other settings screens */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, ExternalLink, File as FileIcon, FileText, Folder, FolderOpen, HardDrive, Layers, Loader2, RefreshCw, Search, X } from "lucide-react";
import { groupJobFolders, isInsideFolder } from "@/lib/storage/folder-level";
import type { FolderListing } from "@/lib/storage/folder-view";

// 2026-11-02, user request: "is there a way to view what is on the server folders? like a button that says view folder?"
// <ViewFolderButton> sits on the job page and opens one job's folder; <StorageFolderBrowser scope="company"> is Settings > Files.
// Everyone sees the files Apollo X filed; a Flo X platform administrator also gets "Everything on the server".

type Scope = { kind: "job"; jobId: string } | { kind: "company" };

const PROVIDER_LABELS: Record<string, string> = {
  LOCAL_FOLDER: "Folder on the server",
  R2: "Cloudflare R2",
  B2: "Backblaze B2",
  S3_COMPATIBLE: "S3-compatible storage",
  LOCAL_DEV: "Development storage",
};

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });
}

function query(scope: Scope, path: string, everything: boolean, search = "") {
  const params = new URLSearchParams({ scope: scope.kind });
  if (scope.kind === "job") params.set("jobId", scope.jobId);
  if (path) params.set("path", path);
  if (everything) params.set("everything", "1");
  if (search) params.set("search", search);
  return params;
}

export function StorageFolderBrowser({ scope, rootLabel = "Storage" }: { scope: Scope; rootLabel?: string }) {
  const [path, setPath] = useState("");
  // Job folders are shown in groups of 100 (BRE1100 - BRE1199); `group` is the one that is open (the top level only).
  const [group, setGroup] = useState<{ key: string; label: string } | null>(null);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const openFirstResult = useRef(false);
  const requestNo = useRef(0);
  const [everything, setEverything] = useState(false);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState("");
  const jobId = scope.kind === "job" ? scope.jobId : "";

  const load = useCallback(async (nextPath: string, nextEverything: boolean, nextSearch: string) => {
    const mine = ++requestNo.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/v1/storage/folder?${query(jobId ? { kind: "job", jobId } : { kind: "company" }, nextPath, nextEverything, nextSearch)}`, { cache: "no-store" });
      const body = await response.json();
      if (mine !== requestNo.current) return; // a newer search / folder was asked for meanwhile
      if (!response.ok) throw new Error(body.error?.message || "Unable to read the folder.");
      const next = body as FolderListing;
      setListing(next);
      if (openFirstResult.current) {
        openFirstResult.current = false;
        if (next.search && next.folders[0]) { setSearchText(""); setSearch(""); setGroup(null); setPath(next.folders[0].path); }
      }
    } catch (e) {
      if (mine === requestNo.current) setError(e instanceof Error ? e.message : "Unable to read the folder.");
    } finally {
      if (mine === requestNo.current) setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(path, everything, search); }, [load, path, everything, search]);

  // The search box waits a moment after the last key so every letter is not a request.
  useEffect(() => {
    const typed = searchText.trim();
    if (typed === search) return;
    const timer = window.setTimeout(() => setSearch(typed), 300);
    return () => window.clearTimeout(timer);
  }, [searchText, search]);

  function typeSearch(value: string) {
    setSearchText(value);
    setPath(""); setGroup(null);
  }

  function clearSearch() {
    openFirstResult.current = false;
    setSearchText(""); setSearch("");
  }

  // Enter opens the best match: straight away when the results are already up, otherwise as soon as they arrive.
  function submitSearch() {
    const typed = searchText.trim();
    if (!typed) return;
    if (listing?.search === typed && !loading) {
      if (listing.folders[0]) { clearSearch(); setGroup(null); setPath(listing.folders[0].path); }
      return;
    }
    openFirstResult.current = true;
    setSearch(typed);
  }

  async function openFile(filePath: string) {
    setOpening(filePath); setError("");
    try {
      const response = await fetch(`/api/v1/storage/folder/file?${query(jobId ? { kind: "job", jobId } : { kind: "company" }, filePath, false)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Unable to open the file.");
      if (!window.open(body.url, "_blank", "noopener")) setError("Allow pop-ups for this site to open the file.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open the file.");
    } finally {
      setOpening("");
    }
  }

  const rootPath = listing?.rootPath ?? "";
  const crumbs = (listing?.breadcrumbs ?? []).filter((crumb) => isInsideFolder(crumb.path, rootPath));
  const total = (listing?.folders.length ?? 0) + (listing?.files.length ?? 0);
  const searching = !!listing?.search;
  // Grouping only happens on the top level of the whole storage, and not while searching (the results are already few).
  const grouping = useMemo(() => (scope.kind === "company" && listing && listing.path === "" && !listing.search ? groupJobFolders(listing.folders) : null), [scope.kind, listing]);
  const openGroup = grouping?.groups.find((g) => g.key === group?.key) ?? null;
  const groupCrumb = group && !searching && rootPath === "" ? group : null;
  const shownFolders = !listing ? [] : openGroup ? openGroup.folders : grouping && grouping.groups.length ? grouping.others : listing.folders;
  const shownGroups = grouping && !openGroup ? grouping.groups : [];

  return (
    <div className="sfv">
      <div className="sfv-bar">
        <nav className="sfv-crumbs" aria-label="Folder path">
          {rootPath === "" && <button type="button" className={crumbs.length === 0 && !groupCrumb ? "on" : ""} onClick={() => { clearSearch(); setGroup(null); setPath(""); }}><HardDrive size={14} /> {rootLabel}</button>}
          {groupCrumb && (
            <span className="sfv-crumb">
              <ChevronRight size={13} aria-hidden="true" />
              <button type="button" className={crumbs.length === 0 ? "on" : ""} onClick={() => setPath("")}><Layers size={14} /> {groupCrumb.label}</button>
            </span>
          )}
          {crumbs.map((crumb, i) => (
            <span key={crumb.path} className="sfv-crumb">
              {(i > 0 || rootPath === "") && <ChevronRight size={13} aria-hidden="true" />}
              <button type="button" className={i === crumbs.length - 1 ? "on" : ""} onClick={() => setPath(crumb.path)}>{i === 0 && rootPath !== "" ? <FolderOpen size={14} /> : null} {crumb.name}</button>
            </span>
          ))}
        </nav>
        <div className="sfv-actions">
          {listing?.provider && <span className="sfv-chip" title="Where the files are kept"><HardDrive size={12} /> {PROVIDER_LABELS[listing.provider] ?? listing.provider}</span>}
          <button type="button" className="quiet-button" onClick={() => void load(path, everything, search)} disabled={loading}><RefreshCw size={13} className={loading ? "spin" : ""} /> Refresh</button>
        </div>
      </div>

      {scope.kind === "company" && (
        <div className="sfv-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={searchText}
            onChange={(e) => typeSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitSearch(); } if (e.key === "Escape") clearSearch(); }}
            placeholder="Find a job folder - type the job number, e.g. BRE1182"
            aria-label="Find a job folder by its job number"
            autoComplete="off"
            spellCheck={false}
          />
          {searchText ? <button type="button" className="sfv-search-clear" onClick={clearSearch} aria-label="Clear the search"><X size={14} /></button> : null}
          {searchText.trim() && listing?.search === searchText.trim() && !loading ? (
            <span className="sfv-search-count">{listing.folders.length === 0 ? "No folder found" : `${listing.folders.length} ${listing.folders.length === 1 ? "folder" : "folders"} - press Enter to open ${listing.folders[0].name}`}</span>
          ) : null}
        </div>
      )}

      {listing?.canSeeEverything && (
        <label className="sfv-everything">
          <input type="checkbox" checked={everything} onChange={(e) => setEverything(e.target.checked)} />
          <span><b>Everything on the server</b> <small>(Flo X administrators only) - reads the real folder, so files that were not filed by Apollo X show too, and filed files that are gone are flagged.</small></span>
        </label>
      )}

      {error ? <div className="inline-error">{error}</div> : null}

      {listing && !listing.configured ? (
        <div className="sfv-empty"><AlertTriangle size={18} /> File storage is not set up for this company yet, so there is no folder to show. Ask your Flo X administrator to choose a storage location.</div>
      ) : listing ? (
        <div className="sfv-table-wrap">
          <table className="sfv-table">
            <thead><tr><th>Name</th><th className="num">Size</th><th>Date</th><th>Filed by</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {shownGroups.map((g) => (
                <tr key={g.key} className="sfv-folder-row sfv-group-row" onClick={() => setGroup({ key: g.key, label: g.label })}>
                  <td><button type="button" className="sfv-name" onClick={() => setGroup({ key: g.key, label: g.label })}><Layers size={16} /> <b>{g.label}</b></button></td>
                  <td className="num">{formatFileSize(g.sizeBytes)}</td>
                  <td colSpan={2} className="muted">{g.folders.length} {g.folders.length === 1 ? "job folder" : "job folders"} - {g.fileCount} {g.fileCount === 1 ? "file" : "files"}</td>
                  <td className="sfv-act"><button type="button" className="table-action" onClick={(e) => { e.stopPropagation(); setGroup({ key: g.key, label: g.label }); }}>Open group</button></td>
                </tr>
              ))}
              {shownFolders.map((folder) => (
                <tr key={folder.path} className="sfv-folder-row" onClick={() => setPath(folder.path)}>
                  <td><button type="button" className="sfv-name" onClick={() => setPath(folder.path)}><Folder size={16} /> <b>{folder.name}</b></button></td>
                  <td className="num">{formatFileSize(folder.sizeBytes)}</td>
                  <td colSpan={2} className="muted">{folder.fileCount} {folder.fileCount === 1 ? "file" : "files"}</td>
                  <td className="sfv-act"><button type="button" className="table-action" onClick={(e) => { e.stopPropagation(); setPath(folder.path); }}>Open folder</button></td>
                </tr>
              ))}
              {listing.files.map((file) => (
                <tr key={file.path}>
                  <td>
                    <span className="sfv-name"><FileText size={16} /> <span className="sfv-file-name">{file.name}</span></span>
                    {file.notes ? <small className="sfv-note">{file.notes}</small> : null}
                    {!file.known ? <span className="sfv-tag warn">Not filed by Apollo X</span> : null}
                    {file.missing ? <span className="sfv-tag bad">Missing on the server</span> : null}
                  </td>
                  <td className="num">{formatFileSize(file.sizeBytes)}</td>
                  <td>{formatWhen(file.modifiedAt)}</td>
                  <td>{file.uploadedBy ?? (file.known ? "—" : "")}</td>
                  <td className="sfv-act">
                    <button type="button" className="table-action" disabled={opening === file.path || !!file.missing} onClick={() => void openFile(file.path)}>
                      {opening === file.path ? <Loader2 size={13} className="spin" /> : <ExternalLink size={13} />} Open
                    </button>
                  </td>
                </tr>
              ))}
              {total === 0 && !loading ? <tr><td colSpan={5} className="sfv-empty-cell"><FileIcon size={16} /> {searching ? `No job folder matches "${listing?.search}".` : "This folder is empty."}</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : loading ? <div className="table-state"><Loader2 className="spin" size={16} /> Reading the folder…</div> : null}

      {listing?.truncated ? <p className="hint-text">Only the first files are listed - open a sub-folder to see the rest.</p> : null}
    </div>
  );
}

// The "View folder" button on the job page: opens the job's own folder in a window.
export function ViewFolderButton({ jobId, jobLabel }: { jobId: string; jobLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="quiet-button" onClick={() => setOpen(true)} title="See the files in this job's folder on the server"><FolderOpen size={14} /> View folder</button>
      {open && (
        <div className="drawer-backdrop sfv-backdrop" role="dialog" aria-modal="true" aria-label={`Folder for job ${jobLabel}`} onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="sfv-dialog">
            <header>
              <div><p className="eyebrow">Job folder</p><h2>{jobLabel}</h2></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
            </header>
            <div className="sfv-dialog-body"><StorageFolderBrowser scope={{ kind: "job", jobId }} /></div>
          </div>
        </div>
      )}
    </>
  );
}
