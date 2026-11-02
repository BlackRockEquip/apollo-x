import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { StoredObjectInfo } from "@/lib/storage/types";

// Lists every file under a real folder on disk (the "Local folder" and dev storage options), as storage keys relative to `rootDir`
// (always "/" separated). Symbolic links are skipped, and the walk stops at `limit` files so a huge folder cannot hang a request.
export async function walkFolder(rootDir: string, startRelative: string, limit = 5000): Promise<StoredObjectInfo[]> {
  const found: StoredObjectInfo[] = [];
  const start = startRelative.split("/").filter((segment) => segment && segment !== ".");
  if (start.includes("..")) throw new Error("INVALID_OBJECT_KEY");
  const pending: string[] = [start.join("/")];
  while (pending.length > 0 && found.length < limit) {
    const relative = pending.pop() as string;
    let names: string[];
    try {
      names = await readdir(relative ? join(rootDir, ...relative.split("/")) : rootDir);
    } catch {
      continue; // a folder that does not exist (yet) is simply empty
    }
    for (const name of names.sort()) {
      if (found.length >= limit) break;
      const childRelative = relative ? `${relative}/${name}` : name;
      let info;
      try { info = await lstat(join(rootDir, ...childRelative.split("/"))); } catch { continue; }
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) pending.push(childRelative);
      else if (info.isFile()) found.push({ key: childRelative, sizeBytes: info.size, modifiedAt: info.mtime });
    }
  }
  return found;
}
