import { z } from "zod";

// Same MIME allowlist and size cap as the existing parts-list spreadsheet
// import (see ALLOWED_PARTS_IMPORT_MIME_TYPES/MAX_PARTS_IMPORT_FILE_BYTES in
// jobs/service.ts) — this feature reuses that exact convention (a JSON body
// carrying {fileName, mimeType, contentBase64}, decoded with
// Buffer.from(..., "base64")) rather than ModApp's multipart FormData, since
// that's how every other file upload in Apollo X already works (see also
// CompanySettingsForm.tsx's logo upload).
export const ALLOWED_IMPORT_MIME_TYPES = [
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
export const MAX_IMPORT_FILE_BYTES = 8_000_000;

// sheetNames is optional and only meaningful for a multi-sheet workbook
// (.xlsx/.xls — a .csv never has more than one): which of the workbook's
// own sheets to read rows from, combined into one column-mapping step and
// one import run (see readUploadedRows/previewImportFile in service.ts).
// Left unset (or empty), the reader falls back to just the workbook's
// first sheet, same as before this option existed.
export const importFileInput = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(3).max(120),
  contentBase64: z.string().min(4),
  sheetNames: z.array(z.string().trim().min(1)).max(50).optional(),
});

// The column-mapping step's output — one entry per target field the user
// actually linked to a column, e.g. { name: "Company Name", mainEmail: "E-mail" }.
// Anything not present here is simply left unmapped, same "blank means leave
// it alone" convention the rest of this import uses.
export const importMapping = z.record(z.string(), z.string());

// 2026-09-11 — "createMissingLocations" (Parts import only — see
// importParts/previewNewBinLocations in service.ts): a bin location code
// that doesn't match this company's existing Storage Locations is left
// unmapped by default, same as an unmatched tax code. This flag opts into
// auto-creating it instead (as a new "Bin" location) — set only once the
// user has confirmed the specific new codes via the preview-locations
// check, never on by default, since silently creating master data the
// user hasn't seen a list of first isn't the same tradeoff as an
// unmatched manufacturer name (which already auto-creates unconditionally
// elsewhere in this file). Harmless for every other import kind, which
// simply never reads it.
export const importRowsInput = importFileInput.extend({ mapping: importMapping, createMissingLocations: z.boolean().optional().default(false) });

export const exportFormatQuery = z.object({ format: z.enum(["xlsx", "csv"]).default("xlsx") });
