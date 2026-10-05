// Document titles — Org Admin > Configuration > Document titles.
// Each document the system prints or saves has a configurable title. The title
// is the heading on the printed/saved document and the name of the saved file:
// "<JOB NUMBER> - <Document title>.pdf", e.g. "BRE1152 - Job History.pdf".
// Shared by the server (saving, validation) and the browser (print headings).

export const DOCUMENT_KINDS = [
  { key: "JOB_CARD", label: "Print Job Card", defaultTitle: "Job Card" },
  { key: "JOB_HISTORY", label: "Print Job History", defaultTitle: "Job History" },
  { key: "JOB_DELIVERY_NOTE", label: "Print Delivery Note", defaultTitle: "Delivery Note" },
  { key: "PICK_SLIP", label: "Print Pick Slip", defaultTitle: "Pick Slip" },
  { key: "PARTS_LIST", label: "Print Parts List", defaultTitle: "Parts List" },
  { key: "OUTWORK_DELIVERY_NOTE", label: "Print Outwork Delivery Note", defaultTitle: "Outwork Delivery Note" },
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]["key"];
export type DocumentTitles = Record<DocumentKind, string>;

export const DEFAULT_DOCUMENT_TITLES = Object.fromEntries(DOCUMENT_KINDS.map((k) => [k.key, k.defaultTitle])) as DocumentTitles;

export const DOCUMENT_TITLE_MAX = 60;
// Titles become part of a file name, so anything Windows/Linux/S3 cannot take in one is not allowed.
export const DOCUMENT_TITLE_FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/;

/** Stored overrides (any shape) merged over the built-in titles. Unknown keys and blanks are ignored. */
export function resolveDocumentTitles(stored: unknown): DocumentTitles {
  const merged: DocumentTitles = { ...DEFAULT_DOCUMENT_TITLES };
  if (stored && typeof stored === "object") {
    for (const kind of DOCUMENT_KINDS) {
      const value = (stored as Record<string, unknown>)[kind.key];
      if (typeof value === "string" && value.trim()) merged[kind.key] = value.trim();
    }
  }
  return merged;
}

/** "BRE1152 - Job History" (no extension). */
export function documentBaseName(jobNumber: string, title: string) {
  return `${jobNumber} - ${title}`;
}
