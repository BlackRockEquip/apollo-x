# Jobs & WIP: drag to rearrange columns (2026-10-27)

User: "Job Wip table, custom columns, make it that a user can drag and rearrange the columns as they require."

## What changed
- `src/components/JobsWipColumnPicker.tsx`: the Columns dialog is now two lists. "On the list, left to right" shows the ticked columns in table order, each with a grip handle (pointer-based drag, works with mouse and touch, list auto-scrolls near its edge; handle also takes the up/down arrow keys). Job # is locked first. "Not shown" lists the rest; ticking one adds it to the end of the list, unticking returns it to Not shown. Save sends the ordered array.
- `src/lib/jobs/wip-columns.ts`: `normalizeJobsWipColumns` keeps submitted order (Job # first, unknown ids and duplicates dropped) instead of re-sorting to catalogue order; new `moveWipColumn` helper used by the drag.
- `tests/unit/wip-columns-order.test.ts`: 6 tests, passing.
- No change needed to the API, service or jobs/page.tsx: the saved JSON array was already an ordered list and the table renders `columns.map(...)` in that order. Column widths (localStorage, by column id) follow each column to its new position. Reset to default restores the default order.

## Deploy
`push\push-wip-column-drag-order.ps1`, no migration.

## Notes
- Order is per user and saved to the account (same as which columns are shown). Not rendered in a browser here, so please try a drag on the device. Dragging the table headers directly was not added; say if you want that too.
