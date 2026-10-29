# Workshop Track progress — 2026-10-29 — Document header / footer text prints + Settings preview

**Request:** the Company / Branding "Document header text" and "Document footer text" boxes did nothing (found: stored, never read by any print). User asked for a mockup, then: header above the logo, footer as mocked (above page number), and "when building add a preview next to the header and footer".

## What changed
- `src/lib/documents/doc-text.ts` (new): single source for the two bands - CSS, HTML builders (escaped), footer height estimate, page-level carriers (`<html data-doc-header-text / data-doc-footer-text>`), `setDocTextsInPage`.
- `src/lib/documents/powered-by.ts`: `withPoweredBy` now also injects the texts. Wrapped docs: header in the wrapper table's repeating `thead` (every page), footer fixed above the Powered-by lines with the repeating spacer sized to the footer. Zero-margin sheet docs (Job Card, Job History): header inserted inside each `.sheet`, `.sheet` padding-bottom grown for the footer. "Powered by" switched off no longer returns early if texts exist.
- `src/lib/documents/pdf.ts`: `DocLetterhead.headerText/footerText`; header at top of every page above the logo (content start moved down), footer above the page number line (content bottom moved up). Long text just reserves more room.
- `company-settings-service.ts` `getCompanyPrintDetails` returns `headerText/footerText` (flows into `getCompanyLetterhead` PDFs).
- `PoweredByFlag` + tenant `layout.tsx`: carry the texts to the page; `router.refresh()` after saving in Settings updates them.
- `DocTextPreview.tsx` (new) + `CompanySettingsForm.tsx`: preview next to each box (top crop for header, bottom crop for footer, "Whole page" modal), live from what is typed, uses logo + company details from the form; counters (header max 500, footer max 2000, the existing server limits).
- `globals.css`: `.dtp-*`. Tests: `tests/unit/doc-text.test.ts`.

## Checked
- vitest doc-text + powered-by: 17 pass. Headless Chrome prints (A4, 12 mm margin): header + footer on every page of 1- and 3-page documents, nothing overprinted, with and without Powered-by; sheet-style doc stays one page. Preview rendered and viewed in Chrome.
- Not checked: the real Job Card / Job History with a very full page (header + footer shrink the flexible blocks; if a card ever spills to a second page, tell me which one).
- No migration. Push: `push\push-document-header-footer-text.ps1`.
