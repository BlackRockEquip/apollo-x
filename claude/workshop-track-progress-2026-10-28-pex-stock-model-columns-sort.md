# PEX Stock: model column, custom columns, newest job first (2026-10-28)

User: PEX stock table - Model column should list machine model and component model next to each other (e.g. R1700G / C6.6); let a user pick custom columns like Job WIP with Job #, Unit, Make, Model, Status not removable (only add); sort by Job # newest to oldest.

## What changed
- `lib/pex/stock-columns.ts` (pure, shared with the browser): the column catalogue. Locked: Job #, Unit, Make, Model, Status. Optional: Received and Original supply job (both on by default, as the table always had), Machine serial, Component, Component type, Component serial, Part number, Job description, Supply date, Notes. `normalizePexStockColumns` always re-adds the locked five and returns catalogue order. `pexModelText` builds "machine / component".
- `lib/pex/stock-columns-service.ts` + `api/v1/pex/stock-columns/route.ts` (GET / PUT / DELETE): per-user choice stored in the existing `UserTableColumns` table with table key `pex-stock`, so no migration. Anyone who can view PEX Stock can save their own columns.
- `components/PexStockColumnPicker.tsx`: "Columns" button + dialog (same markup as Jobs & WIP), placed beside Print in the toolbar.
- `components/PexStockWorkspace.tsx`: renders the chosen columns; Model cell = machine model / component model; data-search and the server search (`listPexInventory`) now include the component model.
- `lib/pex/service.ts` `listPexInventory`: also selects the extra job fields for the optional columns; reads every matching unit and sorts in code by return-job number, newest first, then cuts the page (`lib/pex/stock-order.ts`). Job number is text, so the trailing digits are compared as a number (BRE1000 before BRE999), same rule as the Jobs list. Units whose job has no number sort last.
- `tests/unit/pex-stock-columns.test.ts`: 11 tests passing.

## Deploy
`push\push-pex-stock-model-columns-sort.ps1`, no migration.

## Notes
- Scrapped jobs tab and PEX Tracking are unchanged (not asked for).
- Columns come out in catalogue order (not draggable) on this table; say if drag-to-reorder is wanted here too.
- Not rendered in a browser here.
