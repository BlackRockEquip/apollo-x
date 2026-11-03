// 2026-11-03, user request: drag and drop on the job's Photos and Attachments cards, tag each file once it is loaded, and tag (or
// re-tag) it later from the list. Photos keep the field-service tags they always had; documents get their own short list. The tag is
// stored as plain text on JobAttachment.tag, so no migration is needed.

export const PHOTO_TAGS = ["BEFORE", "AFTER", "FAULT", "SERIAL_PLATE", "OTHER"] as const;
export const DOCUMENT_TAGS = ["DRAWING", "QUOTE", "CERTIFICATE", "REPORT", "OTHER"] as const;
export const ALL_ATTACHMENT_TAGS = ["BEFORE", "AFTER", "FAULT", "SERIAL_PLATE", "DRAWING", "QUOTE", "CERTIFICATE", "REPORT", "OTHER"] as const;

export const ATTACHMENT_TAG_LABELS: Record<string, string> = {
  BEFORE: "Before", AFTER: "After", FAULT: "Fault", SERIAL_PLATE: "Serial plate",
  DRAWING: "Drawing", QUOTE: "Quote", CERTIFICATE: "Certificate", REPORT: "Report", OTHER: "Other",
};

export const MAX_ATTACHMENT_BYTES = 8_000_000;
export const PHOTO_ACCEPT = "image/png,image/jpeg,image/webp";
const PHOTO_TYPES = PHOTO_ACCEPT.split(",");

export function tagOptions(isPhoto: boolean): readonly string[] {
  return isPhoto ? PHOTO_TAGS : DOCUMENT_TAGS;
}

export function tagLabel(tag: string | null | undefined): string {
  if (!tag) return "";
  return ATTACHMENT_TAG_LABELS[tag] || tag;
}

/** A tag is allowed on a photo only from the photo list, on a document only from the document list (empty = no tag). */
export function tagAllowed(isPhoto: boolean, tag: string | null | undefined): boolean {
  if (!tag) return true;
  return tagOptions(isPhoto).includes(tag);
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

export type FileBadgeTone = "pdf" | "doc" | "sheet" | "image" | "zip" | "other";

/** The short label and colour family for a file's badge (PDF, DOCX, XLSX ...), taken from its name. */
export function fileBadge(fileName: string, mimeType?: string | null): { label: string; tone: FileBadgeTone } {
  const dot = fileName.lastIndexOf(".");
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  const label = (ext || (mimeType || "").split("/")[1] || "file").replace(/[^a-z0-9]/g, "").slice(0, 4).toUpperCase() || "FILE";
  if (ext === "pdf" || mimeType === "application/pdf") return { label, tone: "pdf" };
  if (["doc", "docx", "txt"].includes(ext)) return { label, tone: "doc" };
  if (["xls", "xlsx", "csv"].includes(ext)) return { label, tone: "sheet" };
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext) || (mimeType || "").startsWith("image/")) return { label, tone: "image" };
  if (ext === "zip") return { label, tone: "zip" };
  return { label, tone: "other" };
}

/** Why a picked file cannot be added, or null when it can. The server still has the final say on the file type. */
export function stagedFileProblem(file: { name: string; size: number; type: string }, asPhoto: boolean): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) return "Larger than 8 MB.";
  if (file.size === 0) return "The file is empty.";
  if (asPhoto && !PHOTO_TYPES.includes(file.type)) return "Photos must be PNG, JPG or WebP.";
  return null;
}
