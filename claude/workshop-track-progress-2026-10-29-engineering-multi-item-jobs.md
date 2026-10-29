# Engineering: several items on one job (2026-10-29)

**Request:** a customer can send several items in for repair/engineering and the system must capture them on ONE job (Blackrock sends 5 items to Hi-Gear; Hi-Gear creates one job with all 5 listed). Decisions from the user: quote and invoice are excluded until the accounting side exists; this applies to the Engineering build only (Workshop will get its own user type and changes); the job status shows "Mixed" with a bar.

## How it works
- **Job vs item.** Job-level details (customer, PO/reference, date received, job type, transport, sales rep, notes, default ETA) are entered once. Each item has its own component/model/serial/part number, machine make/model/serial, plant number, hours, work requested, condition on receipt, status, ETA and machinist ETA.
- **No rows = ordinary job.** A new `JobItem` table holds the items. A job with no item rows is exactly what exists today, so no existing job is changed or backfilled. The first time a second item is added to an ordinary job, its current machine/component details become item 1.
- **Mirroring.** Item 1 (lowest sequence still on the job) is mirrored onto the job's own machine/component columns so the Jobs list, search, PEX description and printed documents keep working. `updateJob` ignores those fields once a job has items (they change through the items).
- **Tags.** job number + `-` + sequence (e.g. BRE1122-3). Sequences are never renumbered when an item is removed.
- **Status.** Each item has its own status from the Engineering flow (plus Cancelled). Job.status = the least advanced non-cancelled item (all cancelled = Cancelled). While items differ the header and list show **Mixed** with one colour segment per item and "N of M ready" (ready = To be delivered or later). The job-level stepper moves every non-cancelled item; close sets all items Closed; reopen sets all to the chosen step. Items cannot be added, moved or removed on a complete/closed/cancelled job (reopen first).
- **Engineering only.** Server checks `industryBuild === ENGINEERING` (and not Field service). Other builds never see the table or the endpoints.

## Where
- Schema + migrations: `JobItem`, `JobActivityType` ITEM_ADDED/ITEM_UPDATED/ITEM_REMOVED (`20261029120000_job_item_activity_types`, `20261029120100_job_items`).
- Rules: `src/lib/jobs/item-model.ts` (tags, roll-up, first-item mirror, spreadsheet paste parser) with `tests/unit/job-items.test.ts` (17 tests).
- Service: `src/lib/jobs/service.ts` (createJob takes `items`; addJobItem / updateJobItem / removeJobItem; roll-up; status sync in changeJobStatus/closeJob/reopenJob), `validation.ts` (jobItemInput, jobItemsInput, jobItemUpdateInput).
- API: `POST /api/v1/jobs/[id]/items`, `PATCH|DELETE /api/v1/jobs/[id]/items?itemId=`.
- UI: `src/components/job-items/` (JobItemsEditor = New Job table, JobItemsPanel + AddAnotherItem = job screen, ItemsStatusBadge = Mixed bar, item-draft helpers); hooks in `JobWorkspace.tsx` and `app/(tenant)/jobs/page.tsx`; `ji-` CSS block in `globals.css`.

## Not in this change (next)
- Parts list, outwork, pick slips, specification (dimension) reports and photos are still per job. Next step is an optional "for item" link on each.
- Delivery notes per item / partial delivery ("create delivery note for ready items").
- Printed job card and PDFs show item 1 only (the job's mirrored fields); add an items table.
- Mechanic tablet view does not list items yet.
- Quote and invoice per item once accounting exists.
- Workshop build: separate user type and changes.
