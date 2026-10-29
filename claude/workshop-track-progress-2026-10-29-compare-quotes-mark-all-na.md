# Workshop Track progress - 2026-10-29 - Compare quotes: Mark all N/A

## Request
"On compare quotes section, add a way to select all N/A if supplier did not quote."

## What changed
- Quote entry dialog (Compare quotes): new bar under the selected supplier's name, "Did <supplier> not quote this job?".
  - **Mark all N/A** sets N/A on every part line that has no price typed. Lines already priced are kept. When the supplier is partly priced the button shows how many blank lines it will affect.
  - **Clear all N/A (n)** appears once any line is N/A and puts those lines back to blank/available.
  - Buttons are disabled while saving or while a PDF is being analysed, and Mark all N/A is disabled when no blank lines remain.
- Nothing is saved until **Save this supplier** (existing per-supplier save, which already stores N/A lines).

## Files
- src/components/quote-compare/compare-model.ts - `naBarCounts(cells)` returns blank / na / priced counts.
- src/components/quote-compare/QuoteEntryDialog.tsx - bar + `onNaAll` prop.
- src/components/JobWorkspace.tsx - `markAllQuoteLinesNa(rfqRequestId, notAvailable)` updates `quoteDrafts`.
- src/app/globals.css - `.qc-bulkbar`, `.qc-btn.is-small`.
- tests/unit/quote-compare-na-bar.test.ts - 4 tests.

## Notes
No migration, no API change. Push script: push/push-compare-quotes-mark-all-na.ps1.
