# Workshop Track progress — 2026-10-29 — Jobs & WIP: expand a job to see its items

**Request (Engineering):** the Jobs & WIP list did not let you expand a job to see its items like the list mockup (JobsList).

## What changed
- `src/app/(tenant)/jobs/page.tsx`: multi-item jobs (`jobItems.length > 1`) get a `.jobs-chev` button before the job number, `data-multi-item="1"` / `data-job-id` on the row, and a following `tr.jobs-item-row` with one full-width `td.table-state` holding the item list (tag, component + model/serial, status pill, machine, ETA with "Nd late" in red). Search text also covers the items' component/model/serial/part number/machine/plant.
- `src/components/JobsWipItemsToggle.tsx` (new): chevron click flips `data-expanded`; toolbar button "Show all items" / "Hide items" (hidden if no multi-item job on the page); state kept in `sessionStorage` (`apollox.jobsWipExpanded`); MutationObserver keeps counts right across the 20 s auto refresh.
- `src/lib/jobs/service.ts`: list `jobItems` select widened (id, sequence, status, component, componentModel, componentSerial, componentPartNumber, machineMake, machineModel, plantNumber, etaDate, mechanicEtaDate).
- `src/app/globals.css`: `.jobs-chev`, `.jobs-item-*` rules; sub-row shown only when the previous row is `data-expanded="1"`, hidden when the job row is filtered out (`style*="display: none"`), not printed.

## Notes
- Sub-rows use `td.table-state`, so TableColumnFilters, Print and Email skip them (still one row per job).
- Item ETA falls back to the job ETA when the item has none. Item rows are not links (the job screen has no item deep-link yet).
- No migration. Push: `push\push-engineering-jobs-wip-items.ps1`.
