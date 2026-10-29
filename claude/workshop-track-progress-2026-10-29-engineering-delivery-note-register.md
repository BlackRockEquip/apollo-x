# Engineering: delivery note register (2026-10-29)

**Request:** "create also a register for delivery notes" (after per-item delivery notes). Answers: job-based numbering, Engineering only, register only this round (parts/outwork per item is next).

## How it works
- Every Engineering delivery note is **recorded when printed** (`POST /api/v1/jobs/:id/delivery-notes`) and numbered per job: `<job number>-DN<n>` (BRE1122-DN1, -DN2 ...). The recording happens right after `window.open` so the popup still counts as a user gesture. If recording fails the print window is closed and an error shown - no unnumbered note is printed.
- The number prints above the delivery date (`Delivery note BRE1122-DN2`) and therefore appears in the saved PDF.
- **Register page** `/jobs/delivery-notes` (button on the Jobs page, Engineering only, not for view-only WIP users): newest first; search note / job number / customer (customer only with CUSTOMERS_VIEW); delivery date from-to; columns Note (links to job), Job, Customer, Delivery date, Items, What was on it, Issued by, Issued; paged.
- **Job screen**: "Delivery notes" list (hidden when none), oldest first, **Reprint** prints the note exactly as issued (stored lines, date, notes, number) and creates no new record.
- Works for single-item and multi-item Engineering jobs. Items picked on a multi-item note are stored on the line (`itemId`) so the later "link parts to item" round can use them.
- Number collisions (two people printing at once) retry up to 3 times (`@@unique([jobId, sequence])`, `@@unique([companyId, number])`). Recording is audited.

## Where
- `prisma/schema.prisma` `JobDeliveryNote`; migration `20261029130000_job_delivery_notes` (**runs on deploy**).
- `src/lib/jobs/service.ts` (`recordJobDeliveryNote`, `listJobDeliveryNotes`, `listDeliveryNoteRegister`), `validation.ts`, `item-model.ts` (`deliveryNoteNumber`, `readDeliveryNoteLines`, `deliveryNoteItemCount`; tests now 24).
- `src/app/api/v1/jobs/[id]/delivery-notes/route.ts`, `src/app/(tenant)/jobs/delivery-notes/page.tsx`, `src/components/job-items/JobDeliveryNotes.tsx`, `JobWorkspace.tsx`, `job-specs.ts` (`noteNumber` header line), `jobs/page.tsx`, `globals.css` (`dn-`).

## Not done
- Notes printed before this change are not in the register (there is no record of them).
- Reprint is on the job screen only, not from the register page.
- No void/cancel of an issued note.
- Next (agreed): link parts, outwork, pick slips, specifications and photos to an item. Printed job card still shows item 1; mechanic tablet has no items list; Workshop build separate.
