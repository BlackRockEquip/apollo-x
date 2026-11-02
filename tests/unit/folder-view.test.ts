import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const attachmentFindMany = vi.fn();
const attachmentFindFirst = vi.fn();
const jobFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { attachment: { findMany: (...a: unknown[]) => attachmentFindMany(...a), findFirst: (...a: unknown[]) => attachmentFindFirst(...a) }, job: { findFirst: (...a: unknown[]) => jobFindFirst(...a) } } }));

const listObjects = vi.fn();
const getSignedDownloadUrl = vi.fn(async (key: string, name: string) => `https://files.example/${encodeURIComponent(key)}?n=${encodeURIComponent(name)}`);
let provider = "R2";
vi.mock("@/lib/attachments/blob-store", () => ({
  tryGetBackend: async () => ({ providerName: provider, listObjects, getSignedDownloadUrl }),
  keyPrefix: (backend: { providerName: string }, companyId: string) => (backend.providerName === "LOCAL_FOLDER" ? "" : `${companyId}/`),
  jobFolderName: (job: { jobNumber: string | null; draftNumber: string | null }, fallback: string) => job.jobNumber ?? job.draftNumber ?? fallback,
}));

import { cleanFolderPath, filterByTopFolder, foldLevel, folderBreadcrumbs, groupJobFolders, isInsideFolder, keyToPath, mergeFolderFiles, rankFoldersByTerm, type FolderFile, type FolderLevelFolder } from "@/lib/storage/folder-level";
import { walkFolder } from "@/lib/storage/walk-folder";
import { getStorageFileUrl, listStorageFolder } from "@/lib/storage/folder-view";
import type { RequestContext } from "@/lib/auth/context-types";

function ctxWith(opts: { permissions?: string[]; role?: string | null; platform?: string[]; modules?: Record<string, string> } = {}): RequestContext {
  return {
    userId: "u1", displayName: "Tester", companyId: "co1", companyInternalCode: "CO", tenantRole: (opts.role ?? "COMPANY_ADMIN") as never,
    tenantPermissions: new Set(opts.permissions ?? ["JOBS_VIEW", "COMPANY_SETTINGS_VIEW"]) as never,
    platformPermissions: new Set(opts.platform ?? []) as never,
    supportAccessId: null, supportMode: null,
    moduleAccess: new Map(Object.entries(opts.modules ?? { JOBS_WIP: "FULL" })) as never,
    correlationId: "c1",
  };
}
const row = (objectKey: string, extra: Record<string, unknown> = {}) => ({ objectKey, sizeBytes: 1000, createdAt: new Date("2026-10-30T08:00:00Z"), notes: null, uploadedBy: { displayName: "Ann" }, ...extra });

