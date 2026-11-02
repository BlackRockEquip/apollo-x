// Pure helpers for the "View folder" screens (no database, no storage): turn a flat list of file paths into one folder level.
// 2026-11-02, user request: "is there a way to view what is on the server folders? like a button that says view folder?"

export type FolderFile = {
  /** Path from the storage root, e.g. "BRE1182/BRE1182 - Job Card.pdf". */
  path: string;
  sizeBytes: number;
  modifiedAt: string | null;
  /** true = filed by Apollo X (it has a record); false = found in the folder on the server but not filed by the system. */
  known: boolean;
  /** Only when the real folder was read: a filed file that is no longer on the server. */
  missing?: boolean;
  notes?: string | null;
  uploadedBy?: string | null;
};

export type FolderLevelFile = FolderFile & { name: string };
export type FolderLevelFolder = { name: string; path: string; fileCount: number; sizeBytes: number };

/** "a//b/./c/" -> "a/b/c". A path that tries to leave the storage ("..") or holds control characters is refused. */
export function cleanFolderPath(raw: string | null | undefined): string {
  const segments = (raw ?? "").replace(/\\/g, "/").split("/").map((s) => s.trim()).filter((s) => s && s !== ".");
  for (const segment of segments) {
    if (segment === ".." || /[\u0000-\u001f]/.test(segment)) throw new Error("NOT_FOUND");
  }
  return segments.join("/");
}

export function folderBreadcrumbs(folder: string): Array<{ name: string; path: string }> {
  const parts = folder.split("/").filter(Boolean);
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join("/") }));
}

/** Is `path` the folder itself or something inside it? ("" = the whole storage). */
export function isInsideFolder(path: string, folder: string): boolean {
  return !folder || path === folder || path.startsWith(`${folder}/`);
}

/** The storage key -> the path shown to people (the company prefix of shared buckets is not part of what they see). Null when the key is outside the prefix. */
export function keyToPath(key: string, prefix: string): string | null {
  if (prefix && !key.startsWith(prefix)) return null;
  const path = key.slice(prefix.length);
  return path ? path : null;
}

/** Files found by the database and files found on the server, as one list; a file in both is "known" (and not missing). */
export function mergeFolderFiles(known: FolderFile[], physical: Array<{ path: string; sizeBytes: number; modifiedAt: string | null }> | null): FolderFile[] {
  if (!physical) return known;
  const onServer = new Map(physical.map((file) => [file.path, file]));
  const merged: FolderFile[] = known.map((file) => {
    const there = onServer.get(file.path);
    return there ? { ...file, sizeBytes: there.sizeBytes, modifiedAt: there.modifiedAt ?? file.modifiedAt } : { ...file, missing: true };
  });
  const knownPaths = new Set(known.map((file) => file.path));
  for (const file of physical) if (!knownPaths.has(file.path)) merged.push({ ...file, known: false });
  return merged;
}

/** One level of the folder tree: the sub-folders directly inside `folder` (with how many files they hold) and the files directly in it. */
export function foldLevel(files: FolderFile[], folder: string): { folders: FolderLevelFolder[]; files: FolderLevelFile[] } {
  const prefix = folder ? `${folder}/` : "";
  const folders = new Map<string, FolderLevelFolder>();
  const direct: FolderLevelFile[] = [];
  for (const file of files) {
    if (!file.path.startsWith(prefix)) continue;
    const rest = file.path.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf("/");
    if (slash < 0) {
      direct.push({ ...file, name: rest });
      continue;
    }
    const name = rest.slice(0, slash);
    const entry = folders.get(name) ?? { name, path: `${prefix}${name}`, fileCount: 0, sizeBytes: 0 };
    entry.fileCount += 1;
    entry.sizeBytes += file.sizeBytes;
    folders.set(name, entry);
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  return { folders: [...folders.values()].sort(byName), files: direct.sort(byName) };
}
