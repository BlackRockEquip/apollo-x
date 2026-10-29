# Engineering: link parts, outwork, photos, files and specs to an item (2026-10-29)

**Request:** "build next linking of parts, specs, photos etc" (the agreed next round after the delivery note register).

## How it works
- Four tables get a nullable `itemId` (FK to `JobItem`, `ON DELETE SET NULL`): `JobPartLine`, `OutworkItem`, `JobAttachment` (photos and files), `JobDimensionReport` (specification reports). Null = the whole job, which is what everything already on file is, so there is no backfill. Removing an item never deletes anything: the records stay on the job as whole-job records (the remove confirmation says how many).
- **Adding**: "For item" picker on the Add parts box, on every line of Record outwork, on the photo and file upload boxes and in the specification report window (picking an item fills an empty Component with the item's component; opened while one item is filtered it defaults to that item). Items must belong to the job (checked on the server).
- **Moving an existing record**: small picker on each part line (under the description), each photo / file, and an Edit field for outwork; one shared endpoint `POST /api/v1/jobs/:id/item-links { kind, recordId, itemId|null }` (kind = part | outwork | attachment | dimension), written to the job's activity ("Part PN-1 linked to item BRE1122-2") and audited. Engineering only.
- **Viewing**: item chip on outwork rows and report rows; an item filter (All items / BRE1122-1 ... / Whole job, with counts) at the top of the Parts, Outwork, Photos, Attachments and Specifications lists, shared between them. The item list on the job screen shows "3 parts · 1 outwork · 2 photos" under each item.
- **Parts merge**: pasting a part already on the job adds to the existing line only when it is for the same item (or both whole-job); the same part for two items stays two lines.
- **Documents**: pick slips (on screen, print, saved PDF) put `[BRE1122-2]` in front of each part's description (looked up through the part line the slip line came from); the parts list (print, PDF, Excel), job history and the outwork delivery note do the same. Stored pick slip lines are untouched, the tag is added when the slip is read.
- Jobs with no items: nothing changes (pickers and filters draw nothing).

## Where
`prisma/schema.prisma` + migration `20261029140000_job_item_links` (**runs on deploy**); `src/lib/jobs/item-model.ts` (matchesItemFilter, normalizeItemFilter, itemOptionLabel, countItemLinks, itemLinkSummary, withItemTag; tests now 30); `validation.ts`, `service.ts` (`resolveJobItem`, `setJobRecordItem`, itemId on parts / outwork / attachments); `src/lib/specifications/service.ts`; `src/lib/inventory/service.ts` (pick slip tags); `src/lib/documents/job-specs.ts`; `src/app/api/v1/jobs/[id]/item-links/route.ts`; `src/components/job-items/ItemLink.tsx` (new, shared pieces) and `JobItemsPanel.tsx`; `JobWorkspace.tsx`; `JobDimensionReports.tsx`; `globals.css` (`ji-link`, `ji-chip`, `ji-filter`).

## Not done
- Parts added by a job kit, by Stock Levels pick slips or by the mechanic's tablet "request pick slip" still land on the whole job (move them with the picker).
- RFQ / Compare quotes and Parts follow-up emails are still per job; the Parts follow-up and outstanding parts pages do not show the item.
- The mechanic tablet cards do not show the item tag yet.
- Specification report counts are not in the item list summary (that list is fetched separately).
- Printed job card still shows item 1 only; Workshop build is separate.