describe("folder helpers", () => {
  it("cleans paths and refuses ones that leave the storage", () => {
    expect(cleanFolderPath("//BRE1182/./docs/")).toBe("BRE1182/docs");
    expect(cleanFolderPath("a\\b")).toBe("a/b");
    expect(cleanFolderPath(null)).toBe("");
    expect(() => cleanFolderPath("BRE1182/../other")).toThrow("NOT_FOUND");
    expect(() => cleanFolderPath("a\u0000b")).toThrow("NOT_FOUND");
  });

  it("builds crumbs, checks containment and strips the bucket prefix", () => {
    expect(folderBreadcrumbs("a/b")).toEqual([{ name: "a", path: "a" }, { name: "b", path: "a/b" }]);
    expect(isInsideFolder("BRE1/x.pdf", "BRE1")).toBe(true);
    expect(isInsideFolder("BRE12/x.pdf", "BRE1")).toBe(false);
    expect(isInsideFolder("anything", "")).toBe(true);
    expect(keyToPath("co1/BRE1/x.pdf", "co1/")).toBe("BRE1/x.pdf");
    expect(keyToPath("other/BRE1/x.pdf", "co1/")).toBeNull();
    expect(keyToPath("BRE1/x.pdf", "")).toBe("BRE1/x.pdf");
  });

  it("shows one level: sub-folders with counts, then the files in it", () => {
    const files: FolderFile[] = [
      { path: "BRE2/b.pdf", sizeBytes: 5, modifiedAt: null, known: true },
      { path: "BRE10/a.pdf", sizeBytes: 7, modifiedAt: null, known: true },
      { path: "BRE10/c.pdf", sizeBytes: 3, modifiedAt: null, known: true },
      { path: "readme.txt", sizeBytes: 1, modifiedAt: null, known: true },
    ];
    const top = foldLevel(files, "");
    expect(top.folders.map((f) => [f.name, f.fileCount, f.sizeBytes])).toEqual([["BRE2", 1, 5], ["BRE10", 2, 10]]);
    expect(top.files.map((f) => f.name)).toEqual(["readme.txt"]);
    expect(foldLevel(files, "BRE10").files.map((f) => f.name)).toEqual(["a.pdf", "c.pdf"]);
  });

  it("merges filed files with what is on the server", () => {
    const known: FolderFile[] = [{ path: "J/a.pdf", sizeBytes: 1, modifiedAt: "2026-10-01T00:00:00.000Z", known: true }, { path: "J/gone.pdf", sizeBytes: 2, modifiedAt: null, known: true }];
    const merged = mergeFolderFiles(known, [{ path: "J/a.pdf", sizeBytes: 9, modifiedAt: "2026-10-05T00:00:00.000Z" }, { path: "J/stray.txt", sizeBytes: 4, modifiedAt: null }]);
    expect(merged.find((f) => f.path === "J/a.pdf")).toMatchObject({ known: true, sizeBytes: 9, modifiedAt: "2026-10-05T00:00:00.000Z" });
    expect(merged.find((f) => f.path === "J/gone.pdf")).toMatchObject({ known: true, missing: true });
    expect(merged.find((f) => f.path === "J/stray.txt")).toMatchObject({ known: false });
    expect(mergeFolderFiles(known, null)).toBe(known);
  });
});

describe("walkFolder", () => {
  it("lists files at every depth with / keys, skipping symlinks, and refuses ..", async () => {
    const root = await mkdtemp(join(tmpdir(), "walk-"));
    await mkdir(join(root, "BRE1", "sub"), { recursive: true });
    await writeFile(join(root, "BRE1", "a.txt"), "hello");
    await writeFile(join(root, "BRE1", "sub", "b.txt"), "hi");
    await writeFile(join(root, "top.txt"), "x");
    await symlink(join(root, "top.txt"), join(root, "BRE1", "link.txt")).catch(() => undefined);
    const all = await walkFolder(root, "");
    expect(all.map((f) => f.key).sort()).toEqual(["BRE1/a.txt", "BRE1/sub/b.txt", "top.txt"]);
    expect(all.find((f) => f.key === "BRE1/a.txt")?.sizeBytes).toBe(5);
    expect((await walkFolder(root, "BRE1")).map((f) => f.key).sort()).toEqual(["BRE1/a.txt", "BRE1/sub/b.txt"]);
    expect(await walkFolder(root, "missing")).toEqual([]);
    expect((await walkFolder(root, "", 2)).length).toBe(2);
    await expect(walkFolder(root, "../etc")).rejects.toThrow("INVALID_OBJECT_KEY");
  });
});

