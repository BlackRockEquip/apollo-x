# Workshop Track progress - 2026-10-29 - Engineering: item view and "Where the items are" stepper

Request: the job view was not the same as the mockup for a single item, and the status stepper should work like the mockup.
Decisions (user): select an item in the list and the tabs follow it, a single-item job uses the same item view; stepper shows counts per step and a click moves the selected item.

## What changed
- Header stepper (Engineering, not Field service): `ItemsStepper` = one circle per step with the item count; steps before the least advanced item are green (check), that step solid blue, later occupied steps outlined blue, the selected item's step ringed gold. Folds TO_BE_COLLECTED onto TO_BE_RECEIVED and WAITING_FOR_PARTS onto AWAIT_OUTWORK as the old stepper did.
- Click behaviour: item selected -> `PATCH /api/v1/jobs/:id/items?itemId=` with the step (Engineering documents check first for TO_BE_DELIVERED and later). No item selected and several items -> confirm, then the job status endpoint moves every non-cancelled item. One item -> straight to the job status endpoint. Locked for the Mechanic / view-only roles; CLOSED/CANCELLED keep the "not on the normal flow" note.
- Item list: rows are selectable (click row or component name; click again clears), selected row highlighted with a blue left edge. Columns: Tag, Component (+ model, serial), Machine (+ plant), Status, ETA (+ machinist ETA), Linked records. The old count pills strip inside the list is removed.
- Selected item card: tag, component, status, change status, Edit item, model/serial/part number/machine/machine serial/plant/hours/machinist ETA, work requested, condition on receipt, linked record counts.
- Selection = the existing item filter (`itemFilter`, "all" = every item), so Parts, Outwork, Photos, Files and Specifications follow it; the Activity tab now filters too (`activityMatchesItemFilter`: the item's own entries plus job-wide ones; "Whole job" = job-wide only).
- One-item Engineering jobs: the same panel shows the job's own machine/component fields as a read-only "virtual" item 1 with the job's status; the Machine / component card stays beneath it for editing. "Add item" on that panel creates item 1 (from the job's fields) plus the new one, as before. The separate "Add another item" card (`AddAnotherItem`) is removed.

- Delivery note window: the line table was squashed to a sliver (`.data-table-wrap` max-height/overflow + shrinking grid rows inside the dialog). `.delivery-note-dialog .drawer-fields` now uses `grid-auto-rows: min-content` and the wrap is not height-capped, so all lines show and the window scrolls. Also fixes the outwork delivery note window (same class).

## Files
`src/components/job-items/ItemsStepper.tsx` (new), `JobItemsPanel.tsx`, `src/components/JobWorkspace.tsx`, `src/lib/jobs/item-model.ts` (`stepperDisplayStatus`, `buildStepperNodes`, `activityMatchesItemFilter`), `src/app/globals.css` (`wi-*` stepper, `ji-*` selected row/card), `tests/unit/job-items.test.ts` (38 tests). Push script: `push/push-engineering-item-view.ps1`. No migration.

## Not changed / known gaps
- Parts from job kits / Stock Levels / mechanic pick-slip requests still land on the whole job.
- Mechanic tablet view has no items list; printed job card shows item 1 only.
- A one-item job's item is virtual (not a JobItem row) until a second item is added, so the item tag filters and "For item" pickers only appear once there are two items.
