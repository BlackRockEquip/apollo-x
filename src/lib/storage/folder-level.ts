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

// ---- Settings > Files: job folders grouped in 100s, and finding a job's folder by its number (2026-11-02, user request:
// "can folders be grouped in 100s?" and "add a search bar so a user can type the job number for the folder") ----

export type FolderGroup = {
  /** Stable id for the group, e.g. "BRE|1100". */
  key: string;
  /** What people see, e.g. "BRE1100 - BRE1199". */
  label: string;
  start: number;
  end: number;
  folders: FolderLevelFolder[];
  fileCount: number;
  sizeBytes: number;
};

/** "BRE1182" -> { prefix: "BRE", digits: "1182" }. Anything that does not end in a (reasonable) number is not a job folder. */
function splitJobNumber(name: string): { prefix: string; digits: string } | null {
  const match = /^(.*?)(\d{1,9})$/.exec(name);
  if (!match) return null;
  const prefix = match[1];
  if (prefix.length > 12) return null; // a long random id that happens to end in digits is not a job number
  return { prefix, digits: match[2] };
}

/**
 * Job folders named like BRE1182 are put in groups of `size` (BRE1100 - BRE1199). Folders that are not numbered (RFQs, Support, Company, ...)
 * come back as `others`. When everything numbered fits in one group there is nothing to group, so all folders stay in `others`.
 * Groups: prefix A-Z, then the highest numbers first (the newest jobs are the ones people look for); folders inside a group: newest first.
 */
export function groupJobFolders(folders: FolderLevelFolder[], size = 100): { others: FolderLevelFolder[]; groups: FolderGroup[] } {
  const others: FolderLevelFolder[] = [];
  const byKey = new Map<string, FolderGroup & { prefix: string; width: number }>();
  const numberOf = new Map<string, number>();
  for (const folder of folders) {
    const parts = splitJobNumber(folder.name);
    if (!parts) { others.push(folder); continue; }
    const value = Number(parts.digits);
    numberOf.set(folder.path, value);
    const start = Math.floor(value / size) * size;
    const key = `${parts.prefix}|${start}`;
    const group = byKey.get(key) ?? { key, label: "", start, end: start + size - 1, folders: [], fileCount: 0, sizeBytes: 0, prefix: parts.prefix, width: 0 };
    group.folders.push(folder);
    group.fileCount += folder.fileCount;
    group.sizeBytes += folder.sizeBytes;
    group.width = Math.max(group.width, parts.digits.length);
    byKey.set(key, group);
  }
  if (byKey.size <= 1) return { others: folders, groups: [] };
  const groups = [...byKey.values()].map(({ prefix, width, ...group }): FolderGroup => {
    const pad = (n: number) => String(n).padStart(Math.max(width, String(size).length), "0");
    group.folders.sort((a, b) => (numberOf.get(b.path) ?? 0) - (numberOf.get(a.path) ?? 0));
    return { ...group, label: `${prefix}${pad(group.start)} - ${prefix}${pad(group.end)}` };
  });
  const prefixOf = (g: FolderGroup) => g.key.slice(0, g.key.lastIndexOf("|"));
  groups.sort((a, b) => prefixOf(a).localeCompare(prefixOf(b), undefined, { sensitivity: "base" }) || b.start - a.start);
  return { others, groups };
}

const squash = (value: string) => value.replace(/\s+/g, "").toLowerCase();

/** Keeps the files whose top-level folder (the job number) contains what was typed; spaces and capitals do not matter. An empty search keeps everything. */
export function filterByTopFolder<T extends { path: string }>(files: T[], term: string): T[] {
  const wanted = squash(term);
  if (!wanted) return files;
  return files.filter((file) => {
    const slash = file.path.indexOf("/");
    return slash > 0 && squash(file.path.slice(0, slash)).includes(wanted);
  });
}

/** Best match first: the exact job number, then folders that start with what was typed, then the rest (each keeping its order). */
export function rankFoldersByTerm<T extends { name: string }>(folders: T[], term: string): T[] {
  const wanted = squash(term);
  if (!wanted) return folders;
  const rank = (name: string) => { const n = squash(name); return n === wanted ? 0 : n.startsWith(wanted) ? 1 : 2; };
  return folders.map((folder, index) => ({ folder, index })).sort((a, b) => rank(a.folder.name) - rank(b.folder.name) || a.index - b.index).map((x) => x.folder);
}