describe("listStorageFolder / getStorageFileUrl", () => {
  beforeEach(() => {
    attachmentFindMany.mockReset(); attachmentFindFirst.mockReset(); jobFindFirst.mockReset(); listObjects.mockReset(); getSignedDownloadUrl.mockClear();
    provider = "R2";
    jobFindFirst.mockResolvedValue({ id: "job1", jobNumber: "BRE1182", draftNumber: "d1" });
  });

  it("a job's folder lists the filed files of that job only", async () => {
    attachmentFindMany.mockResolvedValue([row("co1/BRE1182/BRE1182 - Job Card.pdf"), row("co1/BRE1182/photo.jpg", { notes: "front" })]);
    const listing = await listStorageFolder(ctxWith(), { kind: "job", jobId: "job1" }, null, false);
    expect(listing).toMatchObject({ configured: true, provider: "R2", path: "BRE1182", rootPath: "BRE1182", everything: false, canSeeEverything: false });
    expect(listing.files.map((f) => f.name)).toEqual(["BRE1182 - Job Card.pdf", "photo.jpg"]);
    expect(listing.files[1]).toMatchObject({ notes: "front", uploadedBy: "Ann", known: true });
    expect(attachmentFindMany.mock.calls[0][0].where).toMatchObject({ companyId: "co1", status: "COMMITTED", objectKey: { startsWith: "co1/BRE1182/" } });
  });

  it("a job's view cannot be pointed at another folder", async () => {
    await expect(listStorageFolder(ctxWith(), { kind: "job", jobId: "job1" }, "BRE9999", false)).rejects.toThrow("NOT_FOUND");
    await expect(listStorageFolder(ctxWith(), { kind: "job", jobId: "job1" }, "BRE1182/../BRE9999", false)).rejects.toThrow("NOT_FOUND");
    jobFindFirst.mockResolvedValue(null);
    await expect(listStorageFolder(ctxWith(), { kind: "job", jobId: "nope" }, null, false)).rejects.toThrow("NOT_FOUND");
  });

  it("checks who may look", async () => {
    await expect(listStorageFolder(ctxWith({ role: "USER" }), { kind: "job", jobId: "job1" }, null, false)).rejects.toThrow();
    await expect(listStorageFolder(ctxWith({ role: "WIP_VIEWER" }), { kind: "job", jobId: "job1" }, null, false)).rejects.toThrow();
    await expect(listStorageFolder(ctxWith({ permissions: ["JOBS_VIEW"] }), { kind: "company" }, null, false)).rejects.toThrow();
    await expect(listStorageFolder(ctxWith({ permissions: ["COMPANY_SETTINGS_VIEW"] }), { kind: "job", jobId: "job1" }, null, false)).rejects.toThrow();
    await expect(listStorageFolder(ctxWith({ modules: {} }), { kind: "job", jobId: "job1" }, null, false)).rejects.toThrow();
  });

  it("the whole storage shows job folders; a normal user cannot read the real server folder", async () => {
    attachmentFindMany.mockResolvedValue([row("co1/BRE1182/a.pdf"), row("co1/BRE1183/b.pdf"), row("co1/RFQs/q.pdf")]);
    const listing = await listStorageFolder(ctxWith(), { kind: "company" }, "", true);
    expect(listing.folders.map((f) => f.name)).toEqual(["BRE1182", "BRE1183", "RFQs"]);
    expect(listing.everything).toBe(false);
    expect(listObjects).not.toHaveBeenCalled();
  });

  it("a platform administrator can read everything on the server, and sees what is not filed or missing", async () => {
    attachmentFindMany.mockResolvedValue([row("co1/BRE1182/a.pdf"), row("co1/BRE1182/gone.pdf")]);
    listObjects.mockResolvedValue([{ key: "co1/BRE1182/a.pdf", sizeBytes: 2048, modifiedAt: new Date("2026-10-31T10:00:00Z") }, { key: "co1/BRE1182/dropped.xlsx", sizeBytes: 10, modifiedAt: null }]);
    const listing = await listStorageFolder(ctxWith({ platform: ["PLATFORM_COMPANIES_EDIT"] }), { kind: "job", jobId: "job1" }, null, true);
    expect(listing).toMatchObject({ everything: true, canSeeEverything: true });
    expect(listObjects).toHaveBeenCalledWith("co1/BRE1182", 5000);
    const byName = Object.fromEntries(listing.files.map((f) => [f.name, f]));
    expect(byName["a.pdf"]).toMatchObject({ known: true, sizeBytes: 2048 });
    expect(byName["gone.pdf"]).toMatchObject({ known: true, missing: true });
    expect(byName["dropped.xlsx"]).toMatchObject({ known: false });
  });

  it("a folder on the server has no company prefix", async () => {
    provider = "LOCAL_FOLDER";
    attachmentFindMany.mockResolvedValue([row("BRE1182/a.pdf")]);
    const listing = await listStorageFolder(ctxWith(), { kind: "job", jobId: "job1" }, null, false);
    expect(listing.files.map((f) => f.path)).toEqual(["BRE1182/a.pdf"]);
    expect(attachmentFindMany.mock.calls[0][0].where.objectKey).toEqual({ startsWith: "BRE1182/" });
  });

  it("opens a filed file for anyone who may see the folder, and a stray file only for a platform administrator", async () => {
    attachmentFindFirst.mockResolvedValueOnce({ fileName: "BRE1182 - Job Card.pdf", mimeType: "application/pdf" });
    const filed = await getStorageFileUrl(ctxWith(), { kind: "job", jobId: "job1" }, "BRE1182/BRE1182 - Job Card.pdf");
    expect(filed.fileName).toBe("BRE1182 - Job Card.pdf");
    expect(getSignedDownloadUrl).toHaveBeenCalledWith("co1/BRE1182/BRE1182 - Job Card.pdf", "BRE1182 - Job Card.pdf", 300, "inline");

    attachmentFindFirst.mockResolvedValueOnce(null);
    await expect(getStorageFileUrl(ctxWith(), { kind: "job", jobId: "job1" }, "BRE1182/stray.xlsx")).rejects.toThrow("NOT_FOUND");

    attachmentFindFirst.mockResolvedValueOnce(null);
    const stray = await getStorageFileUrl(ctxWith({ platform: ["PLATFORM_COMPANIES_EDIT"] }), { kind: "job", jobId: "job1" }, "BRE1182/stray.xlsx");
    expect(stray.fileName).toBe("stray.xlsx");
    expect(getSignedDownloadUrl).toHaveBeenLastCalledWith("co1/BRE1182/stray.xlsx", "stray.xlsx", 300, "attachment");
  });

  it("will not open a file outside the job's folder", async () => {
    await expect(getStorageFileUrl(ctxWith(), { kind: "job", jobId: "job1" }, "BRE9999/a.pdf")).rejects.toThrow("NOT_FOUND");
    await expect(getStorageFileUrl(ctxWith(), { kind: "job", jobId: "job1" }, "")).rejects.toThrow("NOT_FOUND");
  });
});


