# Workshop Track - progress 2026-11-02: Print job tags on the Workshop build (pr34)

**Request:** "add the print job tags to the workshop side as well"

- "Job tags" was only in the Print menu / item list of the Engineering build. It is now in the Print menu for every job (not for mechanic / view-only users, same as the other prints).
- Workshop jobs have no items, so the dialog prints ONE tag for the whole job: tag text and barcode = the job number (BRE1182, not BRE1182-1), no "Item 1 of 1", and no item list to tick. Component, model / serial / part no., machine, plant number, customer and date in come from the job's own fields. Copies, label size and printer work as before. Field service jobs also get a tag (job number + customer).
- Engineering item tags unchanged.
- Files: `src/lib/labels/job-tags.ts` (`wholeJob` option; position hidden when empty), `components/job-items/PrintTagsDialog.tsx` (`wholeJob` prop), `components/JobWorkspace.tsx` (`wholeJobTagItem`, menu entry always on), `tests/unit/job-tags-whole-job.test.ts` (3 tests; 59 with the job-items suite pass). Push: `push/push-workshop-job-tags.ps1`. No migration.
- Not done: no "Print tags" button beside the job header on the Workshop build (Print menu only); thermal printer driver still not written.
