# Workshop Track progress - 2026-10-29 - Engineering: item tabs, job tags, report counts, tablet tags, job card with all items

User list (decisions in brackets): parts from job kits / Stock Levels / mechanic pick slip requests land on the whole job (no decision - left, use the item picker); RFQ / Compare quotes / follow-up emails per job (leave per job); tablet cards (show item tag); specification report counts in the item list summary (show); printed job card shows item 1 only (add all items); button to print job tags (consider a specific / thermal printer later); tabs work and look like the mockup screenshot.

## Tabs like the mockup
- `ItemHeader` (new): card above the tabs with the item tag, component and a Change status dropdown that moves that item (same path as the stepper: `PATCH /api/v1/jobs/:id/items?itemId=`, documents check from TO_BE_DELIVERED). No item selected on a multi-item job shows "JOB <no.>" / "All items" with no Change status (use the stepper, which asks before moving all). One-item jobs show item 1.
- `JobTabBar variant="item"`: white strip joined to the header card, 14px bold tabs, gold underline on the active tab, grey count pills.
- `buildJobTabs({ itemView: true, reportsCount, activityCount })`: tabs named Details, Parts, Outwork, Specifications (count), Photos & files, Activity (count). Counts follow the selected item (`matchesItemFilter` / `activityMatchesItemFilter`). Other builds / field service keep Overview, Parts list, Photos & attachments.
- Activity tab (item view): always open, "Today 09:12" / "29 Oct" left column, entry and who beside it, filtered to the selected item plus job-wide entries.
- Not done: "Reassign machinist" button from the mockup (machinists are assigned per job, not per item, in the data model today); Photos and Files stay one tab.
- The selected-item card in the list is now "Details of <tag>" with Edit item (tag / title / status moved to the header card).

## Report counts
- `getJobScoped` also returns `dimensionReports: { id, itemId }`; `countItemLinks({ reports })`, `ItemLinkCounts.reports`, summary text "N reports", included in the link total. `JobDimensionReports` gets `onChanged` so counts refresh after saving / deleting a report.

## Tablet cards
- `buildTabletCard({ itemTag })` -> `card.itemTag`; `TabletPartCard` shows a tag chip (`jt-card-item`) under the part number.

## Job card with every item
- `jobCardItemsTable(job)` (job-specs.ts): null for < 2 items, else Item / Component / Model, serial, part no. / Machine / Work requested rows. Used by the saved PDF (`buildJobCardSpec`) and the print window (`printJobCard`, sheet grows past one page if needed). One-item jobs keep the Machine / component block.

## Print job tags
- `src/lib/labels/job-tags.ts`: label sizes (100x50 default, 76x51, 100x150), `buildJobTagLabels`, `expandCopies` (1-20), `renderTagsHtml` (page per label, `@page` = label size, optional auto print / preview).
- `src/lib/labels/code128.ts`: Code 128 (set B) modules + SVG; checked against the python-barcode library.
- `src/lib/printing/label-printers.ts`: `LabelPrinterDriver` interface, registry `LABEL_PRINTERS` (only `browser` for now), settings (printer + size) kept in this browser's localStorage because a label printer belongs to one workstation. To connect a thermal printer: write a driver (receives the `TagLabel[]`, size, copies; may render ZPL / ESC-POS itself) and add it to `LABEL_PRINTERS`; the dialog lists it automatically.
- `PrintTagsDialog` (items ticked: selected item, else all; copies; size; printer; live preview). Opened from the item list "Print tags" button and Print menu > "Job tags". Printing starts inside the click (pop-up rule).

## Files
New: `src/components/job-items/ItemHeader.tsx`, `PrintTagsDialog.tsx`, `src/lib/labels/{job-tags,code128}.ts`, `src/lib/printing/label-printers.ts`. Changed: `JobWorkspace.tsx`, `JobItemsPanel.tsx`, `JobDimensionReports.tsx`, `job-screen/{JobTabBar,job-tabs,TabletPartCard,tablet-model}`, `lib/jobs/{service,item-model}.ts`, `lib/documents/job-specs.ts`, `globals.css`, `tests/unit/job-items.test.ts` (81 tests incl. the old suites). Push script `push/push-engineering-item-tabs-tags.ps1`. No migration.

## Still open
- Parts from job kits / Stock Levels pick slips / mechanic pick slip requests land on the whole job (item picker moves them).
- RFQ, Compare quotes and parts follow-up emails are per job (as decided).
- A thermal printer driver is not written yet (needs the printer model / connection).