const folder = (name: string, fileCount = 1, sizeBytes = 100): FolderLevelFolder => ({ name, path: name, fileCount, sizeBytes });

describe("job folders grouped in 100s", () => {
  it("groups BRE1182-style folders by hundreds, newest group and folder first, and keeps unnumbered folders apart", () => {
    const { others, groups } = groupJobFolders([folder("Company"), folder("RFQs"), folder("BRE1182", 3, 30), folder("BRE1101", 2, 20), folder("BRE1099"), folder("BRE1200"), folder("Support")]);
    expect(others.map((f) => f.name)).toEqual(["Company", "RFQs", "Support"]);
    expect(groups.map((g) => g.label)).toEqual(["BRE1200 - BRE1299", "BRE1100 - BRE1199", "BRE1000 - BRE1099"]);
    const middle = groups[1];
    expect(middle.folders.map((f) => f.name)).toEqual(["BRE1182", "BRE1101"]);
    expect(middle.fileCount).toBe(5);
    expect(middle.sizeBytes).toBe(50);
  });

  it("keeps different prefixes apart and pads the label to the number width", () => {
    const { groups } = groupJobFolders([folder("BRE0005"), folder("BRE0150"), folder("ENG42"), folder("ENG250")]);
    expect(groups.map((g) => g.label)).toEqual(["BRE0100 - BRE0199", "BRE0000 - BRE0099", "ENG200 - ENG299", "ENG000 - ENG099"]);
  });

  it("does not group when everything numbered fits in one group", () => {
    const input = [folder("RFQs"), folder("BRE1101"), folder("BRE1182")];
    const out = groupJobFolders(input);
    expect(out.groups).toEqual([]);
    expect(out.others).toEqual(input);
  });

  it("treats a long random id ending in digits as an unnumbered folder", () => {
    const { others } = groupJobFolders([folder("cmvz7ovqv055d6x135"), folder("BRE1"), folder("BRE250")]);
    expect(others.map((f) => f.name)).toContain("cmvz7ovqv055d6x135");
  });

  it("supports another group size", () => {
    const { groups } = groupJobFolders([folder("J1"), folder("J12"), folder("J25")], 10);
    expect(groups.map((g) => g.label)).toEqual(["J20 - J29", "J10 - J19", "J00 - J09"]);
  });
});

