"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Camera, FileUp, Loader2, Upload, X } from "lucide-react";
import { MAX_ATTACHMENT_BYTES, PHOTO_ACCEPT, fileBadge, formatFileSize, stagedFileProblem, tagLabel, tagOptions } from "@/lib/jobs/attachment-tags";

export type StagedUpload = { file: File; tag: string; notes: string };

type Staged = StagedUpload & { id: number; preview: string | null; error: string };

// 2026-11-03, user request: on a job's Photos and Attachments cards a user can drag and drop files (several at once), tag and note each
// one after it is loaded, and add them all together. A file that fails stays in the list with the reason so it can be retried.
export function JobFileUploader({ kind, disabled, uploadOne, onDone, onBusyChange }: {
  kind: "photo" | "document";
  disabled?: boolean;
  /** Uploads one file. Returns an error message, or null when it was added. */
  uploadOne: (entry: StagedUpload) => Promise<string | null>;
  onDone: () => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const asPhoto = kind === "photo";
  const noun = asPhoto ? "photo" : "file";
  const options = tagOptions(asPhoto);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const nextId = useRef(1);
  const depth = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const previews = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    const map = previews.current;
    return () => { map.forEach((url) => URL.revokeObjectURL(url)); map.clear(); };
  }, []);

  const addFiles = useCallback((list: FileList | File[]) => {
    const problems: string[] = [];
    const fresh: Staged[] = [];
    for (const file of Array.from(list)) {
      const problem = stagedFileProblem(file, asPhoto);
      if (problem) { problems.push(`${file.name}: ${problem}`); continue; }
      const id = nextId.current++;
      let preview: string | null = null;
      if (asPhoto) { preview = URL.createObjectURL(file); previews.current.set(id, preview); }
      fresh.push({ id, file, tag: "", notes: "", preview, error: "" });
    }
    setRejected(problems);
    if (fresh.length) setStaged((current) => [...current, ...fresh]);
  }, [asPhoto]);

  const drop = (id: number) => {
    const url = previews.current.get(id);
    if (url) { URL.revokeObjectURL(url); previews.current.delete(id); }
  };
  const remove = (id: number) => { drop(id); setStaged((current) => current.filter((entry) => entry.id !== id)); };
  const clearAll = () => { staged.forEach((entry) => drop(entry.id)); setStaged([]); setRejected([]); };
  const patch = (id: number, change: Partial<Staged>) => setStaged((current) => current.map((entry) => entry.id === id ? { ...entry, ...change } : entry));
  const tagAll = (tag: string) => setStaged((current) => current.map((entry) => ({ ...entry, tag })));

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types || []).includes("Files");
  const onDragEnter = (event: DragEvent) => { if (disabled || !hasFiles(event)) return; event.preventDefault(); depth.current += 1; setDragging(true); };
  const onDragOver = (event: DragEvent) => { if (disabled || !hasFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; };
  const onDragLeave = (event: DragEvent) => { if (!hasFiles(event)) return; depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setDragging(false); };
  const onDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault(); depth.current = 0; setDragging(false);
    if (disabled || uploading) return;
    addFiles(event.dataTransfer.files);
  };

  async function submit() {
    if (uploading || staged.length === 0) return;
    setUploading(true); onBusyChange?.(true);
    const snapshot = staged;
    const failed = new Map<number, string>();
    for (const entry of snapshot) {
      const message = await uploadOne({ file: entry.file, tag: entry.tag, notes: entry.notes.trim() });
      if (message) failed.set(entry.id, message);
    }
    snapshot.forEach((entry) => { if (!failed.has(entry.id)) drop(entry.id); });
    setStaged((current) => current.filter((entry) => failed.has(entry.id)).map((entry) => ({ ...entry, error: failed.get(entry.id) || "" })));
    setUploading(false); onBusyChange?.(false);
    await onDone();
  }

  const tagged = staged.filter((entry) => entry.tag).length;
  const blocked = Boolean(disabled) || uploading;
  const pickLabel = asPhoto ? "Choose photos" : "Choose files";

  const tagButtons = (current: string, onPick: (tag: string) => void, small = false) => (
    <div className={small ? "jfu-tags small" : "jfu-tags"} role="group" aria-label="Tag">
      {options.map((option) => (
        <button key={option} type="button" disabled={blocked} className={option === current ? "on" : ""} aria-pressed={option === current} onClick={() => onPick(option === current ? "" : option)}>{tagLabel(option)}</button>
      ))}
    </div>
  );

  return (
    <div className={dragging ? "jfu dragging" : "jfu"} onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <input ref={input} type="file" multiple hidden accept={asPhoto ? PHOTO_ACCEPT : undefined} onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} />
      {staged.length === 0 ? (
        <div className="jfu-zone">
          <span className="jfu-zone-icon">{asPhoto ? <Camera size={26} /> : <FileUp size={26} />}</span>
          <strong>{dragging ? `Drop the ${noun}s to add them` : `Drag and drop ${noun}s here`}</strong>
          <span className="jfu-or">or</span>
          <button type="button" className="quiet-button" disabled={blocked} onClick={() => input.current?.click()}>{pickLabel}</button>
          <span className="jfu-hint">{asPhoto ? "PNG, JPG or WebP" : "Any allowed file type"} · up to {MAX_ATTACHMENT_BYTES / 1_000_000} MB each · add several at once</span>
        </div>
      ) : (
        <div className="jfu-zone compact">
          <span className="jfu-zone-icon"><Upload size={18} /></span>
          <div><strong>{dragging ? `Drop the ${noun}s to add them` : `Drop more ${noun}s here`}</strong></div>
          <button type="button" className="quiet-button" disabled={blocked} onClick={() => input.current?.click()}>{pickLabel}</button>
        </div>
      )}

      {rejected.length > 0 && (
        <div className="jfu-rejected" role="alert">
          {rejected.map((line) => <div key={line}>{line}</div>)}
        </div>
      )}

      {staged.length > 0 && (
        <>
          <div className="jfu-bar">
            <strong>{staged.length} {noun}{staged.length === 1 ? "" : "s"} ready</strong>
            <span>· {tagged} tagged</span>
            <span className="jfu-grow" />
            <span className="jfu-bar-label">Tag all as</span>
            {tagButtons("", tagAll, true)}
          </div>
          <div className={asPhoto ? "jfu-staged photos" : "jfu-staged files"}>
            {staged.map((entry) => {
              const badge = fileBadge(entry.file.name, entry.file.type);
              return (
                <article key={entry.id} className={entry.error ? "jfu-item failed" : "jfu-item"}>
                  {asPhoto ? (
                    <div className="jfu-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {entry.preview && <img src={entry.preview} alt={entry.file.name} />}
                      <button type="button" className="jfu-remove" aria-label={`Remove ${entry.file.name}`} disabled={blocked} onClick={() => remove(entry.id)}><X size={14} /></button>
                    </div>
                  ) : (
                    <span className={`jfu-badge ${badge.tone}`}>{badge.label}</span>
                  )}
                  <div className="jfu-body">
                    <div className="jfu-info">
                      <strong title={entry.file.name}>{entry.file.name}</strong>
                      <span>{formatFileSize(entry.file.size)}{!entry.tag && <> · <em>no tag yet</em></>}</span>
                      {entry.error && <span className="jfu-error">{entry.error}</span>}
                    </div>
                    {tagButtons(entry.tag, (tag) => patch(entry.id, { tag }), true)}
                    <input className="jfu-note" aria-label={`Note for ${entry.file.name}`} maxLength={500} disabled={blocked} value={entry.notes} onChange={(event) => patch(entry.id, { notes: event.target.value })} placeholder={asPhoto ? "What does it show? (optional)" : "Note (optional)"} />
                  </div>
                  {!asPhoto && <button type="button" className="jfu-remove flat" aria-label={`Remove ${entry.file.name}`} disabled={blocked} onClick={() => remove(entry.id)}><X size={13} /></button>}
                </article>
              );
            })}
          </div>
          <div className="jfu-footer">
            <button type="button" className="quiet-button" disabled={blocked} onClick={clearAll}>Clear all</button>
            <button type="button" className="gold-button" disabled={blocked} onClick={() => void submit()}>
              {uploading ? <Loader2 className="spin" size={14} /> : null}
              {uploading ? "Adding…" : asPhoto ? `Add ${staged.length} photo${staged.length === 1 ? "" : "s"}` : `Upload ${staged.length} file${staged.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
