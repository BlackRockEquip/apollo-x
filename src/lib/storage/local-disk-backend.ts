import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import type { StorageBackend } from "@/lib/storage/types";

// Dev-only fallback so `next dev` works with zero bucket setup when no
// per-company or platform-default STORAGE_* configuration exists — never
// selected in production (see resolveStorageBackend in ./index.ts, which
// throws STORAGE_NOT_CONFIGURED instead of falling back here whenever
// NODE_ENV === "production"). Files live under .local-storage/ at the repo
// root (gitignored) and are served back only by the dev-only route at
// src/app/api/v1/dev-storage/[...key]/route.ts, which itself also refuses
// to run in production as defence in depth.
const ROOT = join(process.cwd(), ".local-storage");

function resolvePath(objectKey: string) {
  const safeSegments = objectKey.split("/").filter((segment) => segment && segment !== "." && segment !== "..");
  const full = normalize(join(ROOT, ...safeSegments));
  const normalizedRoot = normalize(ROOT);
  if (full !== normalizedRoot && !full.startsWith(normalizedRoot + sep)) throw new Error("INVALID_OBJECT_KEY");
  return full;
}

export function createLocalDiskBackend(): StorageBackend {
  return {
    providerName: "LOCAL_DEV",
    async putObject(objectKey, body) {
      const path = resolvePath(objectKey);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },
    async getSignedDownloadUrl(objectKey) {
      // No real signing needed locally — the dev-only route checks
      // NODE_ENV itself, since this backend is never reachable in
      // production in the first place.
      return `/api/v1/dev-storage/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
    },
    async deleteObject(objectKey) {
      const path = resolvePath(objectKey);
      await rm(path, { force: true });
    },
  };
}

export async function readLocalDiskObject(objectKey: string) {
  return readFile(resolvePath(objectKey));
}