describe("finding a job folder by number", () => {
  const files = [{ path: "BRE1182/a.pdf" }, { path: "BRE1182/Support/b.pdf" }, { path: "BRE1183/a.pdf" }, { path: "RFQs/BRE1182/x.pdf" }, { path: "loose.pdf" }];
  it("keeps files whose top-level folder contains the text, ignoring capitals and spaces", () => {
    expect(filterByTopFolder(files, "bre 1182").map((f) => f.path)).toEqual(["BRE1182/a.pdf", "BRE1182/Support/b.pdf"]);
    expect(filterByTopFolder(files, "BRE118")).toHaveLength(3);
    expect(filterByTopFolder(files, "rfq").map((f) => f.path)).toEqual(["RFQs/BRE1182/x.pdf"]);
    expect(filterByTopFolder(files, "  ")).toBe(files);
  });
  it("ranks the exact job number first, then folders starting with the text", () => {
    const ranked = rankFoldersByTerm([folder("XBRE118"), folder("BRE11820"), folder("BRE1182")], "bre1182");
    expect(ranked.map((f) => f.name)).toEqual(["BRE1182", "BRE11820", "XBRE118"]);
  });
});

describe("listStorageFolder search", () => {
  beforeEach(() => { attachmentFindMany.mockReset(); listObjects.mockReset(); provider = "R2"; });

  it("searches the top level of the whole storage: narrows the query and returns the best match first", async () => {
    attachmentFindMany.mockResolvedValue([row("co1/BRE11820/a.pdf"), row("co1/BRE1182/a.pdf"), row("co1/BRE1182/Support/b.pdf")]);
    const listing = await listStorageFolder(ctxWith(), { kind: "company" }, "", false, " bre 1182 ");
    expect(listing.search).toBe("bre 1182");
    expect(attachmentFindMany.mock.calls[0][0].where.objectKey).toEqual({ startsWith: "co1/", contains: "bre1182", mode: "insensitive" });
    expect(listing.folders.map((f) => f.name)).toEqual(["BRE1182", "BRE11820"]);
    expect(listing.folders[0].fileCount).toBe(2);
  });

  it("ignores the search inside a folder and for a job's own folder", async () => {
    attachmentFindMany.mockResolvedValue([row("co1/BRE1182/a.pdf")]);
    const inside = await listStorageFolder(ctxWith(), { kind: "company" }, "BRE1182", false, "zzz");
    expect(inside.search).toBe("");
    expect(attachmentFindMany.mock.calls[0][0].where.objectKey).toEqual({ startsWith: "co1/BRE1182/" });
    jobFindFirst.mockResolvedValue({ id: "j1", jobNumber: "BRE1182", draftNumber: null });
    const job = await listStorageFolder(ctxWith(), { kind: "job", jobId: "j1" }, "", false, "zzz");
    expect(job.search).toBe("");
  });

  it("also narrows what is read from the server for a platform administrator", async () => {
    attachmentFindMany.mockResolvedValue([]);
    listObjects.mockResolvedValue([{ key: "co1/BRE1182/x.bin", sizeBytes: 5, modifiedAt: null }, { key: "co1/ABC9/y.bin", sizeBytes: 5, modifiedAt: null }]);
    const listing = await listStorageFolder(ctxWith({ platform: ["PLATFORM_COMPANIES_EDIT"] }), { kind: "company" }, "", true, "1182");
    expect(listing.folders.map((f) => f.name)).toEqual(["BRE1182"]);
  });

  it("returns an empty search as no search", async () => {
    attachmentFindMany.mockResolvedValue([row("co1/BRE1182/a.pdf")]);
    const listing = await listStorageFolder(ctxWith(), { kind: "company" }, "", false, "   ");
    expect(listing.search).toBe("");
    expect(attachmentFindMany.mock.calls[0][0].where.objectKey).toEqual({ startsWith: "co1/" });
  });
});
