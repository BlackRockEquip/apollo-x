import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/lib/auth/context-types";
import { ALL_ATTACHMENT_TAGS, fileBadge, formatFileSize, stagedFileProblem, tagAllowed, tagLabel, tagOptions } from "@/lib/jobs/attachment-tags";
import { attachmentUploadInput, jobAttachmentNotesUpdateInput } from "@/lib/jobs/validation";

// 2026-11-03, user request: drag and drop + tags on the job's Photos and Attachments cards.
const h = vi.hoisted(() => ({
  jobFindFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  attFindFirst: vi.fn<(args: unknown) => Promise<unknown>>(),
  attUpdate: vi.fn<(args: unknown) => Promise<unknown>>(),
  attCreate: vi.fn<(args: unknown) => Promise<unknown>>(),
  activityCreate: vi.fn<(args: unknown) => Promise<unknown>>(),
}));

vi.mock("@prisma/client", () => ({ Prisma: { sql: (...a: unknown[]) => a, join: (...a: unknown[]) => a } }));
vi.mock("@/lib/prisma", () => {
  const tx = { jobAttachment: { update: h.attUpdate, create: h.attCreate }, jobActivity: { create: h.activityCreate } };
  return { prisma: { job: { findFirst: h.jobFindFirst }, jobAttachment: { findFirst: h.attFindFirst }, $transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx) } };
});
vi.mock("@/lib/attachments/blob-store", () => ({ ensureJobFolder: vi.fn(), deleteStoredBlob: vi.fn(), readStoredBlob: vi.fn(), sanitizeSegment: (v: string) => v }));
vi.mock("@/lib/attachments/offload", () => ({ offloadJobAttachment: vi.fn(), offloadQuietly: vi.fn() }));
vi.mock("@/lib/notifications/service", () => ({ notifyAdminsAndManagers: vi.fn() }));
vi.mock("@/lib/email", () => ({ isCompanyEmailConfigured: vi.fn() }));
vi.mock("@/lib/audit/service", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/inventory/service", () => ({}));
vi.mock("@/lib/pex/service", () => ({ createPexRecordForSupplyJob: vi.fn(), syncPexRedeployment: vi.fn(), syncPexStatusFromJobStatus: vi.fn(), syncPexAwaitCoreFromDeliveryDate: vi.fn(), syncPexUnitDescription: vi.fn() }));

import { addJobAttachment, updateJobAttachmentNotes } from "@/lib/jobs/service";

function ctx(): RequestContext {
  return { userId: "u1", companyId: "c1", tenantRole: "ADMIN", correlationId: "corr", tenantPermissions: new Set(["JOBS_EDIT"]), moduleAccess: new Map([["JOBS_WIP", "FULL"]]) } as unknown as RequestContext;
}

describe("attachment tag helpers", () => {
  it("photos and documents each have their own tag list, both ending in Other", () => {
    expect(tagOptions(true)).toEqual(["BEFORE", "AFTER", "FAULT", "SERIAL_PLATE", "OTHER"]);
    expect(tagOptions(false)).toEqual(["DRAWING", "QUOTE", "CERTIFICATE", "REPORT", "OTHER"]);
    expect(ALL_ATTACHMENT_TAGS).toHaveLength(9);
    expect(tagLabel("SERIAL_PLATE")).toBe("Serial plate");
    expect(tagLabel(null)).toBe("");
  });

  it("allows no tag, and only a tag from the right list", () => {
    expect(tagAllowed(true, null)).toBe(true);
    expect(tagAllowed(true, "FAULT")).toBe(true);
    expect(tagAllowed(true, "QUOTE")).toBe(false);
    expect(tagAllowed(false, "QUOTE")).toBe(true);
    expect(tagAllowed(false, "BEFORE")).toBe(false);
    expect(tagAllowed(false, "OTHER")).toBe(true);
  });

  it("labels a file by its extension", () => {
    expect(fileBadge("Drawing_rev3.pdf")).toEqual({ label: "PDF", tone: "pdf" });
    expect(fileBadge("site-notes.docx")).toEqual({ label: "DOCX", tone: "doc" });
    expect(fileBadge("costs.XLSX")).toEqual({ label: "XLSX", tone: "sheet" });
    expect(fileBadge("noext", "application/zip").label).toBe("ZIP");
  });

  it("formats sizes and rejects files that cannot be added", () => {
    expect(formatFileSize(182_000)).toBe("182 KB");
    expect(formatFileSize(2_400_000)).toBe("2.4 MB");
    expect(formatFileSize(0)).toBe("—");
    expect(stagedFileProblem({ name: "a.jpg", size: 9_000_000, type: "image/jpeg" }, true)).toMatch(/8 MB/);
    expect(stagedFileProblem({ name: "a.pdf", size: 100, type: "application/pdf" }, true)).toMatch(/PNG, JPG or WebP/);
    expect(stagedFileProblem({ name: "a.pdf", size: 100, type: "application/pdf" }, false)).toBeNull();
    expect(stagedFileProblem({ name: "a.jpg", size: 0, type: "image/jpeg" }, true)).toMatch(/empty/);
  });
});

describe("attachment validation", () => {
  it("accepts a document tag on upload and refuses an unknown one", () => {
    const base = { fileName: "a.pdf", mimeType: "application/pdf", contentBase64: "AAAA" };
    expect(attachmentUploadInput.parse({ ...base, tag: "DRAWING" }).tag).toBe("DRAWING");
    expect(() => attachmentUploadInput.parse({ ...base, tag: "NOPE" })).toThrow();
  });

  it("a change needs a note or a tag, and either may be sent alone", () => {
    expect(() => jobAttachmentNotesUpdateInput.parse({})).toThrow();
    expect(jobAttachmentNotesUpdateInput.parse({ tag: null }).tag).toBeNull();
    expect(jobAttachmentNotesUpdateInput.parse({ notes: "x" }).notes).toBe("x");
  });
});

describe("tags on the server", () => {
  beforeEach(() => {
    Object.values(h).forEach((fn) => fn.mockReset());
    h.attUpdate.mockResolvedValue({ id: "a1" });
    h.activityCreate.mockResolvedValue({});
  });

  it("re-tagging from the chip changes only the tag", async () => {
    h.attFindFirst.mockResolvedValue({ id: "a1", fileName: "x.pdf", isPhoto: false });
    await updateJobAttachmentNotes(ctx(), "j1", "a1", { tag: "DRAWING" });
    const data = (h.attUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).toEqual({ tag: "DRAWING" });
    expect(JSON.stringify(h.activityCreate.mock.calls[0][0])).toContain("tag updated");
  });

  it("editing the note leaves the tag alone, and 'No tag' clears it", async () => {
    h.attFindFirst.mockResolvedValue({ id: "a1", fileName: "x.jpg", isPhoto: true });
    await updateJobAttachmentNotes(ctx(), "j1", "a1", { notes: "  cracked " });
    expect((h.attUpdate.mock.calls[0][0] as { data: unknown }).data).toEqual({ notes: "cracked" });
    await updateJobAttachmentNotes(ctx(), "j1", "a1", { tag: null });
    expect((h.attUpdate.mock.calls[1][0] as { data: unknown }).data).toEqual({ tag: null });
  });

  it("refuses a photo tag on a document and a document tag on a photo", async () => {
    h.attFindFirst.mockResolvedValue({ id: "a1", fileName: "x.pdf", isPhoto: false });
    await expect(updateJobAttachmentNotes(ctx(), "j1", "a1", { tag: "BEFORE" })).rejects.toThrow("INVALID_ATTACHMENT_TAG");
    h.attFindFirst.mockResolvedValue({ id: "a2", fileName: "x.jpg", isPhoto: true });
    await expect(updateJobAttachmentNotes(ctx(), "j1", "a2", { tag: "QUOTE" })).rejects.toThrow("INVALID_ATTACHMENT_TAG");
    expect(h.attUpdate).not.toHaveBeenCalled();
  });

  it("an upload with the wrong kind of tag is refused before anything is stored", async () => {
    h.jobFindFirst.mockResolvedValue({ id: "j1", companyId: "c1", jobNumber: "BRE1" });
    const body = { fileName: "x.jpg", mimeType: "image/jpeg", contentBase64: "AAAA" };
    await expect(addJobAttachment(ctx(), "j1", { ...body, isPhoto: true, tag: "QUOTE" })).rejects.toThrow("INVALID_ATTACHMENT_TAG");
    await expect(addJobAttachment(ctx(), "j1", { ...body, mimeType: "application/pdf", fileName: "x.pdf", tag: "AFTER" })).rejects.toThrow("INVALID_ATTACHMENT_TAG");
    expect(h.attCreate).not.toHaveBeenCalled();
  });
});
